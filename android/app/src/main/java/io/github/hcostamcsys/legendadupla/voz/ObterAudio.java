package io.github.hcostamcsys.legendadupla.voz;

import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.services.youtube.ItagItem;
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.AudioTrackType;
import org.schabi.newpipe.extractor.stream.DeliveryMethod;
import org.schabi.newpipe.extractor.stream.StreamExtractor;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Baixa o áudio de um vídeo do YouTube com o NewPipe Extractor (o mesmo do app NewPipe; licença GPL-3.0).
 *
 * Desde a versão 0.27 (10/11/2026) o extractor pede os endereços como o app do YouTube do Apple Vision Pro
 * (cliente "visionOS"), que não exige o token de integridade (poToken). O download repete o que o player
 * do NewPipe 0.29.3 faz com esses endereços (YoutubeHttpDataSource): POST com o corpo "x\0", o parâmetro
 * &rn= com o número do pedido, o agente de usuário do visionOS e o cabeçalho Range, em pedaços.
 * Java puro (sem Android).
 */
public final class ObterAudio {

    /** Pedaço de cada pedido (o YouTube limita a velocidade de pedidos muito grandes). */
    static final int PEDACO = 2 * 1024 * 1024;
    private static final byte[] CORPO_POST = {0x78, 0};
    private static final Pattern FAIXA = Pattern.compile("bytes\\s+(\\d+)-(\\d+)/(\\d+|\\*)");

    private static volatile boolean iniciado = false;

    public interface Andamento {
        /** feitos e total em bytes (total 0: ainda não se sabe). Devolve false para parar. */
        boolean aoAndamento(long feitos, long total);
    }

    /** Erro com mensagem já escrita para pessoas. */
    public static final class Aviso extends IOException {
        public Aviso(String mensagem, Throwable causa) {
            super(mensagem, causa);
        }
    }

    public static final class Parado extends IOException {
        public Parado() {
            super("parado");
        }
    }

    /** O áudio escolhido de um vídeo. */
    public static final class Escolha {
        public final String url;
        public final String formato; // "m4a" ou "webm"
        public final String codec;
        public final int bitrate;
        public final long tamanho; // bytes (0: não informado)
        public final long duracaoSeg;
        public final String titulo;
        public final String trilha;

        Escolha(String url, String formato, String codec, int bitrate, long tamanho, long duracaoSeg, String titulo, String trilha) {
            this.url = url;
            this.formato = formato;
            this.codec = codec;
            this.bitrate = bitrate;
            this.tamanho = tamanho;
            this.duracaoSeg = duracaoSeg;
            this.titulo = titulo;
            this.trilha = trilha;
        }

        @Override
        public String toString() {
            return formato + " " + codec + " " + bitrate + " bps, " + tamanho + " bytes, " + duracaoSeg + " s, trilha " + trilha;
        }
    }

    public static synchronized void iniciar(String pais) {
        if (iniciado) return;
        String p = pais == null ? "" : pais.trim().toUpperCase(java.util.Locale.ROOT);
        ContentCountry cc = p.matches("[A-Z]{2}") ? new ContentCountry(p) : ContentCountry.DEFAULT;
        NewPipe.init(new BaixadorHttp(), Localization.DEFAULT, cc);
        iniciado = true;
    }

