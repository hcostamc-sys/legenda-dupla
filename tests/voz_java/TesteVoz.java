import io.github.hcostamcsys.legendadupla.voz.Dereverberador;
import io.github.hcostamcsys.legendadupla.voz.Fft;
import io.github.hcostamcsys.legendadupla.voz.LimpadorVoz;
import io.github.hcostamcsys.legendadupla.voz.LimpezaVoz;
import io.github.hcostamcsys.legendadupla.voz.MixadorVoz;
import io.github.hcostamcsys.legendadupla.voz.ModeloLimpeza;
import io.github.hcostamcsys.legendadupla.voz.ModeloSeparacao;
import io.github.hcostamcsys.legendadupla.voz.Reamostrador;
import io.github.hcostamcsys.legendadupla.voz.SeparadorVoz;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Testes do núcleo Java da "voz mais clara" (sem Android, sem modelo de verdade).
 * Uso (na raiz do projeto): sh tests/voz_java/rodar.sh
 */
public class TesteVoz {

    static int falhas = 0;

    static void conferir(boolean ok, String msg) {
        if (!ok) {
            falhas++;
            System.out.println("FALHOU: " + msg);
        }
    }

    /** Modelo falso: "voz" = fator × áudio (linear), então a voz final tem de ser exatamente fator × áudio. */
    static final class ModeloLinear implements ModeloSeparacao {
        final int n;
        final float fator;
        int chamadas = 0;

        ModeloLinear(int n, float fator) {
            this.n = n;
            this.fator = fator;
        }

        public int tamanhoTrecho() { return n; }

        public void separar(float[] e, float[] d, float[] ve, float[] vd) {
            chamadas++;
            for (int i = 0; i < n; i++) {
                ve[i] = fator * e[i];
                vd[i] = fator * d[i];
            }
        }

        public void close() { }
    }

    /** Modelo falso que devolve uma constante diferente em cada trecho: testa a passagem gradual. */
    static final class ModeloPorTrecho implements ModeloSeparacao {
        final int n;
        int chamadas = 0;

        ModeloPorTrecho(int n) { this.n = n; }

        public int tamanhoTrecho() { return n; }

        public void separar(float[] e, float[] d, float[] ve, float[] vd) {
            float c = chamadas++;
            for (int i = 0; i < n; i++) {
                ve[i] = c;
                vd[i] = -c;
            }
        }

        public void close() { }
    }

    static float[][] separarTudo(ModeloSeparacao m, float[] e, float[] d, Random r) throws Exception {
        List<float[]> partes = new ArrayList<>();
        int[] total = {0};
        SeparadorVoz s = new SeparadorVoz(m, (vE, vD, fE, fD, q) -> {
            float[] p = new float[4 * q];
            System.arraycopy(vE, 0, p, 0, q);
            System.arraycopy(vD, 0, p, q, q);
            System.arraycopy(fE, 0, p, 2 * q, q);
            System.arraycopy(fD, 0, p, 3 * q, q);
            partes.add(p);
            total[0] += q;
        });
        int i = 0;
        while (i < e.length) {
            int q = Math.min(e.length - i, 1 + r.nextInt(2500));
            s.adicionar(e, d, i, q);
            i += q;
        }
        s.terminar();
        float[][] out = new float[4][total[0]];
        int pos = 0;
        for (float[] p : partes) {
            int q = p.length / 4;
            for (int c = 0; c < 4; c++) System.arraycopy(p, c * q, out[c], pos, q);
            pos += q;
        }
        conferir(s.entregues() == s.recebidas(), "entregues " + s.entregues() + " != recebidas " + s.recebidas());
        return out;
    }

