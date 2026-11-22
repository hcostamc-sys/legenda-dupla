package io.github.hcostamcsys.legendadupla;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Download dos pacotes de pontuação melhorada feito pelo Android (serviço em primeiro plano):
 * continua com o app em segundo plano ou com a tela desligada, mostrando o andamento nas notificações,
 * como a Play Store e o Google Tradutor. A página manda a lista de arquivos; os arquivos ficam em
 * files/modelos/0, 1, 2...; a página os lê pelo endereço PAGINA + "__ld_modelo/N" (entregue pela
 * MainActivity a partir do arquivo) e grava no cache dela. Depois pede para apagar.
 *
 * Estado (estado.json, também enviado à página): { id, nome, estado: baixando|pronto|erro|cancelado,
 * feitos, total, erro, arquivos: [{ url, bytes, local }] }.
 */
public class ServicoModelos extends Service {

    static final String ACAO_BAIXAR = "io.github.hcostamcsys.legendadupla.BAIXAR_MODELOS";
    static final String ACAO_CANCELAR = "io.github.hcostamcsys.legendadupla.CANCELAR_MODELOS";
    static final String EXTRA_PEDIDO = "pedido";
    static final String PREFIXO_LOCAL = "https://hcostamc-sys.github.io/legenda-dupla/__ld_modelo/";

    private static final String CANAL = "downloads";
    static final int NOTIF_PROGRESSO = 41;
    static final int NOTIF_FIM = 42;
    private static final int TENTATIVAS = 6;

    /** Quem recebe o estado (a MainActivity enquanto existe). Chamado fora da thread da tela. */
    interface Ouvinte {
        void aoEstado(String json);
    }

    static volatile Ouvinte ouvinte;
    /** A MainActivity está na frente: no fim, não precisa de notificação de "concluído". */
    static volatile boolean appVisivel;

    private static final Object TRAVA = new Object();
    private static JSONObject estado; // null: ainda não leu o arquivo
    private static volatile boolean rodando;
    private static volatile boolean cancelar; // apaga o que já baixou
    private static volatile boolean parar; // para e guarda os pedaços (limite de tempo do Android)

    private Thread trabalho;
    private PowerManager.WakeLock travaCpu;
    private long ultimaNotificacao;

    // ------------------------------------------------------------------ estado (compartilhado)

    static File pasta(Context c) {
        return new File(c.getFilesDir(), "modelos");
    }

    private static File arquivoEstado(Context c) {
        return new File(pasta(c), "estado.json");
    }

    /** Estado atual em JSON. Download marcado "baixando" sem o serviço rodando foi interrompido. */
    static String estadoAtual(Context c) {
        synchronized (TRAVA) {
            carregar(c);
            if (estado == null) return "{\"estado\":\"nada\"}";
            if ("baixando".equals(estado.optString("estado")) && !rodando) {
                try {
                    estado.put("estado", "erro");
                    estado.put("erro", "O download foi interrompido. Toque em Baixar de novo: ele continua de onde parou.");
                } catch (Exception e) {
                    // nada
                }
                salvar(c);
            }
            return estado.toString();
        }
    }

    private static void carregar(Context c) {
        if (estado != null) return;
        File f = arquivoEstado(c);
        if (!f.exists()) return;
        try (InputStream in = new FileInputStream(f)) {
            byte[] dados = new byte[(int) Math.min(f.length(), 1 << 20)];
            int lidos = 0, n;
            while (lidos < dados.length && (n = in.read(dados, lidos, dados.length - lidos)) > 0) lidos += n;
            estado = new JSONObject(new String(dados, 0, lidos, StandardCharsets.UTF_8));
        } catch (Exception e) {
            estado = null;
        }
    }

