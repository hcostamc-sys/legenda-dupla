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
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.github.hcostamcsys.legendadupla.voz.CodificadorAac;
import io.github.hcostamcsys.legendadupla.voz.DecodificadorAudio;
import io.github.hcostamcsys.legendadupla.voz.MixadorVoz;
import io.github.hcostamcsys.legendadupla.voz.ModeloOnnx;
import io.github.hcostamcsys.legendadupla.voz.ObterAudio;
import io.github.hcostamcsys.legendadupla.voz.SeparadorVoz;

/**
 * "Voz mais clara" (versão 22): trata o áudio de um vídeo no próprio celular, em segundo plano, com o andamento
 * nas notificações (dá para sair do app ou assistir outro vídeo enquanto isso).
 *
 * Para cada vídeo da fila:
 * 1) baixa o áudio original do YouTube (ObterAudio, NewPipe Extractor) → v/ID/orig.m4a (ou .webm);
 * 2) separa a voz do fundo com o modelo HT-Demucs (ModeloOnnx, SeparadorVoz) → v/ID/voz.m4a, e mede o nível
 *    da voz e do fundo a cada 23 ms → v/ID/niveis.bin;
 * 3) mixa: voz + fundo abaixado só quando ele encobre a fala (MixadorVoz), na margem escolhida → v/ID/mix-M.m4a.
 *    O fundo é o original menos a voz, então onde nada abaixa sai o áudio original. Trocar a margem depois só
 *    refaz o passo 3 (segundos, não minutos).
 * A página toca o mix-M.m4a (endereço PREFIXO + "ID/mix-M.m4a", entregue com Range por responder()) junto com
 * o vídeo, que fica sem som.
 *
 * O modelo (316 MB, Hugging Face, revisão fixa) é baixado uma vez, com continuação e conferência do SHA-256.
 *
 * Atraso do AAC: o codificador do Android acrescenta um começo (alguns milissegundos) que o arquivo não marca.
 * O app mede esse atraso uma vez (CodificadorAac.medirAtraso) e o desconta: ao ler voz.m4a e ao gravar o mix,
 * para o áudio tratado bater com o vídeo.
 */
public class ServicoVoz extends Service {

    static final String ACAO_TRABALHAR = "io.github.hcostamcsys.legendadupla.VOZ_TRABALHAR";
    static final String ACAO_CANCELAR = "io.github.hcostamcsys.legendadupla.VOZ_CANCELAR";
    static final String PREFIXO = "https://hcostamc-sys.github.io/legenda-dupla/__ld_voz/";

    // Modelo: revisão fixa no Hugging Face (conferida em 23/11/2026 pela API do Hugging Face)
    static final String URL_MODELO = "https://huggingface.co/StemSplitio/htdemucs-ft-vocals-onnx/resolve/"
            + "2ef0d757d3e226d0da85fb8c71514f464fcabdd0/htdemucs_ft_vocals.onnx";
    static final long BYTES_MODELO = 316446953L;
    static final String SHA_MODELO = "8c5d5e2da1f27050240bb80236673307ee3b40d4b064066d9350f4d64bfd544d";

    static final int TAXA = 44100;
    static final int THREADS = 4;
    static final int MARGEM_PADRAO = 12;
    private static final String CANAL = "voz";
    static final int NOTIF_PROGRESSO = 51;
    static final int NOTIF_FIM = 52;
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{11}");
    private static final Pattern ARQ_MIX = Pattern.compile("mix-(\\d{1,2})\\.m4a");

    interface Ouvinte {
        void aoEstado(String json);
    }

    static volatile Ouvinte ouvinte;
    static volatile boolean appVisivel;

    private static final Object TRAVA = new Object();
    private static JSONObject estado; // null: ainda não leu
    private static volatile boolean separando, mixando, baixandoModelo;
    private static volatile String atual = ""; // vídeo em tratamento
    private static volatile boolean cancelarAtual, cancelarModelo, parar;
    private static Context app;

    private PowerManager.WakeLock travaCpu;
    private long ultimoAviso = 0;

    // ================================================================== estado

    static File pasta(Context c) {
        return new File(c.getFilesDir(), "voz");
    }

    static File arquivoModelo(Context c) {
        return new File(new File(pasta(c), "modelo"), "htdemucs_ft_vocals.onnx");
    }

    static File pastaVideo(Context c, String id) {
        return new File(new File(pasta(c), "v"), id);
    }

    private static void carregar(Context c) {
        if (estado != null) return;
        File f = new File(pasta(c), "estado.json");
        try (InputStream in = new FileInputStream(f)) {
            byte[] d = new byte[(int) Math.min(f.length(), 4 << 20)];
            int lidos = 0, n;
            while (lidos < d.length && (n = in.read(d, lidos, d.length - lidos)) > 0) lidos += n;
            estado = new JSONObject(new String(d, 0, lidos, StandardCharsets.UTF_8));
        } catch (Exception e) {
            estado = new JSONObject();
        }
        try {
            if (!estado.has("videos")) estado.put("videos", new JSONObject());
            if (!estado.has("fila")) estado.put("fila", new JSONArray());
            if (!estado.has("mixar")) estado.put("mixar", new JSONArray());
            if (!estado.has("modelo")) estado.put("modelo", new JSONObject());
            JSONObject m = estado.getJSONObject("modelo");
            boolean arquivoOk = arquivoModelo(c).length() == BYTES_MODELO;
            String em = m.optString("estado", "");
            if (arquivoOk) m.put("estado", "pronto");
            else if ("pronto".equals(em) || em.isEmpty()) m.put("estado", "ausente");
        } catch (Exception e) {
            // nada
        }
    }