    static void testeSeparadorExato() throws Exception {
        Random r = new Random(7);
        int n = 4000;
        int[] tamanhos = {1, 999, 1000, 1001, 3000, 3999, 4000, 4001, 6999, 7000, 7001, 13000, 3 * 4000 + 1234, 50_000};
        for (int len : tamanhos) {
            float[] e = new float[len], d = new float[len];
            for (int i = 0; i < len; i++) {
                e[i] = (float) Math.sin(i * 0.013) * 0.7f;
                d[i] = (float) Math.cos(i * 0.017) * 0.5f;
            }
            ModeloLinear m = new ModeloLinear(n, 0.25f);
            float[][] out = separarTudo(m, e, d, r);
            conferir(out[0].length == len, "tamanho " + len + " -> " + out[0].length);
            double erro = 0;
            for (int i = 0; i < Math.min(len, out[0].length); i++) {
                erro = Math.max(erro, Math.abs(out[0][i] - 0.25f * e[i]));
                erro = Math.max(erro, Math.abs(out[1][i] - 0.25f * d[i]));
                // voz + fundo = áudio original
                erro = Math.max(erro, Math.abs(out[0][i] + out[2][i] - e[i]));
                erro = Math.max(erro, Math.abs(out[1][i] + out[3][i] - d[i]));
            }
            conferir(erro < 1e-5, "tamanho " + len + ": erro " + erro);
            int esperadas = len <= n ? 1 : 1 + (int) Math.ceil((len - n) / 3000.0);
            conferir(m.chamadas == esperadas, "tamanho " + len + ": " + m.chamadas + " trechos, esperado " + esperadas);
        }
    }

    static void testeSeparadorPassagem() throws Exception {
        // Trecho 0 devolve 0, trecho 1 devolve 1...: na sobreposição o valor sobe em rampa, sem degrau.
        int n = 4000, sobra = 1000, passo = 3000;
        int len = 3 * passo + n;
        float[] e = new float[len], d = new float[len];
        float[][] out = separarTudo(new ModeloPorTrecho(n), e, d, new Random(3));
        // Fora das sobreposições: constante do trecho.
        conferir(Math.abs(out[0][500 + sobra] - 0f) < 1e-6, "meio do trecho 0");
        conferir(Math.abs(out[0][passo + sobra + 10] - 1f) < 1e-6, "meio do trecho 1");
        // Na sobreposição entre o trecho 0 e o 1 ([passo, passo+sobra)): de 0 a 1, sempre subindo.
        float ant = -1;
        double maiorPulo = 0;
        for (int i = passo; i < passo + sobra; i++) {
            conferir(out[0][i] >= ant - 1e-6, "rampa desceu em " + i);
            if (ant >= 0) maiorPulo = Math.max(maiorPulo, out[0][i] - ant);
            ant = out[0][i];
            conferir(Math.abs(out[1][i] + out[0][i]) < 1e-6, "canal direito espelhado");
        }
        conferir(maiorPulo < 0.002, "pulo na rampa " + maiorPulo);
    }

    static MixadorVoz.Niveis niveis(int k, float voz, float fundo, int de, int ate) {
        float[] v = new float[k], f = new float[k];
        for (int i = 0; i < k; i++) {
            v[i] = (i >= de && i < ate) ? voz : -90f;
            f[i] = fundo;
        }
        return new MixadorVoz.Niveis(v, f);
    }

