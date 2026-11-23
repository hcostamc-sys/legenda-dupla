package io.github.hcostamcsys.legendadupla.voz;

/**
 * Separa a voz do resto (música, efeitos, ruído) de um áudio longo, em fluxo: recebe o áudio aos
 * poucos e entrega, na mesma ordem e com o mesmo número de amostras, a voz e o fundo (fundo = áudio − voz,
 * então voz + fundo devolve exatamente o áudio original).
 *
 * O modelo trabalha em trechos de tamanho fixo (N). Os trechos se sobrepõem em 1/4 (como o infer.py do
 * modelo e o próprio Demucs) e são somados com uma janela de rampas lineares nas pontas, dividida pela
 * soma das janelas: onde dois trechos se cruzam, a passagem de um para o outro é gradual.
 * Java puro (sem Android).
 */
public final class SeparadorVoz {

    /** Recebe cada pedaço pronto (n amostras por canal, a partir do índice 0 dos vetores). */
    public interface Saida {
        void receber(float[] vozE, float[] vozD, float[] fundoE, float[] fundoD, int n) throws Exception;
    }

    private final ModeloSeparacao modelo;
    private final Saida saida;
    private final int n;      // tamanho do trecho
    private final int sobra;  // sobreposição
    private final int passo;  // n - sobra
    private final float[] janela;

    // Trecho atual: áudio de [inicio, inicio + preenchido)
    private final float[] inE, inD;
    private int preenchido = 0;
    // Somas ponderadas da voz e das janelas, alinhadas ao trecho atual
    private final float[] somaE, somaD, somaJ;
    private final float[] vozE, vozD; // saída do modelo
    private final float[] outVE, outVD, outFE, outFD; // pedaço entregue
    private boolean algumTrecho = false;
    private long recebidas = 0, entregues = 0;

    public SeparadorVoz(ModeloSeparacao modelo, Saida saida) {
        this.modelo = modelo;
        this.saida = saida;
        n = modelo.tamanhoTrecho();
        sobra = n / 4;
        passo = n - sobra;
        janela = new float[n];
        for (int i = 0; i < n; i++) {
            // Rampa de (i+1)/(sobra+1): nunca zero, e duas rampas que se cruzam somam exatamente 1.
            float subida = (i + 1f) / (sobra + 1f);
            float descida = (n - i) / (sobra + 1f);
            janela[i] = Math.min(1f, Math.min(subida, descida));
        }
        inE = new float[n];
        inD = new float[n];
        somaE = new float[n];
        somaD = new float[n];
        somaJ = new float[n];
        vozE = new float[n];
        vozD = new float[n];
        outVE = new float[passo];
        outVD = new float[passo];
        outFE = new float[passo];
        outFD = new float[passo];
    }

    public long recebidas() {
        return recebidas;
    }

    public long entregues() {
        return entregues;
    }

    /** Acrescenta qtd amostras (de e[ini] e d[ini] em diante). Processa os trechos que completar. */
    public void adicionar(float[] e, float[] d, int ini, int qtd) throws Exception {
        recebidas += qtd;
        while (qtd > 0) {
            int cabe = Math.min(qtd, n - preenchido);
            System.arraycopy(e, ini, inE, preenchido, cabe);
            System.arraycopy(d, ini, inD, preenchido, cabe);
            preenchido += cabe;
            ini += cabe;
            qtd -= cabe;
            if (preenchido == n) {
                processarTrecho(n);
                entregar(passo);
                avancar();
            }
        }
    }

    /** Fim do áudio: processa o que sobrou e entrega tudo. */
    public void terminar() throws Exception {
        if (preenchido == 0) return;
        if (!algumTrecho || preenchido > sobra) {
            // Há áudio novo que nenhum trecho viu: completa com silêncio e processa.
            for (int i = preenchido; i < n; i++) {
                inE[i] = 0f;
                inD[i] = 0f;
            }
            processarTrecho(preenchido);
        }
        // Senão, o que sobrou (até "sobra" amostras) já foi visto pelo trecho anterior.
        int resto = preenchido;
        int feito = 0;
        while (feito < resto) {
            int q = Math.min(passo, resto - feito);
            montarSaida(feito, q);
            saida.receber(outVE, outVD, outFE, outFD, q);
            entregues += q;
            feito += q;
        }
        preenchido = 0;
    }

    private void processarTrecho(int real) throws Exception {
        modelo.separar(inE, inD, vozE, vozD);
        for (int i = 0; i < n; i++) {
            float w = janela[i];
            float ve = vozE[i], vd = vozD[i];
            if (i >= real || !Float.isFinite(ve) || !Float.isFinite(vd)) {
                ve = 0f;
                vd = 0f;
            }
            somaE[i] += w * ve;
            somaD[i] += w * vd;
            somaJ[i] += w;
        }
        algumTrecho = true;
    }

    private void montarSaida(int de, int q) {
        for (int i = 0; i < q; i++) {
            int k = de + i;
            float j = somaJ[k];
            float ve = j > 0 ? somaE[k] / j : 0f;
            float vd = j > 0 ? somaD[k] / j : 0f;
            outVE[i] = ve;
            outVD[i] = vd;
            outFE[i] = inE[k] - ve;
            outFD[i] = inD[k] - vd;
        }
    }

    private void entregar(int q) throws Exception {
        montarSaida(0, q);
        saida.receber(outVE, outVD, outFE, outFD, q);
        entregues += q;
    }

    /** Passa para o próximo trecho: as últimas "sobra" amostras viram o começo dele. */
    private void avancar() {
        System.arraycopy(inE, passo, inE, 0, sobra);
        System.arraycopy(inD, passo, inD, 0, sobra);
        System.arraycopy(somaE, passo, somaE, 0, sobra);
        System.arraycopy(somaD, passo, somaD, 0, sobra);
        System.arraycopy(somaJ, passo, somaJ, 0, sobra);
        for (int i = sobra; i < n; i++) {
            somaE[i] = 0f;
            somaD[i] = 0f;
            somaJ[i] = 0f;
        }
        preenchido = sobra;
    }
}
