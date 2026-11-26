package io.github.hcostamcsys.legendadupla.voz;

import java.util.ArrayList;

/**
 * Limpeza da voz (ruído e parte do eco) com o DeepFilterNet3 (Schröter et al., 2023; github.com/Rikorose/DeepFilterNet,
 * licença MIT/Apache-2.0), a 48 kHz, em fluxo: recebe a voz aos poucos e entrega, na mesma ordem e com o mesmo
 * número de amostras (sem atraso), a voz limpa.
 *
 * Reproduz o caminho offline oficial (df/enhance.py + DfNet.forward do deepfilternet3.py, pacote 0.5.6):
 *  - STFT de 960 pontos, passo 480 (20 ms / 10 ms), janela de Vorbis, normalização 1/960 só na análise;
 *  - entradas da rede: energia em 32 bandas ERB em dB, normalizada por média exponencial (α = 0,99, ÷40), e o
 *    espectro complexo das 96 primeiras faixas normalizado pela média exponencial do módulo (raiz);
 *  - "olhar à frente" de 2 quadros: o quadro t da rede recebe as entradas do quadro t+2 (zeros depois do fim);
 *  - acima de 4,8 kHz: espectro × ganho da banda ERB; até 4,8 kHz: filtro profundo de 5 quadros (t−2 … t+2)
 *    sobre o espectro original (não o mascarado);
 *  - o áudio ganha 960 zeros no fim e a saída é lida a partir da amostra 480 (atraso da STFT).
 *
 * Estéreo: a rede roda uma vez, sobre a média dos dois canais (as vozes costumam estar no centro), e os mesmos
 * ganhos e filtros são aplicados a cada canal: a imagem estéreo da voz não oscila.
 *
 * Áudio longo: o processamento de sinal é contínuo; só a rede roda em blocos de "bloco" quadros, cada um
 * começando "aquecimento" quadros antes (estado interno da rede assentado) e indo "CAUDA" quadros além (lado
 * do olhar à frente). A emenda dos blocos acontece no espectro, e a síntese com sobreposição a suaviza.
 * Com o áudio inteiro num bloco só, o resultado é o mesmo do enhance() oficial.
 * Java puro (sem Android).
 */
public final class LimpadorVoz {

    /** Recebe cada pedaço pronto (n amostras por canal, a partir do índice 0). Os vetores são reaproveitados. */
    public interface Saida {
        void entregar(float[] esq, float[] dir, int n) throws Exception;
    }

    public static final int TAXA = 48000;
    static final int N = 960, H = 480, F = N / 2 + 1;
    static final int OLHAR = 2;
    static final float ALFA = 0.99f;
    static final int CAUDA = 8;
    /** Larguras das 32 bandas ERB (erb_fb(48000, 960, 32, 2) do libDF; conferidas com o pacote oficial). */
    static final int[] LARGURAS = {2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 7, 7, 8, 10, 12, 13, 15, 18, 20, 24, 28,
            31, 37, 42, 50, 56, 67};
    private static final float[] JANELA = new float[N];
    private static final float WNORM = 1f / (N * (float) N / (2 * H));
    private static final int[] BANDA = new int[F];

    static {
        for (int i = 0; i < N; i++) {
            double s = Math.sin(0.5 * Math.PI * (i + 0.5) / (N / 2));
            JANELA[i] = (float) Math.sin(0.5 * Math.PI * s * s);
        }
        int k = 0;
        for (int b = 0; b < LARGURAS.length; b++) for (int j = 0; j < LARGURAS[b]; j++) BANDA[k++] = b;
        if (k != F) throw new IllegalStateException("bandas ERB");
    }

    private final ModeloLimpeza modelo;
    private final int bloco, aquecimento;
    private final Saida saida;
    private final Fft fft = new Fft(N);
    private final double[] re = new double[N], im = new double[N];

    // Entrada à espera de completar um passo
    private final float[] accE = new float[H], accD = new float[H];
    private int nAcc = 0;
    private long recebidas = 0, entregues = 0;
    private int descartar = N - H;
    private boolean fim = false;

    // Memórias da STFT (análise e síntese), por canal
    private final float[][] memA = new float[2][N - H], memS = new float[2][N - H];
    // Estados da normalização das entradas da rede
    private final float[] estErb = new float[ModeloLimpeza.ERB], estUnit = new float[ModeloLimpeza.DF];

    // Quadros guardados: espectro (re, im intercalados) de cada canal, e entradas da rede
    private final ArrayList<float[][]> espectros = new ArrayList<>();
    private long baseEsp = 0;
    private final ArrayList<float[]> entradas = new ArrayList<>(); // 32 (ERB) + 96 (re) + 96 (im)
    private long baseEnt = 0;
    private long total = 0;   // quadros analisados
    private long proximo = 0; // primeiro quadro ainda sem rede