    static void testeGanhos() {
        int taxa = 44100;
        double qps = taxa / 1024.0;
        int k = 2000;
        int de = 600, ate = 1200; // fala de ~13,9 s a ~27,9 s
        // Fundo alto (−20 dB) e voz em −15 dB: com margem 12, o fundo tem de ir a −27 dB (−7 dB).
        float[] g = MixadorVoz.ganhos(niveis(k, -15f, -20f, de, ate), 12f, taxa);
        conferir(Math.abs(g[900] + 7f) < 0.05, "meio da fala: " + g[900]);
        conferir(Math.abs(g[100]) < 1e-3, "antes da fala: " + g[100]);
        conferir(Math.abs(g[1900]) < 0.05, "bem depois da fala: " + g[1900]);
        // Antecipa: 150 ms antes da fala já está abaixando (alvo vale desde 200 ms antes)
        int antes = de - (int) Math.round(0.15 * qps);
        conferir(g[antes] < -5f, "150 ms antes da fala: " + g[antes]);
        // Segura: 200 ms depois do fim da fala (com a voz "continuando" 250 ms) ainda baixo
        int depois = ate + (int) Math.round(0.2 * qps);
        conferir(g[depois] < -6.5f, "200 ms depois da fala: " + g[depois]);
        // Fundo já baixo (−40 dB): não mexe
        float[] g2 = MixadorVoz.ganhos(niveis(k, -15f, -40f, de, ate), 12f, taxa);
        float minimo = 0;
        for (float x : g2) minimo = Math.min(minimo, x);
        conferir(minimo > -0.01f, "fundo já baixo mexeu: " + minimo);
        // Fundo muito alto: no máximo REDUCAO_MAX
        float[] g3 = MixadorVoz.ganhos(niveis(k, -30f, 10f, de, ate), 12f, taxa);
        float m3 = 0;
        for (float x : g3) m3 = Math.min(m3, x);
        conferir(m3 >= -MixadorVoz.REDUCAO_MAX - 0.01f && m3 < -MixadorVoz.REDUCAO_MAX + 0.5f, "limite: " + m3);
        // Sem voz nenhuma: tudo 0
        float[] g4 = MixadorVoz.ganhos(niveis(k, -90f, -10f, 0, 0), 12f, taxa);
        for (float x : g4) if (x != 0f) { conferir(false, "sem voz mexeu"); break; }
    }

    static void testeSilabas() {
        // Fala com intervalos de 150 ms entre sílabas: o ganho não pode subir no meio da fala.
        int taxa = 44100;
        int k = 1500;
        float[] v = new float[k], f = new float[k];
        for (int i = 0; i < k; i++) {
            f[i] = -18f;
            boolean fala = i >= 400 && i < 1000;
            boolean silaba = ((i - 400) % 13) < 7; // 7 quadros de som, 6 de pausa (~140 ms)
            v[i] = fala && silaba ? -14f : -85f;
        }
        float[] g = MixadorVoz.ganhos(new MixadorVoz.Niveis(v, f), 12f, taxa);
        float maior = -100, menor = 100;
        for (int i = 450; i < 990; i++) {
            maior = Math.max(maior, g[i]);
            menor = Math.min(menor, g[i]);
        }
        conferir(maior - menor < 0.3f, "ganho oscilou entre sílabas: " + menor + " a " + maior);
    }

    static void testeMedidorEAplicador() {
        int taxa = 44100;
        int len = 44100 * 2;
        float[] vE = new float[len], vD = new float[len], fE = new float[len], fD = new float[len];
        for (int i = 0; i < len; i++) {
            double t = i / (double) taxa;
            vE[i] = vD[i] = (float) (0.1 * Math.sin(2 * Math.PI * 1000 * t)); // 1 kHz: dentro da faixa
            fE[i] = fD[i] = (float) (0.5 * Math.sin(2 * Math.PI * 60 * t));   // 60 Hz: fora da faixa
        }
        MixadorVoz.Medidor m = new MixadorVoz.Medidor(taxa);
        m.medir(vE, vD, fE, fD, len);
        MixadorVoz.Niveis nv = m.terminar();
        conferir(nv.quadros() == (len + 1023) / 1024, "quadros " + nv.quadros());
        // seno de amplitude 0,1: potência 0,005 → −23 dB. O 60 Hz de amplitude 0,5 (−9 dB) perde ~25 dB no
        // filtro de 250 Hz (12 dB por oitava, 2 oitavas): fica perto de −34 dB.
        float v = nv.voz[nv.quadros() / 2], f = nv.fundo[nv.quadros() / 2];
        conferir(Math.abs(v + 23f) < 1f, "nível da voz " + v);
        conferir(f < -30f, "o grave deveria pesar pouco: fundo " + f + " voz " + v);
        // Ganho 0 dB: saída = voz + fundo
        float[] ganhos = new float[nv.quadros()];
        MixadorVoz.Aplicador a = new MixadorVoz.Aplicador(ganhos);
        float[] sE = new float[len], sD = new float[len];
        a.misturar(vE, vD, fE, fD, sE, sD, len);
        double erro = 0;
        for (int i = 0; i < len; i++) erro = Math.max(erro, Math.abs(sE[i] - (vE[i] + fE[i])));
        conferir(erro < 1e-6, "mistura com ganho 1: erro " + erro);
        // Ganho −20 dB constante
        java.util.Arrays.fill(ganhos, -20f);
        MixadorVoz.Aplicador b = new MixadorVoz.Aplicador(ganhos);
        b.misturar(vE, vD, fE, fD, sE, sD, len);
        erro = 0;
        for (int i = 0; i < len; i++) erro = Math.max(erro, Math.abs(sE[i] - (vE[i] + 0.1f * fE[i])));
        conferir(erro < 1e-5, "mistura com −20 dB: erro " + erro);
    }

