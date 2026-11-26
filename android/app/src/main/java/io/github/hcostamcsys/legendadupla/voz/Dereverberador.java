package io.github.hcostamcsys.legendadupla.voz;

import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Tira o eco (reverberação tardia) da voz com o WPE — Weighted Prediction Error (Nakatani et al., 2010;
 * Yoshioka & Nakatani, 2012), na forma em blocos do nara_wpe (wpe_v7, statistics_mode "full", psd_context 0;
 * github.com/fgnt/nara_wpe, licença MIT). É um filtro linear: prevê a cauda do eco a partir do áudio de 24 a
 * 180 ms antes e a subtrai; não inventa som. Os primeiros ~24 ms (reflexões que o ouvido junta à voz) ficam.
 *
 * A 48 kHz: STFT de 1536 pontos (32 ms), passo 384 (8 ms), janela de Hann na análise e na síntese.
 * Só até 8 kHz (acima disso o eco pesa pouco e a conta seria 3× maior; o resultado medido foi o mesmo).
 * Em blocos de "bloco" quadros: em cada bloco, 3 iterações de (potência → correlações → filtro). O filtro é
 * estimado na média dos canais e aplicado a cada canal. O passado vem do bloco anterior (sem emenda).
 * Em fluxo: mesma ordem, mesmo número de amostras, sem atraso. Java puro (sem Android).
 */
public final class Dereverberador implements AutoCloseable {

    public static final int TAXA = 48000;
    static final int N = 1536, H = 384, F = N / 2 + 1;
    static final int SOBRE = N / H; // 4 quadros cobrem cada amostra
    public static final int COEFS = 20, ATRASO = 3, ITERACOES = 3;
    static final int KMAX = (int) Math.round(8000.0 * N / TAXA); // faixa 256 = 8 kHz
    private static final float[] JANELA = new float[N];

    static {
        for (int i = 0; i < N; i++) JANELA[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); // Hann periódica
    }

    private static final float NORMA_SINTESE = 2f / 3f; // Σ Hann² com passo N/4 = 3/2

    private final int bloco;
    private final LimpadorVoz.Saida saida;
    private final Fft fft = new Fft(N);
    private final double[] re = new double[N], im = new double[N];
    private final ExecutorService grupo;
    private final int nThreads;

    // Entrada: as últimas N − H amostras (janela anterior) + o passo atual
    private final float[][] hist = new float[2][N];
    private int nAcc = 0;
    private long recebidas = 0, entregues = 0;
    private boolean fim = false;

    // Quadros: espectro re/im intercalado de cada canal (F faixas); índice global com base
    private final ArrayList<float[][]> quadros = new ArrayList<>();
    private long base = 0;
    private long total = 0, proximo = 0;

    // Síntese: soma com sobreposição; ola[c][i] = amostra (primeiraOla + i)
    private final float[][] ola = new float[2][N];
    private long sintetizados = 0;
    private final float[] outE = new float[H], outD = new float[H];
    private long descartar = N - H; // a 1ª amostra útil sai no fim do 4º quadro

