package io.github.hcostamcsys.legendadupla.voz;

import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * DeepFilterNet3 em ONNX: os três arquivos oficiais (models/DeepFilterNet3_onnx.tar.gz do repositório
 * github.com/Rikorose/DeepFilterNet, licença MIT/Apache-2.0), sem alteração:
 *   enc.onnx      feat_erb (1,1,T,32), feat_spec (1,2,T,96) → e0, e1, e2, e3, emb, c0, lsnr
 *   erb_dec.onnx  emb, e3, e2, e1, e0 → m (1,1,T,32)
 *   df_dec.onnx   emb, c0 → coefs (1,T,96,10) (e uma 2ª saída que não é usada)
 * As saídas do encoder passam direto para os decoders (sem cópia).
 */
public final class ModeloDfn3 implements ModeloLimpeza {

    private final OrtEnvironment ambiente;
    private final OrtSession enc, erb, df;

    /** Os três arquivos já lidos (o app tira dos assets; o teste do Actions, de arquivos). */
    public ModeloDfn3(byte[] encOnnx, byte[] erbDecOnnx, byte[] dfDecOnnx, int threads) throws Exception {
        ambiente = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions op = new OrtSession.SessionOptions();
        op.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        op.setIntraOpNumThreads(Math.max(1, threads));
        op.setInterOpNumThreads(1);
        // Tamanho da sequência muda de bloco para bloco: sem a reserva de memória do motor, que só cresceria
        op.setCPUArenaAllocator(false);
        op.setMemoryPatternOptimization(false);
        OrtSession a = null, b = null;
        try {
            a = ambiente.createSession(encOnnx, op);
            b = ambiente.createSession(erbDecOnnx, op);
            df = ambiente.createSession(dfDecOnnx, op);
        } catch (Exception e) {
            if (a != null) a.close();
            if (b != null) b.close();
            op.close();
            throw e;
        }
        enc = a;
        erb = b;
        op.close();
    }

    @Override
    public void rodar(float[] featErb, float[] featSpec, int t, float[] mascara, float[] coefs) throws Exception {
        Map<String, OnnxTensor> ent = new HashMap<>();
        try (OnnxTensor fe = OnnxTensor.createTensor(ambiente, FloatBuffer.wrap(featErb), new long[]{1, 1, t, ERB});
             OnnxTensor fs = OnnxTensor.createTensor(ambiente, FloatBuffer.wrap(featSpec), new long[]{1, 2, t, DF})) {
            ent.put("feat_erb", fe);
            ent.put("feat_spec", fs);
            try (OrtSession.Result r = enc.run(ent)) {
                Map<String, OnnxTensor> e2 = new HashMap<>();
                for (String n : new String[]{"emb", "e3", "e2", "e1", "e0"}) e2.put(n, tensor(r, n));
                try (OrtSession.Result m = erb.run(e2)) {
                    copiar(m.get(0), mascara, (long) t * ERB, "m");
                }
                Map<String, OnnxTensor> e3 = new HashMap<>();
                e3.put("emb", tensor(r, "emb"));
                e3.put("c0", tensor(r, "c0"));
                try (OrtSession.Result c = df.run(e3, java.util.Collections.singleton("coefs"))) {
                    copiar(c.get(0), coefs, (long) t * DF * ORDEM * 2, "coefs");
                }
            }
        }
    }

    private static OnnxTensor tensor(OrtSession.Result r, String nome) {
        OnnxValue v = r.get(nome).orElseThrow(() -> new IllegalStateException("o modelo não deu " + nome));
        return (OnnxTensor) v;
    }

    private static void copiar(OnnxValue v, float[] destino, long esperado, String nome) {
        OnnxTensor t = (OnnxTensor) v;
        long n = 1;
        for (long d : t.getInfo().getShape()) n *= d;
        if (n != esperado) throw new IllegalStateException("tamanho inesperado de " + nome + ": " + n);
        FloatBuffer fb = t.getFloatBuffer();
        fb.get(destino, 0, (int) n);
    }

    @Override
    public void close() {
        for (OrtSession s : new OrtSession[]{enc, erb, df}) {
            try {
                s.close();
            } catch (Exception e) {
                // nada
            }
        }
    }
}
