package io.github.hcostamcsys.legendadupla.voz;

import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * HT-Demucs (versão "ft", especialista em voz) exportado para ONNX por StemSplit
 * (huggingface.co/StemSplitio/htdemucs-ft-vocals-onnx, licença MIT; modelo original da Meta).
 *
 * Contrato conferido na página do modelo em 23/11/2026:
 * entrada "mix" (1, 2, 343980) float32, 44,1 kHz, valores de −1 a 1, sem outra normalização
 * (o próprio modelo normaliza cada trecho por dentro); saída "stems" (1, 4, 2, 343980), na ordem
 * [drums, bass, other, vocals]: só a linha 3 (vocals) vale neste modelo especialista.
 */
public final class ModeloOnnx implements ModeloSeparacao {

    public static final int TRECHO = 343980;
    private static final int FONTES = 4;
    private static final int VOZ = 3;

    private final OrtEnvironment ambiente;
    private final OrtSession sessao;
    private final String entrada;
    private final float[] plano = new float[2 * TRECHO];

    /** threads: núcleos usados pelo modelo (o celular fica livre para o resto com 4). */
    public ModeloOnnx(String arquivo, int threads) throws Exception {
        ambiente = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions op = new OrtSession.SessionOptions();
        op.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        op.setIntraOpNumThreads(Math.max(1, threads));
        op.setInterOpNumThreads(1);
        sessao = ambiente.createSession(arquivo, op);
        op.close();
        String nome = "mix";
        if (!sessao.getInputNames().contains(nome)) nome = sessao.getInputNames().iterator().next();
        entrada = nome;
    }

    @Override
    public int tamanhoTrecho() {
        return TRECHO;
    }

    @Override
    public void separar(float[] esq, float[] dir, float[] vozEsq, float[] vozDir) throws Exception {
        System.arraycopy(esq, 0, plano, 0, TRECHO);
        System.arraycopy(dir, 0, plano, TRECHO, TRECHO);
        try (OnnxTensor t = OnnxTensor.createTensor(ambiente, FloatBuffer.wrap(plano), new long[]{1, 2, TRECHO});
             OrtSession.Result r = sessao.run(Collections.singletonMap(entrada, t))) {
            OnnxValue v = r.get(0);
            if (!(v instanceof OnnxTensor)) throw new IllegalStateException("saída inesperada do modelo");
            OnnxTensor saida = (OnnxTensor) v;
            long[] forma = saida.getInfo().getShape();
            FloatBuffer fb = saida.getFloatBuffer();
            int base;
            if (forma.length == 4 && forma[1] == FONTES && forma[2] == 2 && forma[3] == TRECHO) {
                base = VOZ * 2 * TRECHO; // (1, 4, 2, N): a voz é a fonte 3
            } else if (forma.length == 3 && forma[1] == 2 && forma[2] == TRECHO) {
                base = 0; // (1, 2, N): só a voz
            } else {
                throw new IllegalStateException("forma de saída inesperada: " + java.util.Arrays.toString(forma));
            }
            fb.position(base);
            fb.get(vozEsq, 0, TRECHO);
            fb.get(vozDir, 0, TRECHO);
        }
    }

    /** Nomes e formas das entradas e saídas (para o diagnóstico). */
    public String descricao() {
        try {
            StringBuilder b = new StringBuilder();
            for (Map.Entry<String, ai.onnxruntime.NodeInfo> e : sessao.getInputInfo().entrySet()) {
                b.append("entrada ").append(e.getKey()).append(' ').append(e.getValue().getInfo()).append("; ");
            }
            for (Map.Entry<String, ai.onnxruntime.NodeInfo> e : sessao.getOutputInfo().entrySet()) {
                b.append("saída ").append(e.getKey()).append(' ').append(e.getValue().getInfo()).append("; ");
            }
            return b.toString();
        } catch (Exception e) {
            return "?";
        }
    }

    @Override
    public void close() {
        try {
            sessao.close();
        } catch (Exception e) {
            // nada
        }
    }
}