    static void testeReamostrador() {
        // 1 s de seno de 1 kHz a 48 kHz → 44,1 kHz: mesma frequência, mesma amplitude, 44100 amostras.
        int de = 48000, para = 44100;
        Reamostrador r = new Reamostrador(de, para);
        float[] x = new float[de];
        for (int i = 0; i < de; i++) x[i] = (float) (0.5 * Math.sin(2 * Math.PI * 1000 * i / de));
        float[] y = new float[para + 200];
        int q = 0;
        float[] buf = new float[4000];
        for (int i = 0; i < de; i += 1000) {
            int k = r.processar(x, i, Math.min(1000, de - i), buf);
            System.arraycopy(buf, 0, y, q, k);
            q += k;
        }
        int k = r.terminar(buf);
        System.arraycopy(buf, 0, y, q, k);
        q += k;
        conferir(Math.abs(q - para) <= 1, "reamostrador: " + q + " amostras");
        double erro = 0;
        for (int i = 100; i < para - 100; i++) {
            double esperado = 0.5 * Math.sin(2 * Math.PI * 1000 * i / (double) para);
            erro = Math.max(erro, Math.abs(y[i] - esperado));
        }
        conferir(erro < 0.005, "reamostrador: erro " + erro);
        // 20 kHz a 48 kHz (acima da metade de 44,1 kHz) tem de sumir, não virar outro som
        Reamostrador r2 = new Reamostrador(de, para);
        for (int i = 0; i < de; i++) x[i] = (float) (0.5 * Math.sin(2 * Math.PI * 23000 * i / de));
        float[] y2 = new float[para + 200];
        int q2 = r2.processar(x, 0, de, y2);
        double pico = 0;
        for (int i = 200; i < q2 - 200; i++) pico = Math.max(pico, Math.abs(y2[i]));
        conferir(pico < 0.03, "reamostrador: 23 kHz deveria cair pelo menos 25 dB, sobrou " + pico); // faixa de transição do filtro
    }

    // ------------------------------------------------------------------ limpeza da voz (ruído e eco)

    static void testeFft() {
        for (int n : new int[]{960, 1536, 12}) {
            Fft f = new Fft(n);
            Random r = new Random(n);
            double[] re = new double[n], im = new double[n], r0 = new double[n], i0 = new double[n];
            for (int i = 0; i < n; i++) {
                re[i] = r0[i] = r.nextGaussian();
                im[i] = i0[i] = r.nextGaussian();
            }
            f.transformar(re, im, false);
            double erro = 0;
            for (int k = 0; k < n; k++) {
                double sr = 0, si = 0;
                for (int t = 0; t < n; t++) {
                    double a = -2 * Math.PI * ((long) k * t % n) / n;
                    sr += r0[t] * Math.cos(a) - i0[t] * Math.sin(a);
                    si += r0[t] * Math.sin(a) + i0[t] * Math.cos(a);
                }
                erro = Math.max(erro, Math.hypot(re[k] - sr, im[k] - si));
            }
            conferir(erro < 1e-8 * n, "fft " + n + ": erro " + erro);
            f.transformar(re, im, true);
            double volta = 0;
            for (int i = 0; i < n; i++) volta = Math.max(volta, Math.hypot(re[i] / n - r0[i], im[i] / n - i0[i]));
            conferir(volta < 1e-12 * n, "fft " + n + " ida e volta: erro " + volta);
        }
    }