    private final float[] saiE = new float[H], saiD = new float[H];

    /** bloco e aquecimento em quadros de 10 ms (por exemplo 1000 e 100). */
    public LimpadorVoz(ModeloLimpeza modelo, int bloco, int aquecimento, Saida saida) {
        if (bloco < 1 || aquecimento < 0) throw new IllegalArgumentException("bloco");
        this.modelo = modelo;
        this.bloco = bloco;
        this.aquecimento = aquecimento;
        this.saida = saida;
        for (int i = 0; i < estErb.length; i++) estErb[i] = -60f + i * (-30f / (estErb.length - 1));
        for (int i = 0; i < estUnit.length; i++) estUnit[i] = 0.001f + i * (-0.0009f / (estUnit.length - 1));
    }

    /** Amostras já entregues por canal. */
    public long entregues() {
        return entregues;
    }

    public void adicionar(float[] esq, float[] dir, int ini, int n) throws Exception {
        if (fim) throw new IllegalStateException("já terminou");
        recebidas += n;
        empurrar(esq, dir, ini, n);
        processar();
    }

    private void empurrar(float[] esq, float[] dir, int ini, int n) {
        while (n > 0) {
            int k = Math.min(n, H - nAcc);
            System.arraycopy(esq, ini, accE, nAcc, k);
            System.arraycopy(dir, ini, accD, nAcc, k);
            nAcc += k;
            ini += k;
            n -= k;
            if (nAcc == H) {
                analisar();
                nAcc = 0;
            }
        }
    }

    /** Fim do áudio: entrega o resto. */
    public void terminar() throws Exception {
        if (fim) return;
        float[] z = new float[N];
        empurrar(z, z, 0, N); // como o enhance(): N zeros no fim; o que sobrar de um passo incompleto é ignorado
        fim = true;
        processar();
    }

    private void analisar() {
        float[][] q = new float[2][];
        for (int c = 0; c < 2; c++) {
            float[] x = c == 0 ? accE : accD;
            float[] mem = memA[c];
            for (int i = 0; i < N - H; i++) {
                re[i] = mem[i] * JANELA[i];
                im[i] = 0;
            }
            for (int i = 0; i < H; i++) {
                re[N - H + i] = x[i] * JANELA[N - H + i];
                im[N - H + i] = 0;
            }
            System.arraycopy(x, 0, mem, 0, H); // N − H == H
            fft.transformar(re, im, false);
            float[] s = new float[2 * F];
            for (int k = 0; k < F; k++) {
                s[2 * k] = (float) re[k] * WNORM;
                s[2 * k + 1] = (float) im[k] * WNORM;
            }
            q[c] = s;
        }
        espectros.add(q);
        // Entradas da rede, a partir da média dos canais
        float[] l = q[0], r = q[1];
        float[] ent = new float[ModeloLimpeza.ERB + 2 * ModeloLimpeza.DF];
        int k = 0;
        for (int b = 0; b < LARGURAS.length; b++) {
            float soma = 0, inv = 1f / LARGURAS[b];
            for (int j = 0; j < LARGURAS[b]; j++, k++) {
                float mr = 0.5f * (l[2 * k] + r[2 * k]), mi = 0.5f * (l[2 * k + 1] + r[2 * k + 1]);
                soma += (mr * mr + mi * mi) * inv;
            }
            float v = (float) Math.log10(soma + 1e-10f) * 10f;
            estErb[b] = v * (1 - ALFA) + estErb[b] * ALFA;
            ent[b] = (v - estErb[b]) / 40f;
        }
        for (int f = 0; f < ModeloLimpeza.DF; f++) {
            float mr = 0.5f * (l[2 * f] + r[2 * f]), mi = 0.5f * (l[2 * f + 1] + r[2 * f + 1]);
            float mod = (float) Math.sqrt(mr * mr + mi * mi);
            estUnit[f] = mod * (1 - ALFA) + estUnit[f] * ALFA;
            float d = (float) Math.sqrt(estUnit[f]);
            ent[ModeloLimpeza.ERB + f] = mr / d;
            ent[ModeloLimpeza.ERB + ModeloLimpeza.DF + f] = mi / d;
        }
        entradas.add(ent);
        total++;
    }

    private void processar() throws Exception {
        while (true) {
            if (!fim) {
                if (total < proximo + bloco + CAUDA + OLHAR) return;
                rodarBloco(proximo, proximo + bloco);
            } else {
                if (proximo >= total) return;
                rodarBloco(proximo, Math.min(proximo + bloco, total));
            }
        }
    }

