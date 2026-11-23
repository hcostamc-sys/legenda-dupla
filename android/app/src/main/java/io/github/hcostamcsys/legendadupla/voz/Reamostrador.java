package io.github.hcostamcsys.legendadupla.voz;

/**
 * Muda a taxa de amostragem em fluxo (por exemplo 48 kHz → 44,1 kHz: o modelo trabalha a 44,1 kHz).
 * Interpolação por seno cardinal com janela de Blackman (±16 cruzamentos por zero), com o corte abaixo da
 * metade da menor das duas taxas, para não criar sons falsos (aliasing). Um canal; use um por canal.
 * Java puro (sem Android).
 */
public final class Reamostrador {

    private static final int CRUZAMENTOS = 16;
    private static final int FASES = 512; // resolução da tabela do núcleo (por amostra de entrada)

    private final double passo;   // amostras de entrada por amostra de saída
    private final double corte;   // frequência de corte relativa à taxa de entrada (1 = Nyquist da entrada)
    private final int meia;       // meia largura do núcleo, em amostras de entrada
    private float[] hist = new float[1 << 14];
    private long inicioHist = 0;  // índice absoluto de hist[0]
    private int tamHist = 0;
    private double proxima = 0;   // posição (em amostras de entrada, absoluta) da próxima saída

    public Reamostrador(int taxaEntrada, int taxaSaida) {
        passo = taxaEntrada / (double) taxaSaida;
        corte = Math.min(1.0, taxaSaida / (double) taxaEntrada) * 0.95;
        meia = (int) Math.ceil(CRUZAMENTOS / corte);
        tabela = new float[meia * FASES + 2];
        for (int i = 0; i < tabela.length; i++) tabela[i] = (float) nucleoExato(i / (double) FASES);
    }

    private final float[] tabela;

    /**
     * Recebe n amostras e escreve as que ficarem prontas em saida (a partir de 0). Devolve quantas.
     * saida precisa caber n / passo + 2 amostras.
     */
    public int processar(float[] entrada, int ini, int n, float[] saida) {
        acrescentar(entrada, ini, n);
        return gerar(saida, false);
    }

    /** Fim do fluxo: gera as últimas amostras (completa com silêncio). */
    public int terminar(float[] saida) {
        float[] zeros = new float[meia + 1];
        acrescentar(zeros, 0, zeros.length);
        return gerar(saida, true);
    }

    private long totalEntrada = 0;
    private long fimReal = -1;

    private void acrescentar(float[] x, int ini, int n) {
        if (tamHist + n > hist.length) {
            // Descarta o que não será mais usado (antes de proxima - meia).
            long necessario = (long) Math.floor(proxima) - meia - 1;
            int descartar = (int) Math.max(0, Math.min(tamHist, necessario - inicioHist));
            if (descartar > 0) {
                System.arraycopy(hist, descartar, hist, 0, tamHist - descartar);
                tamHist -= descartar;
                inicioHist += descartar;
            }
            if (tamHist + n > hist.length) {
                float[] novo = new float[Math.max(hist.length * 2, tamHist + n)];
                System.arraycopy(hist, 0, novo, 0, tamHist);
                hist = novo;
            }
        }
        System.arraycopy(x, ini, hist, tamHist, n);
        tamHist += n;
        totalEntrada += n;
    }

    private int gerar(float[] saida, boolean fim) {
        if (fim && fimReal < 0) fimReal = totalEntrada - (meia + 1);
        int q = 0;
        long ultimoDisponivel = inicioHist + tamHist - 1;
        while (true) {
            double p = proxima;
            if (fim && p >= fimReal) break;
            long centro = (long) Math.floor(p);
            if (centro + meia > ultimoDisponivel) break;
            double soma = 0;
            for (long k = centro - meia + 1; k <= centro + meia; k++) {
                if (k < 0) continue;
                int idx = (int) (k - inicioHist);
                if (idx < 0) continue;
                double t = Math.abs(p - k) * FASES;
                int a = (int) t;
                if (a >= tabela.length - 1) continue;
                double f = t - a;
                soma += hist[idx] * (tabela[a] + f * (tabela[a + 1] - tabela[a]));
            }
            saida[q++] = (float) soma;
            proxima += passo;
        }
        return q;
    }

    private double nucleoExato(double t) {
        double x = t * corte;
        double sinc = Math.abs(x) < 1e-9 ? 1.0 : Math.sin(Math.PI * x) / (Math.PI * x);
        double u = t / meia; // −1 .. 1
        if (Math.abs(u) >= 1) return 0;
        double w = 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u); // Blackman centrada
        return corte * sinc * w;
    }
}
