package io.github.hcostamcsys.legendadupla.voz;

import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;

/**
 * Ponte entre o NewPipe Extractor e a internet (HttpURLConnection, sem bibliotecas a mais).
 * Mesmo comportamento do DownloaderImpl do app NewPipe (v0.29.3): agente de usuário do Firefox,
 * cabeçalhos do pedido por cima dos padrões e HTTP 429 vira ReCaptchaException.
 * Java puro (sem Android).
 */
public final class BaixadorHttp extends Downloader {

    public static final String AGENTE =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0";

    @Override
    public Response execute(Request pedido) throws IOException, ReCaptchaException {
        String metodo = pedido.httpMethod();
        String url = pedido.url();
        byte[] corpo = pedido.dataToSend();
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestMethod(metodo);
            c.setRequestProperty("User-Agent", AGENTE);
            c.setRequestProperty("Accept-Encoding", "gzip");
            Map<String, List<String>> cab = pedido.headers();
            if (cab != null) {
                for (Map.Entry<String, List<String>> e : cab.entrySet()) {
                    if (e.getKey() == null || e.getValue() == null) continue;
                    boolean primeiro = true;
                    for (String v : e.getValue()) {
                        if (primeiro) c.setRequestProperty(e.getKey(), v);
                        else c.addRequestProperty(e.getKey(), v);
                        primeiro = false;
                    }
                }
            }
            if (corpo != null) {
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(corpo.length);
                try (OutputStream o = c.getOutputStream()) {
                    o.write(corpo);
                }
            }
            int codigo = c.getResponseCode();
            if (codigo == 429) throw new ReCaptchaException("reCaptcha Challenge requested", url);
            String texto = "";
            InputStream in = null;
            try {
                in = codigo >= 400 ? c.getErrorStream() : c.getInputStream();
            } catch (IOException e) {
                in = c.getErrorStream();
            }
            if (in != null && !"HEAD".equalsIgnoreCase(metodo)) {
                if ("gzip".equalsIgnoreCase(c.getContentEncoding())) in = new GZIPInputStream(in);
                try (InputStream i = in) {
                    ByteArrayOutputStream b = new ByteArrayOutputStream();
                    byte[] buf = new byte[16384];
                    int lidos;
                    while ((lidos = i.read(buf)) > 0) b.write(buf, 0, lidos);
                    texto = new String(b.toByteArray(), StandardCharsets.UTF_8);
                }
            } else if (in != null) {
                in.close();
            }
            Map<String, List<String>> resp = new HashMap<>();
            for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                if (e.getKey() != null) resp.put(e.getKey(), e.getValue());
            }
            String msg = c.getResponseMessage();
            return new Response(codigo, msg == null ? "" : msg, resp, texto, c.getURL().toString());
        } finally {
            c.disconnect();
        }
    }
}
