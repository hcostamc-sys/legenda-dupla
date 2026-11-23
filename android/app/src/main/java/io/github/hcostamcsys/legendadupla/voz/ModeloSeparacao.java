package io.github.hcostamcsys.legendadupla.voz;

/**
 * Modelo que separa a voz de um trecho de áudio estéreo de tamanho fixo (44,1 kHz).
 * Java puro (sem Android): roda no celular e no teste do GitHub Actions.
 */
public interface ModeloSeparacao extends AutoCloseable {

    /** Tamanho do trecho, em amostras por canal (HT-Demucs: 343980 = 7,8 s a 44,1 kHz). */
    int tamanhoTrecho();

    /**
     * Separa a voz de um trecho. Os quatro vetores têm tamanhoTrecho() amostras.
     * esq/dir: o áudio (−1 a 1); vozEsq/vozDir: recebem a voz separada.
     */
    void separar(float[] esq, float[] dir, float[] vozEsq, float[] vozDir) throws Exception;

    @Override
    void close();
}
