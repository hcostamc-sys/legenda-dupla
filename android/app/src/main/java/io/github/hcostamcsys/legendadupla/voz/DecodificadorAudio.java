package io.github.hcostamcsys.legendadupla.voz;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;

/**
 * Lê um arquivo de áudio (m4a/AAC, webm/Opus...) com o decodificador do Android e entrega estéreo em ponto
 * flutuante (−1 a 1) na taxa pedida. Mono vira os dois canais; mais de dois canais: usa os dois primeiros.
 * Quando o arquivo informa o atraso do codificador (lista de edição do MP4), o próprio Android corta
 * esse começo, como o Chrome faz no player do YouTube.
 */
public final class DecodificadorAudio implements AutoCloseable {

    private final MediaExtractor extrator;
    private final MediaCodec codec;
    private final int taxaAlvo;
    private final long duracaoUs;
    private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
    private int taxa = 0, canais = 0, codificacao = AudioFormat.ENCODING_PCM_16BIT;
    private boolean fimEntrada = false, fimSaida = false;
    private Reamostrador reE, reD;
    private float[] tmpE = new float[8192], tmpD = new float[8192];
    private float[] resE = new float[8192], resD = new float[8192];
    private float[] filaE = new float[1 << 16], filaD = new float[1 << 16];
    private int filaIni = 0, filaTam = 0;
    private long pular = 0;
    private long semSaidaDesde = 0;