    private static void salvar(Context c) {
        if (estado == null) return;
        File p = pasta(c);
        if (!p.exists() && !p.mkdirs()) return;
        try (OutputStream out = new FileOutputStream(arquivoEstado(c))) {
            out.write(estado.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            // nada: o estado em memória continua valendo
        }
    }

    private static void avisar(String json) {
        Ouvinte o = ouvinte;
        if (o != null) o.aoEstado(json);
    }

    /** Apaga os arquivos baixados e o estado (a página já copiou, ou desistiu). Não mexe num download em andamento. */
    static void apagarTudo(Context c) {
        synchronized (TRAVA) {
            if (rodando) return;
            apagarPasta(pasta(c));
            estado = null;
        }
    }

    private static void apagarPasta(File p) {
        File[] lista = p.listFiles();
        if (lista != null) for (File f : lista) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    /** Entrega à WebView um arquivo baixado (PREFIXO_LOCAL + número), ou null se não for um deles. */
    static WebResourceResponse responder(Context c, String url) {
        if (url == null || !url.startsWith(PREFIXO_LOCAL)) return null;
        String resto = url.substring(PREFIXO_LOCAL.length());
        int q = resto.indexOf('?');
        if (q >= 0) resto = resto.substring(0, q);
        Map<String, String> cab = new HashMap<>();
        cab.put("Cache-Control", "no-store");
        if (!resto.matches("[0-9]{1,2}")) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", cab, new ByteArrayInputStream(new byte[0]));
        File f = new File(pasta(c), resto);
        if (!f.isFile()) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", cab, new ByteArrayInputStream(new byte[0]));
        try {
            cab.put("Content-Length", String.valueOf(f.length()));
            return new WebResourceResponse("application/octet-stream", null, 200, "OK", cab, new FileInputStream(f));
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 500, "Error", cab, new ByteArrayInputStream(new byte[0]));
        }
    }

    // ------------------------------------------------------------------ serviço

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String acao = intent == null ? "" : String.valueOf(intent.getAction());
        if (ACAO_CANCELAR.equals(acao)) {
            cancelar = true;
            if (!rodando) {
                terminarCancelado();
                stopSelf();
            }
            return START_NOT_STICKY;
        }
        if (!ACAO_BAIXAR.equals(acao)) {
            if (!rodando) stopSelf();
            return START_NOT_STICKY;
        }
        // Iniciado com startForegroundService: tem de virar primeiro plano já, mesmo se for ignorar o pedido.
        String nome = "";
        JSONObject pedido = null;
        try {
            pedido = new JSONObject(intent.getStringExtra(EXTRA_PEDIDO));
            nome = pedido.optString("nome", "");
        } catch (Exception e) {
            // pedido inválido
        }
        entrarPrimeiroPlano(nome);
        if (rodando) return START_NOT_STICKY; // já baixando: a página recebe o andamento
        if (pedido == null) {
            sairPrimeiroPlano();
            stopSelf();
            return START_NOT_STICKY;
        }
        iniciar(pedido);
        return START_NOT_STICKY;
    }