    /** Pergunta ao YouTube os áudios do vídeo e escolhe o melhor para separar a voz. */
    public static Escolha escolher(String videoId) throws IOException {
        if (!iniciado) iniciar("");
        StreamExtractor ex;
        List<AudioStream> lista;
        String titulo = "";
        long duracao = 0;
        try {
            ex = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=" + videoId);
            ex.fetchPage();
            lista = ex.getAudioStreams();
            try {
                titulo = ex.getName();
            } catch (Exception e) {
                // nada
            }
            try {
                duracao = ex.getLength();
            } catch (Exception e) {
                // nada
            }
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new Aviso(mensagemExtracao(e), e);
        }
        AudioStream melhor = null;
        int melhorNota = Integer.MIN_VALUE;
        boolean temOriginal = false;
        for (AudioStream a : lista) if (a.getAudioTrackType() == AudioTrackType.ORIGINAL) temOriginal = true;
        for (AudioStream a : lista) {
            if (a.getDeliveryMethod() != DeliveryMethod.PROGRESSIVE_HTTP || !a.isUrl()) continue;
            MediaFormat f = a.getFormat();
            if (f != MediaFormat.M4A && f != MediaFormat.WEBMA && f != MediaFormat.WEBMA_OPUS) continue;
            AudioTrackType t = a.getAudioTrackType();
            if (temOriginal && t != AudioTrackType.ORIGINAL) continue; // vídeo dublado: só o áudio original
            if (t == AudioTrackType.DESCRIPTIVE) continue;
            int nota = 0;
            if (f == MediaFormat.M4A) nota += 1_000_000; // AAC a 44,1 kHz: o modelo trabalha nessa taxa
            ItagItem it = a.getItagItem();
            if (it != null && Boolean.TRUE.equals(it.isDrc())) nota -= 500_000; // prefere o volume original
            int br = Math.max(a.getAverageBitrate(), a.getBitrate());
            nota += Math.min(br, 400_000) / 1000;
            if (nota > melhorNota) {
                melhorNota = nota;
                melhor = a;
            }
        }
        if (melhor == null) {
            throw new Aviso("O YouTube não entregou o áudio deste vídeo num formato que o app consiga baixar.", null);
        }
        ItagItem it = melhor.getItagItem();
        long tamanho = it == null ? 0 : Math.max(0, it.getContentLength());
        String trilha = melhor.getAudioTrackType() == null ? "?" : melhor.getAudioTrackType().name();
        String formato = melhor.getFormat() == MediaFormat.M4A ? "m4a" : "webm";
        int br = Math.max(melhor.getAverageBitrate(), melhor.getBitrate());
        return new Escolha(melhor.getContent(), formato, String.valueOf(melhor.getCodec()), br, tamanho, duracao, titulo, trilha);
    }

    static String mensagemExtracao(Exception e) {
        String nome = e.getClass().getSimpleName();
        String m = String.valueOf(e.getMessage());
        if (nome.contains("AgeRestricted")) return "O vídeo tem restrição de idade: o YouTube não entrega o áudio sem conta.";
        if (nome.contains("Private")) return "O vídeo é privado.";
        if (nome.contains("Paid") || nome.contains("MusicPremium")) return "O vídeo é pago ou só para membros.";
        if (nome.contains("Geographic")) return "O vídeo não está disponível no país.";
        if (nome.contains("SignInConfirmNotBot") || nome.contains("ReCaptcha") || m.contains("a bot")) {
            return "O YouTube pediu uma verificação de robô para esta internet. Tente mais tarde ou em outra rede (Wi‑Fi ou dados móveis).";
        }
        if (nome.contains("ContentNotAvailable")) return "O YouTube disse que o vídeo não está disponível para baixar o áudio.";
        return "Não consegui pegar o áudio no YouTube. Pode ser uma mudança do YouTube: tente mais tarde; se continuar, o app precisa de atualização.";
    }