    /** Modelo falso: ganho 1 em todas as bandas e filtro profundo = só o quadro atual → a saída tem de ser a entrada. */
    static final class ModeloIdentidade implements ModeloLimpeza {
        int chamadas = 0;

        public void rodar(float[] fe, float[] fs, int t, float[] m, float[] c) {
            chamadas++;
            java.util.Arrays.fill(m, 1f);
            java.util.Arrays.fill(c, 0f);
            for (int i = 0; i < t * DF; i++) c[(i * ORDEM + 2) * 2] = 1f; // coeficiente do quadro t (olhar = 2) = 1 + 0i
        }

        public void close() {}
    }

    static void testeLimpadorIdentidade() throws Exception {
        int n = 48000 * 3 + 123;
        Random r = new Random(5);
        float[] e = new float[n], d = new float[n];
        for (int i = 0; i < n; i++) {
            e[i] = (float) (0.3 * r.nextGaussian());
            d[i] = (float) (0.2 * Math.sin(i * 0.01) + 0.1 * r.nextGaussian());
        }
        float[] ye = new float[n], yd = new float[n];
        int[] pos = {0};
        ModeloIdentidade m = new ModeloIdentidade();
        LimpadorVoz l = new LimpadorVoz(m, 70, 20, (a, b, q) -> {
            System.arraycopy(a, 0, ye, pos[0], q);
            System.arraycopy(b, 0, yd, pos[0], q);
            pos[0] += q;
        });
        for (int i = 0; i < n; ) {
            int k = Math.min(n - i, 1 + r.nextInt(7000));
            l.adicionar(e, d, i, k);
            i += k;
        }
        l.terminar();
        conferir(pos[0] == n, "limpador: saiu " + pos[0] + " de " + n);
        double erro = 0;
        for (int i = 0; i < n; i++) erro = Math.max(erro, Math.max(Math.abs(ye[i] - e[i]), Math.abs(yd[i] - d[i])));
        conferir(erro < 1e-5, "limpador com modelo neutro deveria devolver a entrada; erro " + erro);
        conferir(m.chamadas > 3, "limpador: blocos " + m.chamadas);
    }

    static float[][] rodarEco(float[] e, float[] d, int bloco) throws Exception {
        int n = e.length;
        float[][] y = new float[2][n];
        int[] pos = {0};
        Dereverberador dv = new Dereverberador(bloco, 2, (a, b, q) -> {
            System.arraycopy(a, 0, y[0], pos[0], q);
            System.arraycopy(b, 0, y[1], pos[0], q);
            pos[0] += q;
        });
        Random r = new Random(9);
        for (int i = 0; i < n; ) {
            int k = Math.min(n - i, 1 + r.nextInt(9000));
            dv.adicionar(e, d, i, k);
            i += k;
        }
        dv.terminar();
        dv.close();
        conferir(pos[0] == n, "eco: saiu " + pos[0] + " de " + n);
        return y;
    }

    static void testeEcoPassagem() throws Exception {
        // Acima de 8 kHz o WPE não mexe: um tom de 15 kHz tem de sair igual, na mesma posição
        int n = 48000 * 2 + 77;
        float[] x = new float[n];
        for (int i = 0; i < n; i++) x[i] = (float) (0.5 * Math.sin(2 * Math.PI * 15000 * i / 48000.0));
        float[][] y = rodarEco(x, x, 60);
        double erro = 0;
        for (int i = 0; i < n; i++) erro = Math.max(erro, Math.abs(y[0][i] - x[i]));
        conferir(erro < 1e-3, "eco: tom de 15 kHz deveria passar igual; erro " + erro);
    }