    private void rodarBloco(long a, long b) throws Exception {
        long s0 = Math.max(0, a - aquecimento);
        long e = fim ? total : b + CAUDA;
        int t = (int) (e - s0);
        int E = ModeloLimpeza.ERB, D = ModeloLimpeza.DF;
        float[] fe = new float[t * E], fs = new float[2 * t * D];
        for (int i = 0; i < t; i++) {
            long g = s0 + i + OLHAR;
            if (g >= total) continue; // zeros depois do fim
            float[] ent = entradas.get((int) (g - baseEnt));
            System.arraycopy(ent, 0, fe, i * E, E);
            System.arraycopy(ent, E, fs, i * D, D);
            System.arraycopy(ent, E + D, fs, t * D + i * D, D);
        }
        float[] m = new float[t * E], c = new float[t * D * 2 * ModeloLimpeza.ORDEM];
        modelo.rodar(fe, fs, t, m, c);

        float[] y = new float[2 * F];
        for (long g = a; g < b; g++) {
            int i = (int) (g - s0);
            for (int ch = 0; ch < 2; ch++) {
                float[] x = espectro(g, ch);
                // Acima das faixas do filtro profundo: ganho da banda
                for (int f = D; f < F; f++) {
                    float gn = m[i * E + BANDA[f]];
                    y[2 * f] = x[2 * f] * gn;
                    y[2 * f + 1] = x[2 * f + 1] * gn;
                }
                // Filtro profundo: Σ_n X[g−2+n] · C[g][n]
                java.util.Arrays.fill(y, 0, 2 * D, 0f);
                for (int n = 0; n < ModeloLimpeza.ORDEM; n++) {
                    float[] xs = espectro(g - OLHAR + n, ch);
                    if (xs == null) continue;
                    for (int f = 0; f < D; f++) {
                        int ci = ((i * D + f) * ModeloLimpeza.ORDEM + n) * 2;
                        float cr = c[ci], cim = c[ci + 1];
                        float xr = xs[2 * f], xi = xs[2 * f + 1];
                        y[2 * f] += xr * cr - xi * cim;
                        y[2 * f + 1] += xr * cim + xi * cr;
                    }
                }
                sintetizar(y, ch, ch == 0 ? saiE : saiD);
            }
            emitir();
        }
        proximo = b;
        // Descarta o que não será mais usado
        long guardarEsp = proximo - OLHAR;
        while (baseEsp < guardarEsp && !espectros.isEmpty()) {
            int k = (int) Math.min(espectros.size(), guardarEsp - baseEsp);
            espectros.subList(0, k).clear();
            baseEsp += k;
        }
        long guardarEnt = Math.max(0, proximo - aquecimento) + OLHAR;
        while (baseEnt < guardarEnt && !entradas.isEmpty()) {
            int k = (int) Math.min(entradas.size(), guardarEnt - baseEnt);
            entradas.subList(0, k).clear();
            baseEnt += k;
        }
    }

    private float[] espectro(long g, int ch) {
        if (g < 0 || g >= total) return null; // antes do começo ou depois do fim: zeros
        return espectros.get((int) (g - baseEsp))[ch];
    }

    private void sintetizar(float[] y, int ch, float[] out) {
        for (int k = 0; k < F; k++) {
            re[k] = y[2 * k];
            im[k] = y[2 * k + 1];
        }
        im[0] = 0;
        im[F - 1] = 0; // a realfft ignora as partes imaginárias de 0 e de Nyquist
        for (int k = F; k < N; k++) {
            re[k] = re[N - k];
            im[k] = -im[N - k];
        }
        fft.transformar(re, im, true);
        float[] mem = memS[ch];
        for (int i = 0; i < H; i++) out[i] = (float) re[i] * JANELA[i] + mem[i];
        for (int i = 0; i < N - H; i++) mem[i] = (float) re[H + i] * JANELA[H + i];
    }

    private void emitir() throws Exception {
        int ini = 0;
        if (descartar > 0) {
            ini = Math.min(descartar, H);
            descartar -= ini;
        }
        long resta = recebidas - entregues;
        int q = (int) Math.min(H - ini, resta);
        if (q <= 0) return;
        if (ini > 0) {
            float[] e = new float[q], d = new float[q];
            System.arraycopy(saiE, ini, e, 0, q);
            System.arraycopy(saiD, ini, d, 0, q);
            saida.entregar(e, d, q);
        } else {
            saida.entregar(saiE, saiD, q);
        }
        entregues += q;
    }
}