    /**
     * Baixa o áudio para "destino", continuando de onde parou se o arquivo já existir pela metade.
     * Pedidos de até PEDACO bytes; tenta de novo pedaços que falharem.
     */
    public static void baixar(Escolha e, File destino, Andamento andamento) throws IOException {
        long total = e.tamanho;
        long feito = destino.isFile() ? destino.length() : 0;
        if (total > 0 && feito > total) {
            //noinspection ResultOfMethodCallIgnored
            destino.delete();
            feito = 0;
        }
        int pedido = 0;
        boolean usarPost = true;
        int falhasSeguidas = 0;
        try (OutputStream out = new FileOutputStream(destino, feito > 0)) {
            while (total <= 0 || feito < total) {
                if (!andamento.aoAndamento(feito, total)) throw new Parado();
                long fim = feito + PEDACO - 1;
                if (total > 0) fim = Math.min(fim, total - 1);
                HttpURLConnection c = null;
                try {
                    c = abrir(e.url, pedido++, feito, fim, usarPost);
                    int st = c.getResponseCode();
                    if ((st == 405 || st == 400) && usarPost) {
                        usarPost = false; // o servidor não quis POST: tenta GET (como o downloader do NewPipe)
                        continue;
                    }
                    if (st == 403) throw new Aviso("O YouTube recusou o download do áudio (403). Tente de novo mais tarde.", null);
                    if (st != 206 && st != 200) throw new IOException("HTTP " + st);
                    if (st == 200 && feito > 0) {
                        // O servidor ignorou o Range e mandou desde o começo: recomeça o arquivo.
                        throw new IOException("Range ignorado");
                    }
                    String cr = c.getHeaderField("Content-Range");
                    if (cr != null) {
                        Matcher m = FAIXA.matcher(cr);
                        if (m.find() && !"*".equals(m.group(3))) total = Long.parseLong(m.group(3));
                    } else if (st == 200 && c.getContentLengthLong() > 0) {
                        total = c.getContentLengthLong();
                    }
                    long antes = feito;
                    try (InputStream in = c.getInputStream()) {
                        byte[] buf = new byte[65536];
                        int lidos;
                        while ((lidos = in.read(buf)) > 0) {
                            out.write(buf, 0, lidos);
                            feito += lidos;
                            if (!andamento.aoAndamento(feito, total)) throw new Parado();
                        }
                    }
                    if (feito == antes) throw new IOException("resposta vazia");
                    falhasSeguidas = 0;
                    if (st == 200) break; // veio tudo de uma vez
                } catch (Parado | Aviso p) {
                    throw p;
                } catch (IOException io) {
                    if (++falhasSeguidas > 5) throw io;
                    out.flush();
                    if ("Range ignorado".equals(io.getMessage())) throw new IOException("O servidor não aceitou continuar o download.", io);
                    dormir(1500L * falhasSeguidas, andamento, feito, total);
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }
        if (total > 0 && destino.length() != total) {
            throw new IOException("O download do áudio veio incompleto (" + destino.length() + " de " + total + " bytes).");
        }
        andamento.aoAndamento(feito, total);
    }

    private static void dormir(long ms, Andamento a, long feito, long total) throws IOException {
        long fim = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < fim) {
            if (!a.aoAndamento(feito, total)) throw new Parado();
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new Parado();
            }
        }
    }

    private static HttpURLConnection abrir(String url, int numero, long de, long ate, boolean post) throws IOException {
        String u = url;
        if (u.contains("/videoplayback")) u += "&rn=" + numero;
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", YoutubeParsingHelper.isVisionOsStreamingUrl(url)
                ? YoutubeParsingHelper.getVisionOsUserAgent(null) : BaixadorHttp.AGENTE);
        c.setRequestProperty("Accept", "*/*");
        c.setRequestProperty("Accept-Encoding", "identity");
        c.setRequestProperty("Range", "bytes=" + de + "-" + ate);
        if (post) {
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(CORPO_POST.length);
            try (OutputStream o = c.getOutputStream()) {
                o.write(CORPO_POST);
            }
        }
        return c;
    }

    /** Para o diagnóstico: todos os áudios que o YouTube ofereceu. */
    public static List<String> listar(String videoId) throws Exception {
        if (!iniciado) iniciar("");
        StreamExtractor ex = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=" + videoId);
        ex.fetchPage();
        List<String> r = new ArrayList<>();
        for (AudioStream a : ex.getAudioStreams()) {
            r.add(a.getItag() + " " + a.getFormat() + " " + a.getCodec() + " " + a.getAverageBitrate() + " "
                    + a.getDeliveryMethod() + " " + a.getAudioTrackType() + " " + (a.getItagItem() == null ? "" : a.getItagItem().getContentLength()));
        }
        return r;
    }
}