    static void testeEcoReduz() throws Exception {
        // Fonte com potência que muda muito (como a fala) + eco repetido de 96 ms (12 passos da STFT), ganho 0,5:
        // y[t] = s[t] + 0,5·y[t − 4608]. O WPE tem de prever e tirar quase todo o eco.
        int sr = 48000, n = sr * 8, atraso = 4608;
        Random r = new Random(3);
        float[] s = new float[n], y = new float[n];
        double ganho = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0;
        for (int i = 0; i < n; i++) {
            if (i % 2400 == 0) ganho = r.nextDouble() < 0.3 ? 0 : Math.pow(10, -2 * r.nextDouble()); // trechos de 50 ms
            double v = r.nextGaussian();
            double ma = (v + m1 + m2 + m3 + m4 + m5) / 6; // média de 6 amostras: quase tudo abaixo de 8 kHz
            m5 = m4; m4 = m3; m3 = m2; m2 = m1; m1 = v;
            s[i] = (float) (0.3 * ganho * ma);
            y[i] = s[i] + (i >= atraso ? 0.5f * y[i - atraso] : 0f);
        }
        float[][] x = rodarEco(y, y, 375);
        double eco = 0, resto = 0;
        for (int i = sr; i < n; i++) {
            eco += (y[i] - s[i]) * (y[i] - s[i]);
            resto += (x[0][i] - s[i]) * (x[0][i] - s[i]);
        }
        double queda = 10 * Math.log10(resto / eco);
        System.out.printf("  eco: sobrou %.1f dB do eco%n", queda);
        conferir(queda < -7, "eco: o WPE deveria tirar mais de 7 dB do eco (o nara_wpe tira 9,6 dB num sinal igual); tirou " + (-queda));
    }

    static void testeLimpezaPassagem() throws Exception {
        // Sem modelo e sem eco: só ida e volta 44,1 → 48 → 44,1 kHz; tem de sair igual, sem atraso
        int n = 44100 * 2 + 31;
        float[] x = new float[n], z = new float[n];
        for (int i = 0; i < n; i++) {
            x[i] = (float) (0.4 * Math.sin(2 * Math.PI * 1000 * i / 44100.0) + 0.2 * Math.sin(2 * Math.PI * 5000 * i / 44100.0));
            z[i] = -x[i];
        }
        float[][] y = new float[2][n];
        int[] pos = {0};
        LimpezaVoz l = new LimpezaVoz(null, false, 44100, 1, (a, b, q) -> {
            System.arraycopy(a, 0, y[0], pos[0], q);
            System.arraycopy(b, 0, y[1], pos[0], q);
            pos[0] += q;
        });
        for (int i = 0; i < n; i += 5000) l.adicionar(x, z, i, Math.min(5000, n - i));
        l.terminar();
        l.close();
        conferir(pos[0] == n, "limpeza: saiu " + pos[0] + " de " + n);
        double erro = 0;
        for (int i = 200; i < n - 200; i++) erro = Math.max(erro, Math.max(Math.abs(y[0][i] - x[i]), Math.abs(y[1][i] - z[i])));
        conferir(erro < 0.005, "limpeza: ida e volta da reamostragem; erro " + erro);
    }

    public static void main(String[] a) throws Exception {
        testeReamostrador();
        testeSeparadorExato();
        testeSeparadorPassagem();
        testeGanhos();
        testeSilabas();
        testeMedidorEAplicador();
        testeFft();
        testeLimpadorIdentidade();
        testeEcoPassagem();
        testeEcoReduz();
        testeLimpezaPassagem();
        if (falhas > 0) {
            System.out.println(falhas + " falha(s)");
            System.exit(1);
        }
        System.out.println("TesteVoz: tudo certo");
    }
}