    private void entrarPrimeiroPlano(String nome) {
        criarCanal();
        Notification n = notificacaoProgresso(nome, 0, 0);
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIF_PROGRESSO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIF_PROGRESSO, n);
            }
        } catch (Exception e) {
            // Sem permissão de primeiro plano (não deveria acontecer): baixa assim mesmo.
        }
    }

    private void sairPrimeiroPlano() {
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    private void iniciar(JSONObject pedido) {
        JSONArray lista = pedido.optJSONArray("arquivos");
        String id = pedido.optString("id", "");
        if (lista == null || lista.length() == 0 || lista.length() > 10 || id.isEmpty()) {
            sairPrimeiroPlano();
            stopSelf();
            return;
        }
        JSONObject novo = new JSONObject();
        JSONArray arquivos = new JSONArray();
        long total = 0;
        try {
            for (int i = 0; i < lista.length(); i++) {
                JSONObject a = lista.getJSONObject(i);
                String url = a.getString("url");
                long bytes = a.getLong("bytes");
                // Só os endereços dos pacotes: Hugging Face e o próprio site.
                if (!url.startsWith("https://huggingface.co/") && !url.startsWith("https://hcostamc-sys.github.io/legenda-dupla/")) {
                    throw new IllegalArgumentException("endereço não permitido");
                }
                if (bytes <= 0) throw new IllegalArgumentException("tamanho inválido");
                JSONObject b = new JSONObject();
                b.put("url", url);
                b.put("bytes", bytes);
                b.put("local", PREFIXO_LOCAL + i);
                arquivos.put(b);
                total += bytes;
            }
            novo.put("id", id);
            novo.put("nome", pedido.optString("nome", ""));
            novo.put("estado", "baixando");
            novo.put("feitos", 0);
            novo.put("total", total);
            novo.put("arquivos", arquivos);
        } catch (Exception e) {
            sairPrimeiroPlano();
            stopSelf();
            return;
        }
        synchronized (TRAVA) {
            carregar(this);
            // Outro pacote baixado pela metade (ou já baixado e não copiado): descarta.
            // O mesmo pacote: mantém os pedaços, para continuar de onde parou.
            if (estado == null || !id.equals(estado.optString("id")) || !mesmosArquivos(estado.optJSONArray("arquivos"), arquivos)) {
                apagarPasta(pasta(this));
            }
            estado = novo;
            cancelar = false;
            parar = false;
            rodando = true;
            salvar(this);
        }
        avisar(novo.toString());
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            travaCpu = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LegendaDupla:modelos");
            travaCpu.setReferenceCounted(false);
            travaCpu.acquire(3 * 60 * 60 * 1000L); // limite de segurança: 3 horas
        }
        final JSONArray copia = arquivos;
        final long totalFinal = total;
        trabalho = new Thread(() -> baixarTudo(copia, totalFinal), "download-modelos");
        trabalho.start();
    }

    private static boolean mesmosArquivos(JSONArray a, JSONArray b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject x = a.optJSONObject(i), y = b.optJSONObject(i);
            if (x == null || y == null) return false;
            if (!x.optString("url").equals(y.optString("url")) || x.optLong("bytes") != y.optLong("bytes")) return false;
        }
        return true;
    }

    /** Sinal de cancelamento (dentro do download). */
    private static class Cancelado extends Exception {
    }

    private final long[] feitosPorArquivo = new long[10];

    private long somaFeitos(int n) {
        long s = 0;
        for (int i = 0; i < n; i++) s += feitosPorArquivo[i];
        return s;
    }

    private void baixarTudo(JSONArray arquivos, long total) {
        File p = pasta(this);
        String erro = null;
        boolean cancelado = false;
        try {
            if (!p.exists() && !p.mkdirs()) throw new IOException("Não consegui criar a pasta do pacote.");
            int n = arquivos.length();
            long restante = 0;
            for (int i = 0; i < n; i++) {
                JSONObject a = arquivos.getJSONObject(i);
                File fim = new File(p, String.valueOf(i));
                File parte = new File(p, i + ".part");
                long bytes = a.getLong("bytes");
                feitosPorArquivo[i] = fim.length() == bytes ? bytes : Math.min(parte.length(), bytes);
                restante += bytes - feitosPorArquivo[i];
            }
            // Espaço: o que falta baixar, mais a cópia que a página guarda depois, mais uma folga.
            if (p.getUsableSpace() < restante + total + 50_000_000L) {
                throw new IOException("Falta espaço no celular para o pacote.");
            }
            progresso(somaFeitos(n), total, true);
            for (int i = 0; i < n; i++) {
                JSONObject a = arquivos.getJSONObject(i);
                long bytes = a.getLong("bytes");
                File fim = new File(p, String.valueOf(i));
                if (fim.length() == bytes) continue;
                File parte = new File(p, i + ".part");
                for (int tentativa = 1; ; tentativa++) {
                    try {
                        baixarArquivo(a.getString("url"), parte, bytes, i, n, total);
                        if (!parte.renameTo(fim)) throw new IOException("Não consegui gravar o arquivo.");
                        break;
                    } catch (Cancelado c) {
                        throw c;
                    } catch (IOException e) {
                        if (tentativa >= TENTATIVAS) throw e;
                        // Internet caiu ou trocou de rede: espera um pouco e continua de onde parou.
                        dormir(Math.min(30000L, 3000L * tentativa));
                    }
                }
            }
        } catch (Cancelado c) {
            if (cancelar) cancelado = true;
            else erro = "O Android pausou o download. Toque em Baixar de novo: ele continua de onde parou.";
        } catch (Exception e) {
            String m = e.getMessage();
            erro = (m == null || m.isEmpty()) ? "Não consegui baixar." : m;
            if (e instanceof java.net.UnknownHostException || e instanceof java.net.SocketTimeoutException
                    || e instanceof java.net.ConnectException) {
                erro = "Sem internet ou conexão muito lenta.";
            }
        }
        terminar(cancelado, erro);
    }

    private void dormir(long ms) throws Cancelado {
        long fim = SystemClock.elapsedRealtime() + ms;
        while (SystemClock.elapsedRealtime() < fim) {
            if (cancelar || parar) throw new Cancelado();
            SystemClock.sleep(250);
        }
    }

    /** Baixa um arquivo para "parte", continuando de onde parou (Range), e confere o tamanho. */
    private void baixarArquivo(String endereco, File parte, long bytes, int indice, int n, long total)
            throws IOException, Cancelado {
        if (cancelar || parar) throw new Cancelado();
        long ja = parte.length();
        if (ja > bytes) {
            //noinspection ResultOfMethodCallIgnored
            parte.delete();
            ja = 0;
        }
        if (ja == bytes) return;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(endereco).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("Accept-Encoding", "identity"); // sem compressão: o tamanho confere
            c.setRequestProperty("User-Agent", "LegendaDupla-Android");
            if (ja > 0) c.setRequestProperty("Range", "bytes=" + ja + "-");
            int status = c.getResponseCode();
            boolean anexar;
            if (status == 206 && ja > 0) {
                anexar = true;
            } else if (status == 200) {
                anexar = false; // o servidor mandou desde o começo
                ja = 0;
            } else if (status == 416) {
                //noinspection ResultOfMethodCallIgnored
                parte.delete();
                feitosPorArquivo[indice] = 0;
                throw new IOException("O download recomeçou do início.");
            } else {
                throw new IOException("O servidor respondeu " + status + ".");
            }
            feitosPorArquivo[indice] = ja;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(parte, anexar)) {
                byte[] buf = new byte[65536];
                int lidos;
                while ((lidos = in.read(buf)) > 0) {
                    if (cancelar || parar) throw new Cancelado();
                    if (feitosPorArquivo[indice] + lidos > bytes) throw new IOException("O arquivo veio maior que o esperado.");
                    out.write(buf, 0, lidos);
                    feitosPorArquivo[indice] += lidos;
                    progresso(somaFeitos(n), total, false);
                }
            }
            if (parte.length() != bytes) {
                if (parte.length() > bytes) {
                    //noinspection ResultOfMethodCallIgnored
                    parte.delete();
                    feitosPorArquivo[indice] = 0;
                }
                throw new IOException("O download veio incompleto (" + parte.length() + " de " + bytes + " bytes).");
            }
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Atualiza notificação e página (no máximo a cada 0,5 s). */
    private void progresso(long feitos, long total, boolean agora) {
        long t = SystemClock.elapsedRealtime();
        if (!agora && t - ultimaNotificacao < 500) return;
        ultimaNotificacao = t;
        String json;
        String nome;
        synchronized (TRAVA) {
            if (estado == null) return;
            try {
                estado.put("feitos", feitos);
            } catch (Exception e) {
                // nada
            }
            json = estado.toString();
            nome = estado.optString("nome", "");
        }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_PROGRESSO, notificacaoProgresso(nome, feitos, total));
        avisar(json);
    }

    private void terminar(boolean cancelado, String erro) {
        String json;
        String nome;
        synchronized (TRAVA) {
            rodando = false;
            nome = estado == null ? "" : estado.optString("nome", "");
            if (cancelado) {
                String id = estado == null ? "" : estado.optString("id", "");
                apagarPasta(pasta(this));
                estado = null;
                json = "{\"estado\":\"cancelado\",\"id\":" + JSONObject.quote(id) + "}";
            } else {
                try {
                    if (estado == null) estado = new JSONObject();
                    if (erro == null) {
                        estado.put("estado", "pronto");
                        estado.put("feitos", estado.optLong("total"));
                    } else {
                        estado.put("estado", "erro");
                        estado.put("erro", erro);
                    }
                } catch (Exception e) {
                    // nada
                }
                salvar(this);
                json = estado.toString();
            }
        }
        if (travaCpu != null && travaCpu.isHeld()) travaCpu.release();
        sairPrimeiroPlano();
        // Com o app aberto, a própria página avisa; com o app em segundo plano, fica a notificação.
        if (!cancelado && !appVisivel) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_FIM, notificacaoFim(nome, erro));
        }
        avisar(json);
        stopSelf();
    }

    private void terminarCancelado() {
        String id;
        synchronized (TRAVA) {
            carregar(this);
            id = estado == null ? "" : estado.optString("id", "");
            apagarPasta(pasta(this));
            estado = null;
        }
        sairPrimeiroPlano();
        avisar("{\"estado\":\"cancelado\",\"id\":" + JSONObject.quote(id) + "}");
    }

    @Override
    public void onTimeout(int startId, int tipo) {
        // Android 15: limite de tempo do download em primeiro plano. Para e deixa continuar depois.
        cancelarPorTempo();
    }

    @Override
    public void onTimeout(int startId) {
        cancelarPorTempo();
    }

    private void cancelarPorTempo() {
        parar = true; // o download termina com "erro" e guarda os pedaços (terminar() faz o resto)
        sairPrimeiroPlano();
    }

    @Override
    public void onDestroy() {
        if (travaCpu != null && travaCpu.isHeld()) travaCpu.release();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ notificações

    private void criarCanal() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CANAL) != null) return;
        NotificationChannel canal = new NotificationChannel(CANAL, getString(R.string.canal_downloads),
                NotificationManager.IMPORTANCE_LOW); // sem som
        nm.createNotificationChannel(canal);
    }

    private PendingIntent abrirApp() {
        Intent i = new Intent(this, MainActivity.class);
        i.setAction(Intent.ACTION_MAIN);
        i.addCategory(Intent.CATEGORY_LAUNCHER);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static String titulo(Context c, int recurso, String nome) {
        String t = c.getString(recurso);
        return nome == null || nome.isEmpty() ? t : t + " (" + nome + ")";
    }

    private Notification notificacaoProgresso(String nome, long feitos, long total) {
        Intent cancelarI = new Intent(this, ServicoModelos.class).setAction(ACAO_CANCELAR);
        PendingIntent pc = PendingIntent.getService(this, 1, cancelarI,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        int pct = total > 0 ? (int) Math.min(100, (100 * feitos) / total) : 0;
        Notification.Builder b = new Notification.Builder(this, CANAL)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(titulo(this, R.string.modelos_baixando, nome))
                .setContentText(total > 0
                        ? String.format(Locale.getDefault(), getString(R.string.modelos_progresso), mb(feitos), mb(total))
                        : getString(R.string.modelos_preparando))
                .setSubText(total > 0 ? pct + "%" : null)
                .setProgress(100, pct, total <= 0)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setContentIntent(abrirApp())
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                        getString(R.string.modelos_cancelar), pc).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private Notification notificacaoFim(String nome, String erro) {
        boolean ok = erro == null;
        return new Notification.Builder(this, CANAL)
                .setSmallIcon(ok ? android.R.drawable.stat_sys_download_done : android.R.drawable.stat_notify_error)
                .setContentTitle(titulo(this, ok ? R.string.modelos_pronto : R.string.modelos_falhou, nome))
                .setContentText(ok ? getString(R.string.modelos_pronto_texto) : erro)
                .setAutoCancel(true)
                .setContentIntent(abrirApp())
                .build();
    }

    private static String mb(long bytes) {
        return String.format(Locale.getDefault(), "%.0f", bytes / 1e6);
    }
}
