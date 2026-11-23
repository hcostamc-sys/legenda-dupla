package io.github.hcostamcsys.legendadupla.voz;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.util.Arrays;

/**
 * Junta de novo a voz e o fundo, abaixando o fundo só quando ele encobre a fala.
 *
 * 1) Medição (durante a separação): a cada quadro de 1024 amostras (23 ms), o nível da voz e o do fundo,
 *    em dB, só na faixa de 250 Hz a 4 kHz (onde a música mais atrapalha entender a fala; os graves
 *    pesam muito no volume e pouco no entendimento).
 * 2) Ganho do fundo (offline, com o arquivo inteiro): enquanto alguém fala, o fundo tem de ficar pelo menos
 *    "margem" dB abaixo da voz; se já está, não muda nada. O fundo abaixa um pouco antes de a fala começar e
 *    só volta devagar depois que ela termina (sem "bombear" entre as sílabas), e nunca some de vez
 *    (no máximo REDUCAO_MAX dB a menos). Sem fala, o fundo fica no volume original.
 * 3) Mixagem: voz + ganho × fundo. Onde o ganho é 1, sai exatamente o áudio original.
 * Java puro (sem Android).
 */
public final class MixadorVoz {

    public static final int QUADRO = 1024;
    public static final float PISO_DB = -120f;
    /** Quanto o fundo pode abaixar no máximo (dB). */
    public static final float REDUCAO_MAX = 30f;
    /** Margem padrão: o fundo fica pelo menos isso abaixo da voz enquanto alguém fala (dB). */
    public static final float MARGEM_PADRAO = 12f;

    private MixadorVoz() {
    }

    // ------------------------------------------------------------------ medição

    /** Filtro biquad (forma direta I), coeficientes do "Audio EQ Cookbook" (R. Bristow-Johnson). */
    static final class Biquad {
        final double b0, b1, b2, a1, a2;
        double x1, x2, y1, y2;

        Biquad(boolean passaAlta, double freq, double taxa) {
            double w0 = 2 * Math.PI * freq / taxa;
            double cos = Math.cos(w0), alfa = Math.sin(w0) / (2 * Math.sqrt(0.5)); // Q = 0,707
            double a0 = 1 + alfa;
            if (passaAlta) {
                b0 = (1 + cos) / 2 / a0;
                b1 = -(1 + cos) / a0;
                b2 = (1 + cos) / 2 / a0;
            } else {
                b0 = (1 - cos) / 2 / a0;
                b1 = (1 - cos) / a0;
                b2 = (1 - cos) / 2 / a0;
            }
            a1 = -2 * cos / a0;
            a2 = (1 - alfa) / a0;
        }

        double passar(double x) {
            double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;
            return y;
        }
    }

    /** Mede, em fluxo, o nível da voz e do fundo por quadro. */
    public static final class Medidor {
        private final Biquad[] fv, ff;
        private double somaV, somaF;
        private int noQuadro = 0;
        private float[] lv = new float[4096], lf = new float[4096];
        private int quadros = 0;

        public Medidor(int taxa) {
            fv = new Biquad[]{new Biquad(true, 250, taxa), new Biquad(false, 4000, taxa)};
            ff = new Biquad[]{new Biquad(true, 250, taxa), new Biquad(false, 4000, taxa)};
        }

        public void medir(float[] vE, float[] vD, float[] fE, float[] fD, int n) {
            for (int i = 0; i < n; i++) {
                double v = fv[1].passar(fv[0].passar(0.5 * (vE[i] + vD[i])));
                double f = ff[1].passar(ff[0].passar(0.5 * (fE[i] + fD[i])));
                somaV += v * v;
                somaF += f * f;
                if (++noQuadro == QUADRO) fecharQuadro();
            }
        }

