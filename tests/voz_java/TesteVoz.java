import io.github.hcostamcsys.legendadupla.voz.MixadorVoz;
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

    public static void main(String[] a) throws Exception {
        testeReamostrador();
        testeSeparadorExato();
        testeSeparadorPassagem();
        testeGanhos();
        testeSilabas();
        testeMedidorEAplicador();
        if (falhas > 0) {
            System.out.println(falhas + " falha(s)");
            System.exit(1);
        }
        System.out.println("TesteVoz: tudo certo");
    }
}
