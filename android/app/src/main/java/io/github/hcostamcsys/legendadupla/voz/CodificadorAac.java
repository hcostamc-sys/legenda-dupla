package io.github.hcostamcsys.legendadupla.voz;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Grava estéreo em ponto flutuante como AAC-LC num arquivo .m4a, com o codificador do Android. */
public final class CodificadorAac implements AutoCloseable {

    private static final long LIMITE_MS = 20000; // sem resposta do codificador por 20 s: erro

    private final MediaCodec codec;
    private final MediaMuxer muxer;
    private final int taxa;
    private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
    private int faixa = -1;
    private boolean muxerIniciado = false, terminado = false, fechado = false;
    private long amostras = 0;

    public CodificadorAac(File saida, int taxa, int bitrate) throws IOException {
        this.taxa = taxa;
        MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, taxa, 2);
        f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        f.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
        f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 32768);
        MediaCodec c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        try {
            c.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            c.start();
        } catch (Exception e) {
            c.release();
            throw new IOException("O celular não deixou gravar AAC.", e);
        }
        codec = c;
        //noinspection ResultOfMethodCallIgnored
        saida.delete();
        muxer = new MediaMuxer(saida.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
    }

    /** Grava n amostras de e[ini] e d[ini] em diante. */
    public void escrever(float[] e, float[] d, int ini, int n) throws IOException {
        int feito = 0;
        long desde = System.currentTimeMillis();
        while (feito < n) {
            int ib = codec.dequeueInputBuffer(10000);
            if (ib >= 0) {
                ByteBuffer b = codec.getInputBuffer(ib);
                if (b == null) throw new IOException("codificador sem memória de entrada");
                b.clear();
                b.order(ByteOrder.nativeOrder());
                int cabe = Math.min(n - feito, b.remaining() / 4);
                for (int i = 0; i < cabe; i++) {
                    b.putShort(paraShort(e[ini + feito + i]));
                    b.putShort(paraShort(d[ini + feito + i]));
                }
                codec.queueInputBuffer(ib, 0, cabe * 4, amostras * 1_000_000L / taxa, 0);
                amostras += cabe;
                feito += cabe;
                desde = System.currentTimeMillis();
            } else if (System.currentTimeMillis() - desde > LIMITE_MS) {
                throw new IOException("o codificador de áudio parou de responder");
            }
            drenar(false);
        }
    }

    private static short paraShort(float x) {
        float y = x * 32767f;
        if (y > 32767f) y = 32767f;
        if (y < -32768f) y = -32768f;
        return (short) Math.round(y);
    }

    /** Fecha o arquivo (tem de ser chamado para o .m4a ficar válido). */
    public void terminar() throws IOException {
        if (terminado) return;
        long desde = System.currentTimeMillis();
        while (true) {
            int ib = codec.dequeueInputBuffer(10000);
            if (ib >= 0) {
                codec.queueInputBuffer(ib, 0, 0, amostras * 1_000_000L / taxa, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                break;
            }
            drenar(false);
            if (System.currentTimeMillis() - desde > LIMITE_MS) throw new IOException("o codificador de áudio parou de responder");
        }
        drenar(true);
        terminado = true;
        if (!muxerIniciado) throw new IOException("o codificador não gerou áudio");
        muxer.stop();
    }

    private void drenar(boolean ateFim) throws IOException {
        long desde = System.currentTimeMillis();
        while (true) {
            int ob = codec.dequeueOutputBuffer(info, ateFim ? 10000 : 0);
            if (ob == MediaCodec.INFO_TRY_AGAIN_LATER) {
                if (!ateFim) return;
                if (System.currentTimeMillis() - desde > LIMITE_MS) throw new IOException("o codificador de áudio não terminou");
                continue;
            }
            if (ob == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                if (muxerIniciado) throw new IOException("formato do codificador mudou duas vezes");
                faixa = muxer.addTrack(codec.getOutputFormat());
                muxer.start();
                muxerIniciado = true;
                continue;
            }
            if (ob < 0) continue;
            ByteBuffer b = codec.getOutputBuffer(ob);
            if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0;
            if (b != null && info.size > 0 && muxerIniciado) {
                b.position(info.offset);
                b.limit(info.offset + info.size);
                muxer.writeSampleData(faixa, b, info);
            }
            codec.releaseOutputBuffer(ob, false);
            desde = System.currentTimeMillis();
            if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return;
        }
    }

    @Override
    public void close() {
        if (fechado) return;
        fechado = true;
        try {
            codec.stop();
        } catch (Exception e) {
            // nada
        }
        try {
            codec.release();
        } catch (Exception e) {
            // nada
        }
        try {
            muxer.release();
        } catch (Exception e) {
            // nada (muxer sem stop: arquivo inválido, que é apagado por quem chamou)
        }
    }

    /**
     * Atraso total de gravar em AAC e ler de volta neste celular (amostras a 44,1 kHz): o começo que o
     * codificador acrescenta. Mede com um estalo em 1 s num arquivo de teste. -1 se não der para medir.
     */
    public static int medirAtraso(File pasta) {
        File f = new File(pasta, "calibracao.m4a");
        int taxa = 44100;
        int n = 3 * taxa;
        int pos = taxa;
        int larg = 256;
        float[] e = new float[n];
        for (int i = 0; i < larg; i++) {
            double w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (larg - 1));
            e[pos + i] = (float) (0.8 * w * Math.sin(2 * Math.PI * 2000 * i / (double) taxa));
        }
        try {
            try (CodificadorAac c = new CodificadorAac(f, taxa, 128000)) {
                c.escrever(e, e, 0, n);
                c.terminar();
            }
            float[] lido = new float[n + 8192];
            int q = 0;
            try (DecodificadorAudio d = new DecodificadorAudio(f, taxa)) {
                float[] be = new float[4096], bd = new float[4096];
                int k;
                while ((k = d.ler(be, bd, 4096)) > 0 && q < lido.length) {
                    int c = Math.min(k, lido.length - q);
                    System.arraycopy(be, 0, lido, q, c);
                    q += c;
                }
            }
            // Onde o estalo lido mais se parece com o original (correlação)
            double melhor = -1;
            int onde = -1;
            for (int ini = pos - 512; ini <= pos + 8192 && ini + larg <= q; ini++) {
                if (ini < 0) continue;
                double s = 0;
                for (int i = 0; i < larg; i++) s += lido[ini + i] * e[pos + i];
                if (s > melhor) {
                    melhor = s;
                    onde = ini;
                }
            }
            if (onde < 0 || melhor <= 0) return -1;
            return Math.max(0, onde - pos);
        } catch (Exception ex) {
            return -1;
        } finally {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }
}
