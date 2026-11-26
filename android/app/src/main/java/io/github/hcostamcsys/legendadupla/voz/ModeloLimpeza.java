package io.github.hcostamcsys.legendadupla.voz;

/**
 * Rede neural da limpeza da voz (DeepFilterNet3: encoder + decoder ERB + decoder DF), rodando sobre uma
 * sequência de quadros de 10 ms. Separada do processamento de sinal (LimpadorVoz) para o núcleo ser Java puro
 * e testável sem o motor do modelo.
 */
public interface ModeloLimpeza extends AutoCloseable {

    int ERB = 32;     // bandas ERB (ganhos do 1º estágio)
    int DF = 96;      // faixas de frequência do filtro profundo (até 4,8 kHz)
    int ORDEM = 5;    // quadros por filtro profundo

    /**
     * Roda o modelo em t quadros.
     * featErb: [t·32] (feat_erb, forma 1×1×t×32); featSpec: [2·t·96] (feat_spec, forma 1×2×t×96: primeiro
     * todas as partes reais, depois todas as imaginárias).
     * Saídas: mascara [t·32] (ganho 0–1 por banda); coefs [t·96·10] (por quadro e faixa: 5 complexos re, im).
     */
    void rodar(float[] featErb, float[] featSpec, int t, float[] mascara, float[] coefs) throws Exception;

    @Override
    void close();
}