    public DecodificadorAudio(File arquivo, int taxaAlvo) throws IOException {
        this.taxaAlvo = taxaAlvo;
        extrator = new MediaExtractor();
        extrator.setDataSource(arquivo.getAbsolutePath());
        int faixa = -1;
        MediaFormat formato = null;
        for (int i = 0; i < extrator.getTrackCount(); i++) {
            MediaFormat f = extrator.getTrackFormat(i);
            String mime = f.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) {
                faixa = i;
                formato = f;
                break;
            }
        }
        if (faixa < 0) {
            extrator.release();
            throw new IOException("O arquivo não tem áudio.");
        }
        extrator.selectTrack(faixa);
        duracaoUs = formato.containsKey(MediaFormat.KEY_DURATION) ? formato.getLong(MediaFormat.KEY_DURATION) : 0;
        MediaCodec c;
        try {
            c = MediaCodec.createDecoderByType(formato.getString(MediaFormat.KEY_MIME));
            c.configure(formato, null, null, 0);
            c.start();
        } catch (Exception e) {
            extrator.release();
            throw new IOException("O celular não sabe ler este áudio (" + formato.getString(MediaFormat.KEY_MIME) + ").", e);
        }
        codec = c;
    }

    /** Duração informada pelo arquivo (0: não informada). */
    public long duracaoUs() {
        return duracaoUs;
    }

    /** Descarta as primeiras "amostras" (na taxa pedida): compensa o atraso de um codificador. */
    public void pularInicio(long amostras) {
        pular = Math.max(0, amostras);
    }

    /** Lê até max amostras por canal (de 0 em diante). Devolve quantas; 0 = fim do arquivo. */
    public int ler(float[] e, float[] d, int max) throws IOException {
        return ler(e, d, 0, max);
    }

    /** Lê até max amostras por canal, gravando de e[ini] e d[ini] em diante. Devolve quantas; 0 = fim. */
    public int ler(float[] e, float[] d, int ini, int max) throws IOException {
        semSaidaDesde = System.currentTimeMillis();
        while (filaTam == 0 && !fimSaida) passo();
        int q = Math.min(max, filaTam);
        System.arraycopy(filaE, filaIni, e, ini, q);
        System.arraycopy(filaD, filaIni, d, ini, q);
        filaIni += q;
        filaTam -= q;
        if (filaTam == 0) filaIni = 0;
        return q;
    }

    private void passo() throws IOException {
        if (!fimEntrada) {
            int ib = codec.dequeueInputBuffer(10000);
            if (ib >= 0) {
                ByteBuffer b = codec.getInputBuffer(ib);
                int n = b == null ? -1 : extrator.readSampleData(b, 0);
                if (n < 0) {
                    codec.queueInputBuffer(ib, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                    fimEntrada = true;
                } else {
                    codec.queueInputBuffer(ib, 0, n, Math.max(0, extrator.getSampleTime()), 0);
                    extrator.advance();
                }
            }
        }
        int ob = codec.dequeueOutputBuffer(info, 10000);
        if (ob == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            lerFormato(codec.getOutputFormat());
        } else if (ob >= 0) {
            if (taxa == 0) lerFormato(codec.getOutputFormat(ob));
            ByteBuffer b = codec.getOutputBuffer(ob);
            if (b != null && info.size > 0) converter(b, info.offset, info.size);
            codec.releaseOutputBuffer(ob, false);
            semSaidaDesde = System.currentTimeMillis();
            if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) terminar();
        } else if (fimEntrada && System.currentTimeMillis() - semSaidaDesde > 15000) {
            // Alguns decodificadores não avisam o fim: sem saída há 15 s depois do fim da entrada, acabou.
            terminar();
        }
    }

    private void lerFormato(MediaFormat f) {
        if (f == null) return;
        if (f.containsKey(MediaFormat.KEY_SAMPLE_RATE)) taxa = f.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        if (f.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) canais = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        if (f.containsKey(MediaFormat.KEY_PCM_ENCODING)) codificacao = f.getInteger(MediaFormat.KEY_PCM_ENCODING);
        if (taxa > 0 && taxa != taxaAlvo && reE == null) {
            reE = new Reamostrador(taxa, taxaAlvo);
            reD = new Reamostrador(taxa, taxaAlvo);
        }
    }

    private void converter(ByteBuffer b, int ini, int tam) {
        int ch = Math.max(1, canais);
        b.position(ini);
        b.limit(ini + tam);
        ByteBuffer bb = b.slice().order(ByteOrder.nativeOrder());
        int quadros;
        if (codificacao == AudioFormat.ENCODING_PCM_FLOAT) {
            FloatBuffer fb = bb.asFloatBuffer();
            quadros = fb.remaining() / ch;
            garantirTmp(quadros);
            for (int i = 0; i < quadros; i++) {
                tmpE[i] = fb.get(i * ch);
                tmpD[i] = ch > 1 ? fb.get(i * ch + 1) : tmpE[i];
            }
        } else {
            ShortBuffer sb = bb.asShortBuffer();
            quadros = sb.remaining() / ch;
            garantirTmp(quadros);
            for (int i = 0; i < quadros; i++) {
                tmpE[i] = sb.get(i * ch) / 32768f;
                tmpD[i] = ch > 1 ? sb.get(i * ch + 1) / 32768f : tmpE[i];
            }
        }
        if (reE == null) {
            enfileirar(tmpE, tmpD, quadros);
        } else {
            garantirRes(quadros);
            int q = reE.processar(tmpE, 0, quadros, resE);
            reD.processar(tmpD, 0, quadros, resD);
            enfileirar(resE, resD, q);
        }
    }

    private void terminar() {
        fimSaida = true;
        if (reE != null) {
            garantirRes(4096);
            int q = reE.terminar(resE);
            reD.terminar(resD);
            enfileirar(resE, resD, q);
        }
    }

    private void garantirTmp(int n) {
        if (tmpE.length < n) {
            tmpE = new float[n];
            tmpD = new float[n];
        }
    }

    private void garantirRes(int quadrosEntrada) {
        int n = quadrosEntrada * 2 + 4096; // cabe mesmo subindo a taxa (até 2×)
        if (resE.length < n) {
            resE = new float[n];
            resD = new float[n];
        }
    }

    private void enfileirar(float[] e, float[] d, int n) {
        int ini = 0;
        if (pular > 0) {
            int p = (int) Math.min(pular, n);
            pular -= p;
            ini = p;
            n -= p;
        }
        if (n <= 0) return;
        if (filaIni > 0 && filaIni + filaTam + n > filaE.length) {
            System.arraycopy(filaE, filaIni, filaE, 0, filaTam);
            System.arraycopy(filaD, filaIni, filaD, 0, filaTam);
            filaIni = 0;
        }
        if (filaTam + n > filaE.length) {
            int novo = Math.max(filaE.length * 2, filaTam + n);
            float[] ne = new float[novo], nd = new float[novo];
            System.arraycopy(filaE, filaIni, ne, 0, filaTam);
            System.arraycopy(filaD, filaIni, nd, 0, filaTam);
            filaE = ne;
            filaD = nd;
            filaIni = 0;
        }
        System.arraycopy(e, ini, filaE, filaIni + filaTam, n);
        System.arraycopy(d, ini, filaD, filaIni + filaTam, n);
        filaTam += n;
    }

    @Override
    public void close() {
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
            extrator.release();
        } catch (Exception e) {
            // nada
        }
    }
}