    public Dereverberador(int bloco, int threads, LimpadorVoz.Saida saida) {
        if (bloco < 8) throw new IllegalArgumentException("bloco");
        this.bloco = bloco;
        this.saida = saida;
        this.nThreads = Math.max(1, threads);
        this.grupo = nThreads > 1 ? Executors.newFixedThreadPool(nThreads) : null;
    }

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
            System.arraycopy(esq, ini, hist[0], N - H + nAcc, k);
            System.arraycopy(dir, ini, hist[1], N - H + nAcc, k);
            nAcc += k;
            ini += k;
            n -= k;
            if (nAcc == H) {
                analisar();
                for (int c = 0; c < 2; c++) System.arraycopy(hist[c], H, hist[c], 0, N - H);
                nAcc = 0;
            }
        }
    }

    public void terminar() throws Exception {
        if (fim) return;
        // Completa com zeros até a última amostra recebida sair inteira (N − H) e fecha o passo
        int falta = (N - H) + (nAcc == 0 ? 0 : H - nAcc);
        float[] z = new float[falta];
        empurrar(z, z, 0, falta);
        fim = true;
        processar();
    }

    private void analisar() {
        float[][] q = new float[2][];
        for (int c = 0; c < 2; c++) {
            for (int i = 0; i < N; i++) {
                re[i] = hist[c][i] * JANELA[i];
                im[i] = 0;
            }
            fft.transformar(re, im, false);
            float[] s = new float[2 * F];
            for (int k = 0; k < F; k++) {
                s[2 * k] = (float) re[k];
                s[2 * k + 1] = (float) im[k];
            }
            q[c] = s;
        }
        quadros.add(q);
        total++;
    }

    private void processar() throws Exception {
        while (total - proximo >= bloco || (fim && total > proximo)) {
            long b = Math.min(proximo + bloco, total);
            filtrarBloco(proximo, b);
            for (long j = proximo; j < b; j++) sintetizar(j);
            proximo = b;
            long guardar = proximo - (ATRASO + COEFS - 1);
            if (guardar > base) {
                int k = (int) Math.min(quadros.size(), guardar - base);
                quadros.subList(0, k).clear();
                base += k;
            }
        }
    }

    private float[] q(long j, int c) {
        if (j < base || j >= total) return null; // antes do começo: zeros
        return quadros.get((int) (j - base))[c];
    }

    /** WPE no bloco [a, b): estima o filtro de cada faixa na média dos canais e filtra os dois canais. */
    private void filtrarBloco(long a, long b) throws Exception {
        final int t = (int) (b - a);
        final int K = KMAX + 1;
        // Média dos canais (re, im) nas faixas filtradas, do passado necessário até o fim do bloco
        final int passado = ATRASO + COEFS - 1;
        final int L = t + passado;
        final float[] yRe = new float[K * L], yIm = new float[K * L]; // [faixa][quadro a − passado + i]
        for (int i = 0; i < L; i++) {
            long j = a - passado + i;
            float[] l = q(j, 0), r = q(j, 1);
            if (l == null) continue;
            for (int k = 0; k < K; k++) {
                yRe[k * L + i] = 0.5f * (l[2 * k] + r[2 * k]);
                yIm[k * L + i] = 0.5f * (l[2 * k + 1] + r[2 * k + 1]);
            }
        }
        final double[] xRe = new double[K * t], xIm = new double[K * t];
        for (int k = 0; k < K; k++) {
            for (int i = 0; i < t; i++) {
                xRe[k * t + i] = yRe[k * L + passado + i];
                xIm[k * t + i] = yIm[k * L + passado + i];
            }
        }
        final double[] gRe = new double[K * COEFS], gIm = new double[K * COEFS];
        final double[] inv = new double[K * t];
        for (int it = 0; it < ITERACOES; it++) {
            // Potência inversa, com piso de 1e-10 × o maior valor do bloco (_stable_positive_inverse)
            double maior = 0;
            for (int i = 0; i < K * t; i++) {
                double p = xRe[i] * xRe[i] + xIm[i] * xIm[i];
                inv[i] = p;
                if (p > maior) maior = p;
            }
            double piso = 1e-10 * maior;
            for (int i = 0; i < K * t; i++) inv[i] = maior == 0 ? 1 : 1 / Math.max(inv[i], piso);
            emParalelo(K, (k0, k1) -> {
                double[] R = new double[2 * COEFS * COEFS], P = new double[2 * COEFS];
                double[] yt = new double[2 * COEFS];
                for (int k = k0; k < k1; k++) {
                    java.util.Arrays.fill(R, 0);
                    java.util.Arrays.fill(P, 0);
                    int off = k * L;
                    for (int i = 0; i < t; i++) {
                        double w = inv[k * t + i];
                        // ỹ_m = Y[t − ATRASO − m]
                        for (int m = 0; m < COEFS; m++) {
                            int idx = off + passado + i - ATRASO - m;
                            yt[2 * m] = yRe[idx];
                            yt[2 * m + 1] = yIm[idx];
                        }
                        double yr = yRe[off + passado + i], yi = yIm[off + passado + i];
                        for (int m = 0; m < COEFS; m++) {
                            double ar = w * yt[2 * m], ai = w * yt[2 * m + 1];
                            // R[m][n] += w ỹ_m conj(ỹ_n), só n ≥ m
                            int lin = 2 * m * COEFS;
                            for (int n = m; n < COEFS; n++) {
                                double br = yt[2 * n], bi = yt[2 * n + 1];
                                R[lin + 2 * n] += ar * br + ai * bi;
                                R[lin + 2 * n + 1] += ai * br - ar * bi;
                            }
                            // P[m] += w ỹ_m conj(y)
                            P[2 * m] += ar * yr + ai * yi;
                            P[2 * m + 1] += ai * yr - ar * yi;
                        }
                    }
                    for (int m = 0; m < COEFS; m++) { // completa a parte de baixo (hermitiana)
                        for (int n = 0; n < m; n++) {
                            R[2 * (m * COEFS + n)] = R[2 * (n * COEFS + m)];
                            R[2 * (m * COEFS + n) + 1] = -R[2 * (n * COEFS + m) + 1];
                        }
                    }
                    double[] g = resolver(R, P, COEFS);
                    for (int m = 0; m < COEFS; m++) {
                        gRe[k * COEFS + m] = g[2 * m];
                        gIm[k * COEFS + m] = g[2 * m + 1];
                    }
                    // X = Y − Gᴴ ỹ (para a próxima iteração)
                    for (int i = 0; i < t; i++) {
                        double sr = yRe[off + passado + i], si = yIm[off + passado + i];
                        for (int m = 0; m < COEFS; m++) {
                            int idx = off + passado + i - ATRASO - m;
                            double cr = g[2 * m], ci = -g[2 * m + 1]; // conj(G_m)
                            double ur = yRe[idx], ui = yIm[idx];
                            sr -= cr * ur - ci * ui;
                            si -= cr * ui + ci * ur;
                        }
                        xRe[k * t + i] = sr;
                        xIm[k * t + i] = si;
                    }
                }
            });
        }
        // Aplica o filtro final a cada canal
        for (int i = 0; i < t; i++) {
            long j = a + i;
            for (int c = 0; c < 2; c++) {
                float[] y = q(j, c);
                float[] novo = y.clone();
                for (int k = 0; k < K; k++) {
                    double sr = y[2 * k], si = y[2 * k + 1];
                    for (int m = 0; m < COEFS; m++) {
                        float[] u = q(j - ATRASO - m, c);
                        if (u == null) continue;
                        double cr = gRe[k * COEFS + m], ci = -gIm[k * COEFS + m];
                        double ur = u[2 * k], ui = u[2 * k + 1];
                        sr -= cr * ur - ci * ui;
                        si -= cr * ui + ci * ur;
                    }
                    novo[2 * k] = (float) sr;
                    novo[2 * k + 1] = (float) si;
                }
                saidaQuadro.put(j * 2 + c, novo);
            }
        }
    }

    private final java.util.HashMap<Long, float[]> saidaQuadro = new java.util.HashMap<>();

    interface Faixas {
        void rodar(int k0, int k1);
    }

    private void emParalelo(int K, Faixas f) throws Exception {
        if (grupo == null) {
            f.rodar(0, K);
            return;
        }
        ArrayList<Future<?>> l = new ArrayList<>();
        int passo = (K + nThreads - 1) / nThreads;
        for (int k0 = 0; k0 < K; k0 += passo) {
            final int a = k0, b = Math.min(K, k0 + passo);
            l.add(grupo.submit(() -> f.rodar(a, b)));
        }
        for (Future<?> x : l) x.get();
    }

    /**
     * Resolve R g = p (R hermitiana positiva, n×n, complexos intercalados) por Cholesky; se R não for
     * positiva (sinal sem conteúdo nessa faixa), aumenta um pouco a diagonal e tenta de novo.
     */
    static double[] resolver(double[] R, double[] p, int n) {
        double tr = 0;
        for (int i = 0; i < n; i++) tr += R[2 * (i * n + i)];
        double carga = 0;
        for (int tentativa = 0; tentativa < 8; tentativa++) {
            double[] Lr = new double[n * n], Li = new double[n * n];
            boolean ok = true;
            for (int j = 0; j < n && ok; j++) {
                double d = R[2 * (j * n + j)] + carga;
                for (int k = 0; k < j; k++) d -= Lr[j * n + k] * Lr[j * n + k] + Li[j * n + k] * Li[j * n + k];
                if (!(d > 0)) {
                    ok = false;
                    break;
                }
                double ljj = Math.sqrt(d);
                Lr[j * n + j] = ljj;
                for (int i = j + 1; i < n; i++) {
                    // L[i][j] = (R[i][j] − Σ_k L[i][k] conj(L[j][k])) / L[j][j]
                    double sr = R[2 * (i * n + j)], si = R[2 * (i * n + j) + 1];
                    for (int k = 0; k < j; k++) {
                        double ar = Lr[i * n + k], ai = Li[i * n + k], br = Lr[j * n + k], bi = -Li[j * n + k];
                        sr -= ar * br - ai * bi;
                        si -= ar * bi + ai * br;
                    }
                    Lr[i * n + j] = sr / ljj;
                    Li[i * n + j] = si / ljj;
                }
            }
            if (!ok) {
                carga = carga == 0 ? Math.max(1e-30, 1e-9 * tr / n) : carga * 100;
                continue;
            }
            // L z = p
            double[] zr = new double[n], zi = new double[n];
            for (int i = 0; i < n; i++) {
                double sr = p[2 * i], si = p[2 * i + 1];
                for (int k = 0; k < i; k++) {
                    double ar = Lr[i * n + k], ai = Li[i * n + k];
                    sr -= ar * zr[k] - ai * zi[k];
                    si -= ar * zi[k] + ai * zr[k];
                }
                zr[i] = sr / Lr[i * n + i];
                zi[i] = si / Lr[i * n + i];
            }
            // Lᴴ g = z
            double[] g = new double[2 * n];
            for (int i = n - 1; i >= 0; i--) {
                double sr = zr[i], si = zi[i];
                for (int k = i + 1; k < n; k++) {
                    double ar = Lr[k * n + i], ai = -Li[k * n + i]; // conj(L[k][i])
                    sr -= ar * g[2 * k] - ai * g[2 * k + 1];
                    si -= ar * g[2 * k + 1] + ai * g[2 * k];
                }
                g[2 * i] = sr / Lr[i * n + i];
                g[2 * i + 1] = si / Lr[i * n + i];
            }
            return g;
        }
        return new double[2 * n]; // não deu: não filtra esta faixa
    }

    private void sintetizar(long j) throws Exception {
        for (int c = 0; c < 2; c++) {
            float[] y = saidaQuadro.remove(j * 2 + c);
            for (int k = 0; k < F; k++) {
                re[k] = y[2 * k];
                im[k] = y[2 * k + 1];
            }
            im[0] = 0;
            im[F - 1] = 0;
            for (int k = F; k < N; k++) {
                re[k] = re[N - k];
                im[k] = -im[N - k];
            }
            fft.transformar(re, im, true);
            float[] o = ola[c];
            for (int i = 0; i < N; i++) o[i] += (float) (re[i] / N) * JANELA[i] * NORMA_SINTESE;
            float[] out = c == 0 ? outE : outD;
            System.arraycopy(o, 0, out, 0, H);
            System.arraycopy(o, H, o, 0, N - H);
            java.util.Arrays.fill(o, N - H, N, 0f);
        }
        sintetizados++;
        // As H amostras que saíram são as do quadro j − 3 em diante (o 1º passo útil sai no quadro 3)
        int ini = 0;
        if (descartar > 0) {
            ini = (int) Math.min(descartar, H);
            descartar -= ini;
        }
        int q = (int) Math.min(H - ini, recebidas - entregues);
        if (q <= 0) return;
        if (ini > 0) {
            float[] e = new float[q], d = new float[q];
            System.arraycopy(outE, ini, e, 0, q);
            System.arraycopy(outD, ini, d, 0, q);
            saida.entregar(e, d, q);
        } else {
            saida.entregar(outE, outD, q);
        }
        entregues += q;
    }

    @Override
    public void close() {
        if (grupo != null) grupo.shutdownNow();
    }
}