        private void fecharQuadro() {
            if (noQuadro == 0) return;
            if (quadros == lv.length) {
                lv = Arrays.copyOf(lv, quadros * 2);
                lf = Arrays.copyOf(lf, quadros * 2);
            }
            lv[quadros] = db(somaV / noQuadro);
            lf[quadros] = db(somaF / noQuadro);
            quadros++;
            somaV = 0;
            somaF = 0;
            noQuadro = 0;
        }

        /** Fecha o último quadro (incompleto) e devolve os níveis. */
        public Niveis terminar() {
            fecharQuadro();
            return new Niveis(Arrays.copyOf(lv, quadros), Arrays.copyOf(lf, quadros));
        }
    }

    static float db(double potencia) {
        if (!(potencia > 1e-12)) return PISO_DB;
        return (float) Math.max(PISO_DB, 10 * Math.log10(potencia));
    }

    /** Níveis por quadro: voz e fundo, em dB. */
    public static final class Niveis {
        public final float[] voz, fundo;

        public Niveis(float[] voz, float[] fundo) {
            this.voz = voz;
            this.fundo = fundo;
        }

        public int quadros() {
            return voz.length;
        }

        private static final int MAGICO = 0x4C44564E; // "LDVN"

        public void salvar(File f) throws IOException {
            try (DataOutputStream o = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(f)))) {
                o.writeInt(MAGICO);
                o.writeInt(1);
                o.writeInt(QUADRO);
                o.writeInt(voz.length);
                for (float x : voz) o.writeFloat(x);
                for (float x : fundo) o.writeFloat(x);
            }
        }

        public static Niveis ler(File f) throws IOException {
            try (DataInputStream i = new DataInputStream(new BufferedInputStream(new FileInputStream(f)))) {
                if (i.readInt() != MAGICO || i.readInt() != 1 || i.readInt() != QUADRO) throw new IOException("níveis inválidos");
                int n = i.readInt();
                if (n < 0 || n > 50_000_000) throw new IOException("níveis inválidos");
                float[] v = new float[n], fu = new float[n];
                for (int k = 0; k < n; k++) v[k] = i.readFloat();
                for (int k = 0; k < n; k++) fu[k] = i.readFloat();
                return new Niveis(v, fu);
            }
        }
    }

    // ------------------------------------------------------------------ ganho do fundo

    /**
     * Ganho do fundo por quadro (dB, de −REDUCAO_MAX a 0). taxa: amostras por segundo.
     * margem: quanto o fundo tem de ficar abaixo da voz enquanto alguém fala (dB).
     */
    public static float[] ganhos(Niveis nv, float margem, int taxa) {
        int k = nv.quadros();
        float[] g = new float[k];
        if (k == 0) return g;
        double qps = taxa / (double) QUADRO; // quadros por segundo
        int segurarVoz = (int) Math.round(0.25 * qps);  // a voz "continua" 250 ms depois de cada sílaba
        int vizFundo = (int) Math.round(0.05 * qps);    // picos do fundo (batidas) em ±50 ms
        int antes = (int) Math.round(0.20 * qps);       // abaixa 200 ms antes de a fala começar
        int depois = (int) Math.round(0.30 * qps);      // espera 300 ms depois de a fala terminar

        // Nível típico da fala neste vídeo (percentil 90 dos quadros com algum som na faixa da voz).
        float[] validos = new float[k];
        int nv2 = 0;
        for (float x : nv.voz) if (x > -70f) validos[nv2++] = x;
        if (nv2 < Math.max(10, k / 200)) return g; // quase sem voz: deixa como está
        Arrays.sort(validos, 0, nv2);
        float referencia = validos[Math.min(nv2 - 1, (int) (0.9 * nv2))];
        float limiar = Math.max(referencia - 22f, -60f);

        float[] envVoz = maxJanela(nv.voz, segurarVoz, 0);
        float[] envFundo = maxJanela(nv.fundo, vizFundo, vizFundo);
        float[] alvo = new float[k];
        for (int i = 0; i < k; i++) {
            float a = 0f;
            if (envVoz[i] >= limiar) {
                a = Math.min(0f, (envVoz[i] - margem) - envFundo[i]);
                if (a > -1f) a = 0f; // diferença pequena: não mexe
                a = Math.max(a, -REDUCAO_MAX);
            }
            alvo[i] = a;
        }
        // Antecipa e segura: o menor alvo entre "antes" quadros à frente e "depois" quadros atrás.
        float[] g1 = minJanela(alvo, depois, antes);
        // Suaviza: abaixa rápido (40 ms) e sobe devagar (350 ms).
        double desce = 1 - Math.exp(-1 / (0.04 * qps));
        double sobe = 1 - Math.exp(-1 / (0.35 * qps));
        double atual = 0;
        for (int i = 0; i < k; i++) {
            double a = g1[i];
            atual += (a < atual ? desce : sobe) * (a - atual);
            g[i] = (float) atual;
        }
        return g;
    }

    /** Máximo de x[i-atras .. i+frente]. */
    static float[] maxJanela(float[] x, int atras, int frente) {
        return janelaExtrema(x, atras, frente, true);
    }

    /** Mínimo de x[i-atras .. i+frente]. */
    static float[] minJanela(float[] x, int atras, int frente) {
        return janelaExtrema(x, atras, frente, false);
    }

    /** Máximo ou mínimo deslizante, O(n) (fila dupla monótona). */
    private static float[] janelaExtrema(float[] x, int atras, int frente, boolean max) {
        int n = x.length;
        float[] r = new float[n];
        int[] fila = new int[n];
        int ini = 0, fim = 0;
        int proximo = 0; // próximo índice a entrar
        for (int i = 0; i < n; i++) {
            int ate = Math.min(n - 1, i + frente);
            while (proximo <= ate) {
                float v = x[proximo];
                while (fim > ini && (max ? x[fila[fim - 1]] <= v : x[fila[fim - 1]] >= v)) fim--;
                fila[fim++] = proximo++;
            }
            while (fila[ini] < i - atras) ini++;
            r[i] = x[fila[ini]];
        }
        return r;
    }

    // ------------------------------------------------------------------ mixagem

    /** Aplica, em fluxo, voz + ganho × fundo. O ganho é interpolado entre os centros dos quadros. */
    public static final class Aplicador {
        private final float[] linear;
        private long posicao = 0;

        public Aplicador(float[] ganhosDb) {
            linear = new float[ganhosDb.length];
            for (int i = 0; i < ganhosDb.length; i++) linear[i] = (float) Math.pow(10, ganhosDb[i] / 20.0);
        }

        private float ganho(long amostra) {
            int k = linear.length;
            if (k == 0) return 1f;
            double q = (amostra - QUADRO / 2.0) / QUADRO; // posição em quadros (centros)
            if (q <= 0) return linear[0];
            int a = (int) q;
            if (a >= k - 1) return linear[k - 1];
            float t = (float) (q - a);
            return linear[a] + t * (linear[a + 1] - linear[a]);
        }

        /** Mistura n amostras; o resultado vai para saiE/saiD (podem ser os próprios vetores da voz). */
        public void misturar(float[] vE, float[] vD, float[] fE, float[] fD, float[] saiE, float[] saiD, int n) {
            for (int i = 0; i < n; i++) {
                float g = ganho(posicao + i);
                saiE[i] = limitar(vE[i] + g * fE[i]);
                saiD[i] = limitar(vD[i] + g * fD[i]);
            }
            posicao += n;
        }
    }

    /** Evita estourar: acima de 0,98 a curva achata suavemente até 1. */
    static float limitar(float x) {
        float a = Math.abs(x);
        if (a <= 0.98f) return x;
        float y = 0.98f + 0.02f * (float) Math.tanh((a - 0.98f) / 0.02f);
        return x < 0 ? -y : y;
    }
}