    private static void salvar(Context c) {
        File p = pasta(c);
        if (!p.exists() && !p.mkdirs()) return;
        File tmp = new File(p, "estado.json.tmp");
        try (OutputStream o = new FileOutputStream(tmp)) {
            o.write(estado.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(new File(p, "estado.json"));
    }

    private static JSONObject video(String id) throws Exception {
        return estado.getJSONObject("videos").optJSONObject(id);
    }

    /** Estado para a página (cópia, com o que está rodando agora e o espaço usado). */
    static String estadoPublico(Context c) {
        synchronized (TRAVA) {
            carregar(c);
            try {
                JSONObject r = new JSONObject(estado.toString());
                JSONObject m = r.getJSONObject("modelo");
                String em = m.optString("estado");
                // Marcado como em andamento sem o serviço rodando: foi interrompido.
                if (("baixando".equals(em) || "verificando".equals(em)) && !baixandoModelo) {
                    m.put("estado", "erro");
                    m.put("erro", "O download do modelo foi interrompido. Toque em Tentar de novo: ele continua de onde parou.");
                }
                JSONObject vs = r.getJSONObject("videos");
                Iterator<String> it = vs.keys();
                while (it.hasNext()) {
                    String id = it.next();
                    JSONObject v = vs.getJSONObject(id);
                    String ev = v.optString("estado");
                    boolean emAndamento = "baixando".equals(ev) || "separando".equals(ev) || "mixando".equals(ev);
                    if (emAndamento && !(id.equals(atual) && separando) && !(mixando && "mixando".equals(ev))) {
                        v.put("estado", "fila"); // retomado quando o serviço voltar
                    }
                }
                r.put("atual", atual);
                r.put("rodando", separando || mixando || baixandoModelo);
                r.put("livre", c.getFilesDir().getUsableSpace());
                r.put("usado", tamanho(new File(pasta(c), "v")));
                r.put("bytesModelo", BYTES_MODELO);
                return r.toString();
            } catch (Exception e) {
                return "{\"erro\":\"estado\"}";
            }
        }
    }

    private static long tamanho(File f) {
        if (f.isFile()) return f.length();
        long s = 0;
        File[] l = f.listFiles();
        if (l != null) for (File x : l) s += tamanho(x);
        return s;
    }

    private static void apagar(File f) {
        File[] l = f.listFiles();
        if (l != null) for (File x : l) apagar(x);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static void avisar(Context c) {
        Ouvinte o = ouvinte;
        if (o != null) o.aoEstado(estadoPublico(c));
    }

    // ================================================================== pedidos da página

    /**
     * Mensagens da página (pela MainActivity, numa thread de fundo): vozEstado, vozBaixarModelo,
     * vozCancelarModelo, vozApagarModelo, vozTratar {id, titulo, margem}, vozCancelar {id}, vozApagar {id},
     * vozApagarTodos, vozMixar {id, margem}.
     */
    static void pedido(Context ctx, JSONObject o) {
        Context c = ctx.getApplicationContext();
        app = c;
        String acao = o.optString("acao");
        String id = o.optString("id", "");
        boolean iniciar = false;
        synchronized (TRAVA) {
            carregar(c);
            try {
                JSONObject m = estado.getJSONObject("modelo");
                JSONArray fila = estado.getJSONArray("fila");
                JSONObject vs = estado.getJSONObject("videos");
                switch (acao) {
                    case "vozBaixarModelo":
                        if (!"pronto".equals(m.optString("estado"))) {
                            m.put("estado", "fila");
                            m.remove("erro");
                            cancelarModelo = false;
                            iniciar = true;
                        }
                        break;
                    case "vozCancelarModelo":
                        cancelarModelo = true;
                        if (!baixandoModelo) {
                            m.put("estado", "ausente");
                            m.remove("erro");
                        }
                        break;
                    case "vozApagarModelo":
                        if (!separando && !baixandoModelo) {
                            apagar(arquivoModelo(c).getParentFile());
                            m.put("estado", "ausente");
                            m.remove("erro");
                            m.remove("feitos");
                        }
                        break;
                    case "vozTratar": {
                        if (!ID.matcher(id).matches()) break;
                        JSONObject v = vs.optJSONObject(id);
                        int margem = margemValida(o.optInt("margem", MARGEM_PADRAO));
                        if (v != null && "pronto".equals(v.optString("estado"))) {
                            if (v.optInt("margem", -1) != margem) iniciar = pedirMix(id, margem);
                            break;
                        }
                        if (v == null) v = new JSONObject();
                        v.put("estado", "fila");
                        v.put("titulo", o.optString("titulo", v.optString("titulo", "")));
                        v.put("margem", margem);
                        v.put("progresso", 0);
                        v.remove("erro");
                        v.remove("detalhe");
                        v.put("pedidoEm", System.currentTimeMillis());
                        vs.put(id, v);
                        if (!contem(fila, id)) fila.put(id);
                        if (!"pronto".equals(m.optString("estado")) && !"baixando".equals(m.optString("estado"))) {
                            m.put("estado", "fila");
                            m.remove("erro");
                            cancelarModelo = false;
                        }
                        iniciar = true;
                        break;
                    }
                    case "vozCancelar":
                        if (id.equals(atual) && separando) cancelarAtual = true;
                        remover(fila, id);
                        if (!id.equals(atual) || !separando) {
                            JSONObject v = vs.optJSONObject(id);
                            if (v != null && !"pronto".equals(v.optString("estado"))) {
                                vs.remove(id);
                                apagar(pastaVideo(c, id));
                            }
                        }
                        break;
                    case "vozApagar":
                        if (!ID.matcher(id).matches()) break;
                        if (id.equals(atual) && separando) cancelarAtual = true;
                        remover(fila, id);
                        vs.remove(id);
                        if (!(id.equals(atual) && (separando || mixando))) apagar(pastaVideo(c, id));
                        break;
                    case "vozApagarTodos": {
                        if (separando) cancelarAtual = true;
                        estado.put("fila", new JSONArray());
                        estado.put("mixar", new JSONArray());
                        estado.put("videos", new JSONObject());
                        File[] l = new File(pasta(c), "v").listFiles();
                        if (l != null) for (File f : l) if (!f.getName().equals(atual)) apagar(f);
                        break;
                    }
                    case "vozMixar": {
                        JSONObject v = vs.optJSONObject(id);
                        int margem = margemValida(o.optInt("margem", MARGEM_PADRAO));
                        if (v != null && "pronto".equals(v.optString("estado")) && v.optInt("margem", -1) != margem) {
                            iniciar = pedirMix(id, margem);
                        } else if (v != null && !"pronto".equals(v.optString("estado"))) {
                            v.put("margem", margem); // ainda na fila: já sai com a margem nova
                        }
                        break;
                    }
                    default:
                        break; // vozEstado: só responde
                }
                salvar(c);
            } catch (Exception e) {
                // pedido inválido
            }
        }
        if (iniciar) iniciarServico(c);
        avisar(c);
    }

    static int margemValida(int m) {
        return Math.max(3, Math.min(30, m));
    }

    private static boolean pedirMix(String id, int margem) throws Exception {
        JSONArray l = estado.getJSONArray("mixar");
        for (int i = l.length() - 1; i >= 0; i--) {
            if (id.equals(l.getJSONObject(i).optString("id"))) l.remove(i);
        }
        JSONObject j = new JSONObject();
        j.put("id", id);
        j.put("margem", margem);
        l.put(j);
        JSONObject v = video(id);
        if (v != null) v.put("mixPendente", margem);
        return true;
    }

    private static boolean contem(JSONArray a, String s) {
        for (int i = 0; i < a.length(); i++) if (s.equals(a.optString(i))) return true;
        return false;
    }

    private static void remover(JSONArray a, String s) {
        for (int i = a.length() - 1; i >= 0; i--) if (s.equals(a.optString(i))) a.remove(i);
    }

    /** Ao abrir o app: se ficou trabalho pela metade (o Android fechou o app), continua. */
    static void retomar(Context ctx) {
        Context c = ctx.getApplicationContext();
        app = c;
        boolean tem;
        synchronized (TRAVA) {
            carregar(c);
            try {
                String em = estado.getJSONObject("modelo").optString("estado");
                tem = estado.getJSONArray("fila").length() > 0 || estado.getJSONArray("mixar").length() > 0
                        || "fila".equals(em) || "baixando".equals(em) || "verificando".equals(em);
            } catch (Exception e) {
                tem = false;
            }
        }
        if (tem && !separando && !mixando && !baixandoModelo) iniciarServico(c);
    }

    private static void iniciarServico(Context c) {
        try {
            c.startForegroundService(new Intent(c, ServicoVoz.class).setAction(ACAO_TRABALHAR));
        } catch (Exception e) {
            // O Android não deixou (app em segundo plano): fica na fila e continua quando o app abrir.
        }
    }

    // ================================================================== serviço

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        app = getApplicationContext();
        entrarPrimeiroPlano();
        String acao = intent == null ? "" : String.valueOf(intent.getAction());
        if (ACAO_CANCELAR.equals(acao)) {
            if (baixandoModelo) cancelarModelo = true;
            if (separando) {
                cancelarAtual = true;
                synchronized (TRAVA) {
                    try {
                        remover(estado.getJSONArray("fila"), atual);
                    } catch (Exception e) {
                        // nada
                    }
                }
            }
            if (!separando && !mixando && !baixandoModelo) encerrarSeOcioso();
            return START_NOT_STICKY;
        }
        parar = false;
        if (travaCpu == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                travaCpu = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LegendaDupla:voz");
                travaCpu.setReferenceCounted(false);
            }
        }
        if (travaCpu != null && !travaCpu.isHeld()) travaCpu.acquire(8 * 60 * 60 * 1000L);
        synchronized (TRAVA) {
            if (!separando) {
                separando = true;
                new Thread(this::lacoSeparacao, "voz-separacao").start();
            }
            if (!mixando) {
                mixando = true;
                new Thread(this::lacoMixagem, "voz-mixagem").start();
            }
        }
        return START_NOT_STICKY;
    }

    private void entrarPrimeiroPlano() {
        criarCanal();
        Notification n = notificacaoProgresso(getString(R.string.voz_preparando), "", -1);
        try {
            if (Build.VERSION.SDK_INT >= 35) {
                startForeground(NOTIF_PROGRESSO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING);
            } else if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIF_PROGRESSO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIF_PROGRESSO, n);
            }
        } catch (Exception e) {
            // sem permissão de primeiro plano: segue assim mesmo
        }
    }

    private void encerrarSeOcioso() {
        if (separando || mixando || baixandoModelo) return;
        if (travaCpu != null && travaCpu.isHeld()) travaCpu.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onTimeout(int startId, int tipo) {
        pararPorTempo();
    }

    @Override
    public void onTimeout(int startId) {
        pararPorTempo();
    }

    /** Android 15: limite de 6 h por dia em primeiro plano. Para e deixa continuar depois. */
    private void pararPorTempo() {
        parar = true; // os laços param e o trabalho fica na fila (não é cancelamento)
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onDestroy() {
        parar = true;
        if (travaCpu != null && travaCpu.isHeld()) travaCpu.release();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ laço da separação (e do modelo)

    private void lacoSeparacao() {
        ModeloOnnx modelo = null;
        try {
            while (!parar) {
                String proximo = null;
                boolean precisaModelo;
                synchronized (TRAVA) {
                    carregar(this);
                    JSONObject m = estado.getJSONObject("modelo");
                    String em = m.optString("estado");
                    JSONArray fila = estado.getJSONArray("fila");
                    precisaModelo = "fila".equals(em) || "baixando".equals(em) || "verificando".equals(em)
                            || (fila.length() > 0 && !"pronto".equals(em) && !"erro".equals(em) && !"ausente".equals(em));
                    if (!precisaModelo && "pronto".equals(em) && fila.length() > 0) proximo = fila.getString(0);
                    if (!precisaModelo && proximo == null && fila.length() > 0 && !"pronto".equals(em)) {
                        // O modelo falhou ou foi cancelado: os vídeos da fila não têm como seguir.
                        String erro = "ausente".equals(em) ? "O modelo de voz não foi baixado." : m.optString("erro", "O modelo de voz não foi baixado.");
                        for (int i = 0; i < fila.length(); i++) {
                            JSONObject v = video(fila.getString(i));
                            if (v != null) {
                                v.put("estado", "erro");
                                v.put("erro", erro);
                            }
                        }
                        estado.put("fila", new JSONArray());
                        salvar(this);
                    }
                }
                if (precisaModelo) {
                    if (modelo != null) {
                        modelo.close();
                        modelo = null;
                    }
                    baixarModelo();
                    continue;
                }
                if (proximo == null) break;
                if (modelo == null) {
                    try {
                        modelo = new ModeloOnnx(arquivoModelo(this).getAbsolutePath(), THREADS);
                    } catch (Throwable t) {
                        falharVideo(proximo, "Não consegui abrir o modelo de voz. Apague o modelo nos Ajustes e baixe de novo.",
                                t.getClass().getSimpleName() + ": " + t.getMessage());
                        continue;
                    }
                }
                tratar(proximo, modelo);
            }
        } catch (Exception e) {
            // nada: o estado de cada vídeo já foi gravado
        } finally {
            if (modelo != null) modelo.close();
            atual = "";
            separando = false;
            avisar(this);
            encerrarSeOcioso();
        }
    }

    private void tratar(String id, ModeloOnnx modelo) {
        atual = id;
        cancelarAtual = false;
        File pv = pastaVideo(this, id);
        String titulo;
        int margem;
        synchronized (TRAVA) {
            JSONObject v;
            try {
                v = video(id);
            } catch (Exception e) {
                v = null;
            }
            if (v == null) {
                try {
                    remover(estado.getJSONArray("fila"), id);
                } catch (Exception e) {
                    // nada
                }
                atual = "";
                return;
            }
            titulo = v.optString("titulo", "");
            margem = v.optInt("margem", MARGEM_PADRAO);
        }
        long t0 = SystemClock.elapsedRealtime();
        try {
            if (!pv.exists() && !pv.mkdirs()) throw new ObterAudio.Aviso("Não consegui criar a pasta do áudio no celular.", null);
            // 1) Áudio original
            mudar(id, "baixando", 0, null);
            File orig = arquivoOriginal(pv);
            if (orig == null) {
                ObterAudio.iniciar(Locale.getDefault().getCountry());
                ObterAudio.Escolha e = ObterAudio.escolher(id);
                if (titulo.isEmpty() && e.titulo != null) titulo = e.titulo;
                long previsto = e.tamanho > 0 ? e.tamanho : Math.max(1, e.duracaoSeg) * 20_000L;
                if (pv.getUsableSpace() < previsto * 5 + 100_000_000L) throw new ObterAudio.Aviso(MSG_ESPACO, null);
                File parte = new File(pv, "orig." + e.formato + ".part");
                // Endereço novo pode ser de outra versão do áudio: começa do zero (o download é a parte rápida).
                //noinspection ResultOfMethodCallIgnored
                parte.delete();
                final String tit = titulo;
                ObterAudio.baixar(e, parte, (feitos, total) -> {
                    if (cancelarAtual || parar) return false;
                    if (total > 0) progresso(id, tit, "baixando", 0.10 * feitos / total, -1);
                    return true;
                });
                File fim = new File(pv, "orig." + e.formato);
                if (!parte.renameTo(fim)) throw new IOException("não consegui renomear o áudio baixado");
                orig = fim;
                synchronized (TRAVA) {
                    JSONObject v = video(id);
                    if (v != null) {
                        v.put("duracao", e.duracaoSeg);
                        if (!titulo.isEmpty()) v.put("titulo", titulo);
                    }
                }
            }
            // Atraso do AAC deste celular (uma vez)
            int atraso = atrasoAac();
            long duracaoSeg;
            synchronized (TRAVA) {
                JSONObject v = video(id);
                duracaoSeg = v == null ? 0 : v.optLong("duracao", 0);
            }
            // 2) Separação
            separar(id, titulo, orig, pv, modelo, duracaoSeg);
            // 3) Mixagem
            mudar(id, "mixando", 0.93, null);
            final String tit = titulo;
            renderizar(id, margem, atraso, duracaoSeg, f -> progresso(id, tit, "mixando", 0.93 + 0.07 * f, -1));
            boolean apagado;
            synchronized (TRAVA) {
                JSONObject v = video(id);
                apagado = v == null; // a pessoa apagou o vídeo enquanto ele terminava
                if (v != null) {
                    v.put("estado", "pronto");
                    v.put("progresso", 1);
                    v.put("margem", margem);
                    v.put("arquivo", "mix-" + margem + ".m4a");
                    v.put("bytes", tamanho(pv));
                    v.put("tempoGasto", (SystemClock.elapsedRealtime() - t0) / 1000);
                    v.put("prontoEm", System.currentTimeMillis());
                    v.remove("restante");
                    v.remove("erro");
                    v.remove("detalhe");
                }
                remover(estado.getJSONArray("fila"), id);
                salvar(this);
            }
            if (apagado) apagar(pv);
            avisar(this);
            if (!appVisivel && !apagado) notificarFim(id, titulo, null);
        } catch (Exception e) {
            boolean cancelado = cancelarAtual || parar || e instanceof ObterAudio.Parado;
            if (cancelado && parar && !cancelarAtual) {
                // Android pediu para parar (limite de tempo): fica na fila para continuar depois.
                mudar(id, "fila", 0, null);
            } else if (cancelado) {
                synchronized (TRAVA) {
                    try {
                        remover(estado.getJSONArray("fila"), id);
                        JSONObject v = video(id);
                        if (v != null && !"pronto".equals(v.optString("estado"))) estado.getJSONObject("videos").remove(id);
                        salvar(this);
                    } catch (Exception x) {
                        // nada
                    }
                }
                apagar(pv);
                avisar(this);
            } else {
                String msg = mensagem(e);
                falharVideo(id, msg, e.getClass().getSimpleName() + ": " + e.getMessage());
                if (!appVisivel) notificarFim(id, titulo, msg);
            }
        } finally {
            atual = "";
            cancelarAtual = false;
        }
    }

    static final String MSG_ESPACO = "Falta espaço no celular. Apague fotos, vídeos ou apps que não usa, ou áudios tratados antigos (Ajustes), e tente de novo.";

    private static String mensagem(Exception e) {
        if (e instanceof ObterAudio.Aviso) return e.getMessage();
        String m = String.valueOf(e.getMessage());
        if (m.contains("ENOSPC") || m.contains("No space")) return MSG_ESPACO;
        if (e instanceof java.net.UnknownHostException || e instanceof java.net.SocketException
                || e instanceof java.io.InterruptedIOException || e instanceof javax.net.ssl.SSLException) {
            return "A internet caiu durante o download do áudio. Toque em Tentar de novo.";
        }
        if (e instanceof OutOfMemoryError) return "Faltou memória no celular. Feche outros apps e tente de novo.";
        return "Não consegui tratar o áudio deste vídeo. Toque em Tentar de novo; se continuar, copie o diagnóstico.";
    }

    private void falharVideo(String id, String msg, String detalhe) {
        synchronized (TRAVA) {
            try {
                JSONObject v = video(id);
                if (v != null) {
                    v.put("estado", "erro");
                    v.put("erro", msg);
                    v.put("detalhe", detalhe);
                    v.remove("restante");
                }
                remover(estado.getJSONArray("fila"), id);
                salvar(this);
            } catch (Exception e) {
                // nada
            }
        }
        avisar(this);
    }

    private static File arquivoOriginal(File pv) {
        for (String ext : new String[]{"m4a", "webm"}) {
            File f = new File(pv, "orig." + ext);
            if (f.isFile() && f.length() > 0) return f;
        }
        return null;
    }

    private int atrasoAac() {
        synchronized (TRAVA) {
            if (estado.has("atraso")) return Math.max(0, estado.optInt("atraso", 0));
        }
        int a = CodificadorAac.medirAtraso(getCacheDir());
        synchronized (TRAVA) {
            try {
                estado.put("atraso", a);
                salvar(this);
            } catch (Exception e) {
                // nada
            }
        }
        return Math.max(0, a);
    }

    private void separar(String id, String titulo, File orig, File pv, ModeloOnnx modelo, long duracaoSeg) throws Exception {
        mudar(id, "separando", 0.10, null);
        File vozTmp = new File(pv, "voz.tmp.m4a");
        File voz = new File(pv, "voz.m4a");
        File niveis = new File(pv, "niveis.bin");
        //noinspection ResultOfMethodCallIgnored
        voz.delete();
        try (DecodificadorAudio dec = new DecodificadorAudio(orig, TAXA);
             CodificadorAac enc = new CodificadorAac(vozTmp, TAXA, 128000)) {
            long totalAmostras = Math.max(1, dec.duracaoUs() > 0 ? dec.duracaoUs() * TAXA / 1_000_000L : duracaoSeg * TAXA);
            MixadorVoz.Medidor medidor = new MixadorVoz.Medidor(TAXA);
            SeparadorVoz sep = new SeparadorVoz(modelo, (vE, vD, fE, fD, q) -> {
                medidor.medir(vE, vD, fE, fD, q);
                enc.escrever(vE, vD, 0, q);
            });
            float[] e = new float[TAXA], d = new float[TAXA];
            long inicioSep = SystemClock.elapsedRealtime();
            int k;
            while ((k = dec.ler(e, d, e.length)) > 0) {
                if (cancelarAtual || parar) throw new ObterAudio.Parado();
                sep.adicionar(e, d, 0, k);
                double f = Math.min(1.0, sep.entregues() / (double) totalAmostras);
                long passou = SystemClock.elapsedRealtime() - inicioSep;
                long restante = f > 0.02 ? (long) (passou * (1 - f) / f / 1000) : -1;
                progresso(id, titulo, "separando", 0.10 + 0.83 * f, restante);
            }
            sep.terminar();
            enc.terminar();
            medidor.terminar().salvar(niveis);
        } catch (Exception ex) {
            //noinspection ResultOfMethodCallIgnored
            vozTmp.delete();
            throw ex;
        }
        if (!vozTmp.renameTo(voz)) throw new IOException("não consegui gravar a voz separada");
    }

    interface Fracao {
        void aoAndamento(double f);
    }

    /** Mixa voz + fundo abaixado na margem pedida → mix-M.m4a (e apaga mixes de outras margens). */
    private void renderizar(String id, int margem, int atraso, long duracaoSeg, Fracao andamento) throws Exception {
        File pv = pastaVideo(this, id);
        File orig = arquivoOriginal(pv);
        File voz = new File(pv, "voz.m4a");
        if (orig == null || !voz.isFile()) throw new IOException("faltam os arquivos do áudio tratado");
        MixadorVoz.Niveis nv = MixadorVoz.Niveis.ler(new File(pv, "niveis.bin"));
        MixadorVoz.Aplicador ap = new MixadorVoz.Aplicador(MixadorVoz.ganhos(nv, margem, TAXA));
        File tmp = new File(pv, "mix.tmp.m4a");
        File fim = new File(pv, "mix-" + margem + ".m4a");
        try (DecodificadorAudio dO = new DecodificadorAudio(orig, TAXA);
             DecodificadorAudio dV = new DecodificadorAudio(voz, TAXA);
             CodificadorAac enc = new CodificadorAac(tmp, TAXA, 160000)) {
            dV.pularInicio(atraso); // voz.m4a começa "atraso" amostras depois
            long total = Math.max(1, dO.duracaoUs() > 0 ? dO.duracaoUs() * TAXA / 1_000_000L : duracaoSeg * TAXA);
            int bloco = 8192;
            float[] oE = new float[bloco], oD = new float[bloco], vE = new float[bloco], vD = new float[bloco];
            float[] fE = new float[bloco], fD = new float[bloco], sE = new float[bloco], sD = new float[bloco];
            long feitas = 0;
            long descartar = atraso; // o mix gravado também ganha "atraso": começa adiantado
            long ultimo = 0;
            while (true) {
                if (parar) throw new ObterAudio.Parado();
                int q = lerExato(dO, oE, oD, bloco);
                if (q == 0) break;
                int qv = lerExato(dV, vE, vD, q);
                for (int i = qv; i < q; i++) {
                    vE[i] = 0f;
                    vD[i] = 0f;
                }
                for (int i = 0; i < q; i++) {
                    fE[i] = oE[i] - vE[i];
                    fD[i] = oD[i] - vD[i];
                }
                ap.misturar(vE, vD, fE, fD, sE, sD, q);
                int ini = 0;
                if (descartar > 0) {
                    int p = (int) Math.min(descartar, q);
                    descartar -= p;
                    ini = p;
                }
                if (q - ini > 0) enc.escrever(sE, sD, ini, q - ini);
                feitas += q;
                long agora = SystemClock.elapsedRealtime();
                if (agora - ultimo > 500) {
                    ultimo = agora;
                    andamento.aoAndamento(Math.min(1.0, feitas / (double) total));
                }
            }
            // Completa o fim (o que foi descartado no começo), para a duração bater
            int compl = (int) Math.min(atraso, TAXA);
            if (compl > 0) {
                float[] z = new float[compl];
                enc.escrever(z, z, 0, compl);
            }
            enc.terminar();
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw e;
        }
        if (!tmp.renameTo(fim)) throw new IOException("não consegui gravar o áudio tratado");
        File[] l = pv.listFiles();
        if (l != null) {
            for (File f : l) {
                if (!f.equals(fim) && ARQ_MIX.matcher(f.getName()).matches()) //noinspection ResultOfMethodCallIgnored
                    f.delete();
            }
        }
    }

    private static int lerExato(DecodificadorAudio d, float[] e, float[] dd, int n) throws IOException {
        int q = 0;
        while (q < n) {
            int k = d.ler(e, dd, q, n - q);
            if (k == 0) break;
            q += k;
        }
        return q;
    }

    // ------------------------------------------------------------------ laço da mixagem (trocar a margem)

    private void lacoMixagem() {
        try {
            while (!parar) {
                String id;
                int margem;
                synchronized (TRAVA) {
                    carregar(this);
                    JSONArray l = estado.getJSONArray("mixar");
                    if (l.length() == 0) break;
                    JSONObject j = l.getJSONObject(0);
                    l.remove(0);
                    id = j.optString("id");
                    margem = margemValida(j.optInt("margem", MARGEM_PADRAO));
                    JSONObject v = video(id);
                    if (v == null || !"pronto".equals(v.optString("estado")) || id.equals(atual)) {
                        salvar(this);
                        continue;
                    }
                    v.put("mixando", true);
                    salvar(this);
                }
                avisar(this);
                try {
                    String titulo;
                    long duracaoSeg;
                    synchronized (TRAVA) {
                        JSONObject v0 = video(id);
                        titulo = v0 == null ? "" : v0.optString("titulo", "");
                        duracaoSeg = v0 == null ? 0 : v0.optLong("duracao", 0);
                    }
                    renderizar(id, margem, atrasoAac(), duracaoSeg, f -> progresso(id, titulo, "remixando", f, -1));
                    synchronized (TRAVA) {
                        JSONObject v = video(id);
                        if (v != null) {
                            v.put("margem", margem);
                            v.put("arquivo", "mix-" + margem + ".m4a");
                            v.put("bytes", tamanho(pastaVideo(this, id)));
                            v.remove("mixando");
                            if (v.optInt("mixPendente", -1) == margem) v.remove("mixPendente");
                        }
                        salvar(this);
                    }
                } catch (Exception e) {
                    synchronized (TRAVA) {
                        JSONObject v = video(id);
                        if (v != null) {
                            v.remove("mixando");
                            v.remove("mixPendente");
                            v.put("erroMix", mensagem(e));
                        }
                        salvar(this);
                    }
                }
                avisar(this);
            }
        } catch (Exception e) {
            // nada
        } finally {
            mixando = false;
            avisar(this);
            encerrarSeOcioso();
        }
    }

    // ------------------------------------------------------------------ download do modelo

    private void baixarModelo() {
        baixandoModelo = true;
        cancelarModelo = false;
        File destino = arquivoModelo(this);
        File p = destino.getParentFile();
        File parte = new File(p, destino.getName() + ".part");
        String erro = null, detalhe = null;
        boolean cancelado = false;
        try {
            if (!p.exists() && !p.mkdirs()) throw new ObterAudio.Aviso("Não consegui criar a pasta do modelo no celular.", null);
            synchronized (TRAVA) {
                JSONObject m = estado.getJSONObject("modelo");
                m.put("estado", "baixando");
                m.put("total", BYTES_MODELO);
                m.remove("erro");
                salvar(this);
            }
            if (p.getUsableSpace() < BYTES_MODELO - parte.length() + 200_000_000L) throw new ObterAudio.Aviso(MSG_ESPACO, null);
            for (int tentativa = 1; ; tentativa++) {
                try {
                    baixarArquivo(URL_MODELO, parte, BYTES_MODELO);
                    break;
                } catch (ObterAudio.Parado | ObterAudio.Aviso x) {
                    throw x;
                } catch (IOException x) {
                    if (tentativa >= 6) throw x;
                    long fim = SystemClock.elapsedRealtime() + Math.min(30000L, 3000L * tentativa);
                    while (SystemClock.elapsedRealtime() < fim) {
                        if (cancelarModelo || parar) throw new ObterAudio.Parado();
                        SystemClock.sleep(250);
                    }
                }
            }
            synchronized (TRAVA) {
                estado.getJSONObject("modelo").put("estado", "verificando");
            }
            avisar(this);
            if (!sha256(parte).equals(SHA_MODELO)) {
                //noinspection ResultOfMethodCallIgnored
                parte.delete();
                throw new ObterAudio.Aviso("O modelo chegou com defeito. Toque em Tentar de novo para baixar outra vez.", null);
            }
            if (!parte.renameTo(destino)) throw new IOException("não consegui gravar o modelo");
        } catch (ObterAudio.Parado x) {
            cancelado = true;
        } catch (Exception x) {
            erro = x instanceof ObterAudio.Aviso ? x.getMessage()
                    : (x instanceof java.net.UnknownHostException || x instanceof java.net.SocketException
                    || x instanceof java.io.InterruptedIOException || x instanceof javax.net.ssl.SSLException)
                    ? "A internet caiu ou ficou lenta demais durante o download. Toque em Tentar de novo: ele continua de onde parou."
                    : "Não consegui terminar o download do modelo. Toque em Tentar de novo: ele continua de onde parou.";
            detalhe = x.getClass().getSimpleName() + ": " + x.getMessage();
        }
        synchronized (TRAVA) {
            try {
                JSONObject m = estado.getJSONObject("modelo");
                if (cancelado && cancelarModelo) {
                    //noinspection ResultOfMethodCallIgnored
                    parte.delete();
                    m.put("estado", "ausente");
                    m.remove("feitos");
                } else if (cancelado) {
                    m.put("estado", "fila"); // parado pelo Android: continua depois
                } else if (erro != null) {
                    m.put("estado", "erro");
                    m.put("erro", erro);
                    m.put("detalhe", detalhe);
                } else {
                    m.put("estado", "pronto");
                    m.put("feitos", BYTES_MODELO);
                    m.remove("erro");
                    m.remove("detalhe");
                }
                salvar(this);
            } catch (Exception e) {
                // nada
            }
        }
        baixandoModelo = false;
        cancelarModelo = false;
        avisar(this);
        if (erro != null && !appVisivel) notificarModelo(erro);
    }

    private void baixarArquivo(String endereco, File parte, long bytes) throws IOException {
        if (cancelarModelo || parar) throw new ObterAudio.Parado();
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
            c.setRequestProperty("Accept-Encoding", "identity");
            c.setRequestProperty("User-Agent", "LegendaDupla-Android");
            if (ja > 0) c.setRequestProperty("Range", "bytes=" + ja + "-");
            int st = c.getResponseCode();
            boolean anexar;
            if (st == 206 && ja > 0) {
                anexar = true;
            } else if (st == 200) {
                anexar = false;
                ja = 0;
            } else if (st == 416) {
                //noinspection ResultOfMethodCallIgnored
                parte.delete();
                throw new IOException("recomeçou do início");
            } else {
                throw new ObterAudio.Aviso("O servidor do modelo respondeu " + st + ". Tente mais tarde.", null);
            }
            long feitos = ja;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(parte, anexar)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelarModelo || parar) throw new ObterAudio.Parado();
                    if (feitos + n > bytes) throw new IOException("o modelo veio maior que o esperado");
                    out.write(buf, 0, n);
                    feitos += n;
                    progressoModelo(feitos);
                }
            }
            if (parte.length() != bytes) throw new IOException("download incompleto (" + parte.length() + " de " + bytes + ")");
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder b = new StringBuilder();
        for (byte x : md.digest()) b.append(String.format(Locale.ROOT, "%02x", x));
        return b.toString();
    }

    // ------------------------------------------------------------------ andamento

    private void mudar(String id, String etapa, double progresso, String erro) {
        synchronized (TRAVA) {
            try {
                JSONObject v = video(id);
                if (v != null) {
                    v.put("estado", etapa);
                    v.put("progresso", progresso);
                    if (erro != null) v.put("erro", erro);
                }
                salvar(this);
            } catch (Exception e) {
                // nada
            }
        }
        avisar(this);
    }

    /** Atualiza notificação e página (no máximo a cada 0,7 s). restante: segundos (-1: não sabe). */
    private void progresso(String id, String titulo, String etapa, double f, long restante) {
        long t = SystemClock.elapsedRealtime();
        if (t - ultimoAviso < 700) return;
        ultimoAviso = t;
        synchronized (TRAVA) {
            try {
                JSONObject v = video(id);
                if (v != null && !"remixando".equals(etapa)) {
                    v.put("estado", etapa);
                    v.put("progresso", f);
                    if (restante >= 0) v.put("restante", restante);
                }
            } catch (Exception e) {
                // nada
            }
        }
        if (!separando || id.equals(atual) || "remixando".equals(etapa)) {
            String texto;
            int pct = (int) Math.round(100 * Math.max(0, Math.min(1, f)));
            if (restante > 0) {
                texto = String.format(Locale.getDefault(), getString(R.string.voz_progresso), pct, Math.max(1, (restante + 59) / 60));
            } else {
                texto = pct + "%";
            }
            String tituloNotif = "remixando".equals(etapa) ? getString(R.string.voz_remixando) : titulo.isEmpty()
                    ? getString(R.string.voz_tratando_sem_titulo) : String.format(getString(R.string.voz_tratando), titulo);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_PROGRESSO, notificacaoProgresso(tituloNotif, texto, pct));
        }
        avisar(this);
    }

    private void progressoModelo(long feitos) {
        long t = SystemClock.elapsedRealtime();
        if (t - ultimoAviso < 700) return;
        ultimoAviso = t;
        synchronized (TRAVA) {
            try {
                estado.getJSONObject("modelo").put("feitos", feitos);
            } catch (Exception e) {
                // nada
            }
        }
        int pct = (int) (100 * feitos / BYTES_MODELO);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIF_PROGRESSO, notificacaoProgresso(getString(R.string.voz_baixando_modelo),
                    String.format(Locale.getDefault(), getString(R.string.modelos_progresso),
                            String.valueOf(feitos / 1_000_000), String.valueOf(BYTES_MODELO / 1_000_000)), pct));
        }
        avisar(this);
    }

    // ------------------------------------------------------------------ notificações

    private void criarCanal() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CANAL) != null) return;
        nm.createNotificationChannel(new NotificationChannel(CANAL, getString(R.string.canal_voz),
                NotificationManager.IMPORTANCE_LOW));
    }

    private PendingIntent abrirApp(String id) {
        Intent i = new Intent(this, MainActivity.class);
        if (id != null && ID.matcher(id).matches()) {
            // Abre o vídeo como o Compartilhar do app do YouTube faz.
            i.setAction(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, "https://youtu.be/" + id);
        } else {
            i.setAction(Intent.ACTION_MAIN);
            i.addCategory(Intent.CATEGORY_LAUNCHER);
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int codigo = id == null ? 0 : id.hashCode();
        return PendingIntent.getActivity(this, codigo, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification notificacaoProgresso(String titulo, String texto, int pct) {
        PendingIntent pc = PendingIntent.getService(this, 3, new Intent(this, ServicoVoz.class).setAction(ACAO_CANCELAR),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(this, CANAL)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setProgress(100, Math.max(0, pct), pct < 0)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setContentIntent(abrirApp(null))
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                        getString(R.string.modelos_cancelar), pc).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private void notificarFim(String id, String titulo, String erro) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        boolean ok = erro == null;
        String t = titulo == null ? "" : titulo;
        Notification n = new Notification.Builder(this, CANAL)
                .setSmallIcon(ok ? android.R.drawable.stat_sys_download_done : android.R.drawable.stat_notify_error)
                .setContentTitle(String.format(getString(ok ? R.string.voz_pronto : R.string.voz_falhou), t))
                .setContentText(getString(ok ? R.string.voz_pronto_texto : R.string.voz_falhou_texto))
                .setAutoCancel(true)
                .setContentIntent(abrirApp(id))
                .build();
        nm.notify(NOTIF_FIM + Math.abs(id.hashCode() % 1000), n);
    }

    private void notificarModelo(String erro) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.notify(NOTIF_FIM, new Notification.Builder(this, CANAL)
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentTitle(getString(R.string.voz_modelo_falhou))
                .setContentText(getString(R.string.voz_falhou_texto))
                .setAutoCancel(true)
                .setContentIntent(abrirApp(null))
                .build());
    }

    // ================================================================== arquivos para a página

    /**
     * Entrega à WebView o áudio tratado (PREFIXO + "ID/mix-M.m4a"), com Range: o player de áudio do Chrome
     * pede pedaços e precisa da resposta 206 para poder pular para qualquer ponto.
     */
    static WebResourceResponse responder(Context c, WebResourceRequest pedido) {
        String url = pedido.getUrl().toString();
        if (!url.startsWith(PREFIXO)) return null;
        String resto = url.substring(PREFIXO.length());
        int q = resto.indexOf('?');
        if (q >= 0) resto = resto.substring(0, q);
        Map<String, String> cab = new HashMap<>();
        cab.put("Cache-Control", "no-store");
        cab.put("Accept-Ranges", "bytes");
        String[] partes = resto.split("/");
        if (partes.length != 2 || !ID.matcher(partes[0]).matches() || !ARQ_MIX.matcher(partes[1]).matches()) {
            return vazio(404, "Not Found", cab);
        }
        File f = new File(pastaVideo(c, partes[0]), partes[1]);
        if (!f.isFile()) return vazio(404, "Not Found", cab);
        long tam = f.length();
        long ini = 0, fim = tam - 1;
        boolean parcial = false;
        String range = null;
        Map<String, String> h = pedido.getRequestHeaders();
        if (h != null) {
            for (Map.Entry<String, String> e : h.entrySet()) {
                if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
            }
        }
        if (range != null) {
            Matcher m = Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(range.trim());
            if (m.find()) {
                String a = m.group(1), b = m.group(2);
                if (a.isEmpty() && !b.isEmpty()) { // os últimos N bytes
                    long n = Long.parseLong(b);
                    ini = Math.max(0, tam - n);
                } else if (!a.isEmpty()) {
                    ini = Long.parseLong(a);
                    if (!b.isEmpty()) fim = Math.min(tam - 1, Long.parseLong(b));
                }
                if (ini >= tam || ini > fim) {
                    cab.put("Content-Range", "bytes */" + tam);
                    return vazio(416, "Range Not Satisfiable", cab);
                }
                parcial = true;
            }
        }
        long len = fim - ini + 1;
        try {
            InputStream in = new FileInputStream(f);
            long pulou = 0;
            while (pulou < ini) {
                long s = in.skip(ini - pulou);
                if (s <= 0) break;
                pulou += s;
            }
            cab.put("Content-Length", String.valueOf(len));
            if (parcial) cab.put("Content-Range", "bytes " + ini + "-" + fim + "/" + tam);
            return new WebResourceResponse("audio/mp4", null, parcial ? 206 : 200,
                    parcial ? "Partial Content" : "OK", cab, new Limitado(in, len));
        } catch (IOException e) {
            return vazio(500, "Error", cab);
        }
    }

    private static WebResourceResponse vazio(int st, String frase, Map<String, String> cab) {
        return new WebResourceResponse("text/plain", "utf-8", st, frase, cab, new ByteArrayInputStream(new byte[0]));
    }

    /** Lê no máximo "resta" bytes. */
    private static final class Limitado extends FilterInputStream {
        private long resta;

        Limitado(InputStream in, long n) {
            super(in);
            resta = n;
        }

        @Override
        public int read() throws IOException {
            if (resta <= 0) return -1;
            int b = super.read();
            if (b >= 0) resta--;
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (resta <= 0) return -1;
            int n = super.read(b, off, (int) Math.min(len, resta));
            if (n > 0) resta -= n;
            return n;
        }

        @Override
        public long skip(long n) throws IOException {
            long s = super.skip(Math.min(n, resta));
            resta -= s;
            return s;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), resta);
        }
    }
}
