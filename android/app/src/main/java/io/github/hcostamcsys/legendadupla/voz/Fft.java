package io.github.hcostamcsys.legendadupla.voz;

/**
 * FFT complexa de tamanho qualquer cujos fatores sejam pequenos (2, 3, 4, 5…; 960 = 4·4·4·3·5),
 * por decimação no tempo (Cooley–Tukey de base mista). Sem normalização nos dois sentidos, como a
 * biblioteca realfft usada pelo DeepFilterNet: ida e volta multiplicam por n.
 * Não é segura para usar em duas threads ao mesmo tempo (usa vetores de trabalho próprios).
 * Java puro (sem Android).
 */
public final class Fft {

    private final int n;
    private final int[] fatores;
    private final double[] cosT, senT; // e^(−2πi·k/n), k = 0..n−1
    private final double[] tRe, tIm;   // trabalho de uma borboleta
    private final double[] aRe, aIm, bRe, bIm;

    public Fft(int n) {
        if (n < 1) throw new IllegalArgumentException("tamanho inválido");
        this.n = n;
        int[] f = new int[32];
        int q = 0, r = n;
        for (int p : new int[]{4, 2, 3, 5}) {
            while (r % p == 0) {
                f[q++] = p;
                r /= p;
            }
        }
        for (int p = 7; r > 1; p += 2) {
            while (r % p == 0) {
                f[q++] = p;
                r /= p;
            }
        }
        fatores = java.util.Arrays.copyOf(f, q);
        int maior = 1;
        for (int p : fatores) maior = Math.max(maior, p);
        cosT = new double[n];
        senT = new double[n];
        for (int k = 0; k < n; k++) {
            double a = -2 * Math.PI * k / n;
            cosT[k] = Math.cos(a);
            senT[k] = Math.sin(a);
        }
        tRe = new double[maior];
        tIm = new double[maior];
        aRe = new double[n];
        aIm = new double[n];
        bRe = new double[n];
        bIm = new double[n];
    }

    public int tamanho() {
        return n;
    }

    /** Transformada em re/im (n valores cada), no lugar. inversa: expoente positivo. */
    public void transformar(double[] re, double[] im, boolean inversa) {
        System.arraycopy(re, 0, aRe, 0, n);
        System.arraycopy(im, 0, aIm, 0, n);
        passo(aRe, aIm, 0, 1, re, im, 0, n, 0, inversa);
    }

    private void passo(double[] xRe, double[] xIm, int ini, int salto, double[] yRe, double[] yIm, int saida,
                       int m, int nivel, boolean inversa) {
        if (m == 1) {
            yRe[saida] = xRe[ini];
            yIm[saida] = xIm[ini];
            return;
        }
        int p = fatores[nivel];
        int sub = m / p;
        for (int q = 0; q < p; q++) {
            passo(xRe, xIm, ini + q * salto, salto * p, yRe, yIm, saida + q * sub, sub, nivel + 1, inversa);
        }
        int esc = n / m; // passo do índice da tabela para W_m
        double sinal = inversa ? -1 : 1;
        for (int k = 0; k < sub; k++) {
            // Pega os p valores (sub-transformadas no índice k) já multiplicados por W_m^(q·k)
            for (int q = 0; q < p; q++) {
                int idx = saida + q * sub + k;
                double re = yRe[idx], im = yIm[idx];
                if (q > 0) {
                    int e = (q * k * esc) % n;
                    double c = cosT[e], s = sinal * senT[e];
                    double r2 = re * c - im * s;
                    im = re * s + im * c;
                    re = r2;
                }
                tRe[q] = re;
                tIm[q] = im;
            }
            // DFT de tamanho p: saída j = Σ_q t_q · W_p^(q·j)
            for (int j = 0; j < p; j++) {
                double sr = 0, si = 0;
                for (int q = 0; q < p; q++) {
                    int e = (int) (((long) q * j * (n / p)) % n);
                    double c = cosT[e], s = sinal * senT[e];
                    sr += tRe[q] * c - tIm[q] * s;
                    si += tRe[q] * s + tIm[q] * c;
                }
                bRe[j] = sr;
                bIm[j] = si;
            }
            for (int j = 0; j < p; j++) {
                yRe[saida + k + j * sub] = bRe[j];
                yIm[saida + k + j * sub] = bIm[j];
            }
        }
    }
}
