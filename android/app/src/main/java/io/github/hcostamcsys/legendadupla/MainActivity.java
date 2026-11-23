package io.github.hcostamcsys.legendadupla;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.WindowInsets;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * App Android do Legenda Dupla: abre o site numa WebView e
 * 1) injeta o gancho (assets/gancho.js) no player do YouTube, que copia a legenda que o player baixa;
 * 2) recebe o Compartilhar do app do YouTube;
 * 3) oferece à página o objeto LDNativo: tela ligada e, no teste, baixar de novo uma legenda;
 * 4) tela cheia (deitado) quando a página pede;
 * 5) o YouTube como tela inicial (com botão Entrar e Meus vídeos): tocar num vídeo abre o vídeo no Legenda Dupla;
 * 6) toque de verdade no botão "Pular anúncio" do player, quando a página pede;
 * 7) no YouTube da tela inicial, esconde o botão e as prateleiras de Shorts (assets/youtube.js).
 *    Shorts e vídeos ao vivo abertos mesmo assim mostram um aviso na página.
 * 8) textos no idioma do celular (res/values-xx/strings.xml); a página traduz os dela.
 * 9) download dos pacotes de pontuação melhorada pelo Android (ServicoModelos): continua com o app em
 *    segundo plano, com o andamento nas notificações; a página recebe o estado e copia os arquivos.
 *    O download só começa com a permissão de notificações (versão 10): sem ela, a página explica e pede de novo.
 * 10) histórico do YouTube (versão 10): o player embutido não grava no histórico da conta; o app avisa o
 *    YouTube, com a conta conectada, que o vídeo foi assistido (como o app oficial faz).
 *    Versão 11: os endereços de registro são buscados assim que o vídeo abre (o registro sai na hora em que o
 *    vídeo começa), o progresso vai a cada 10 s e ao pular no vídeo, e o YouTube da tela inicial recarrega
 *    sozinho ao voltar, para mostrar o histórico e a barrinha vermelha de progresso já atualizados.
 * 11) internet (versão 11): o Android avisa a página quando a internet cai ou volta (ldRede), para o aviso
 *    "Tentando reconectar à Internet…" e para o vídeo continuar sozinho.
 * 12) transições (versão 12): o YouTube da tela inicial entra e sai com animação suave (0,3 s / 0,24 s) e as
 *    abas do próprio YouTube trocavam com esmaecimento (assets/youtube.js; retirado na versão 15).
 *    Versão 13: eixo horizontal compartilhado (Material Design): abrir um vídeo empurra o YouTube para a
 *    esquerda e a página entra pela direita; voltar faz o contrário. As abas do YouTube deslizam no sentido
 *    da aba tocada (youtube.js).
 * 13) tela inicial estável (versão 13): o YouTube não recarrega mais sozinho ao voltar de um vídeo (a lista
 *    antiga aparecia por uns 2 s e trocava, e o toque nesse meio-tempo se perdia). Atualizar só puxando a
 *    lista para baixo; enquanto recarrega, uma capa com o ícone de recarregando cobre a lista antiga.
 *    Nas páginas de histórico (Você, Histórico, playlists) a recarga depois de um vídeo continua, sob a capa.
 *    O toque num vídeo é pego antes de o YouTube abrir a página dele (youtube.js + LDYoutube): a lista
 *    fica exatamente como estava, sem ir e voltar.
 * 14) versão 14:
 *    - transição sem "piscada escura": antes as duas telas apagavam ao mesmo tempo e o fundo escuro do app
 *      aparecia por um instante. Agora a tela que sai fica inteira por baixo (só desliza um pouco) e a que entra
 *      aparece por cima dela. Ao abrir um vídeo, a animação só começa quando a página já desenhou a tela do
 *      vídeo (mensagem "telaPronta"), para não aparecer a tela antiga dela.
 *    - internet: o aviso "Tentando reconectar" aparecia ao sair do app e voltar, com o Wi-Fi perfeito. Em segundo
 *      plano, o Android bloqueia a rede do app e getActiveNetwork() devolve null: o app achava que a internet
 *      tinha caído e não percebia a volta (o desbloqueio não chama onCapabilitiesChanged). Agora vale a rede e as
 *      capacidades que o próprio aviso do Android traz, a queda só é avisada depois de 2 s confirmada e com o
 *      app na tela, e ao voltar ao app o estado é conferido e mandado de novo.
 * 15) versão 15: troca entre o YouTube e a página sem tela meio transparente: a tela nova desliza inteira
 *    (opaca) por cima da antiga, que só recua um pouco. As abas do YouTube trocam sem animação do app
 *    (youtube.js), como no app oficial: a animação antiga piscava (conteúdo, escuro, conteúdo).
 * 16) versão 16:
 *    - troca de aba do YouTube igual à do app oficial (medida quadro a quadro numa gravação de tela): a página
 *      nova sobe 41 dp em 0,375 s na curva "fast out slow in", a partir do toque na aba (youtube.js);
 *    - o YouTube (tela inicial e player) no idioma do celular: o campo hl do cookie PREF passa a seguir o idioma
 *      do Android a cada abertura (antes ficava no idioma da primeira visita), e a primeira página leva ?hl=.
 * 17) versão 17: troca de aba do YouTube corrigida (youtube.js). A 16 animava já no toque, mas o site só troca
 *    a página 80 a 200 ms depois: a página ANTIGA descia e subia, com um quadro preto no começo, e a nova
 *    entrava com a subida pela metade. Agora o toque só arma a troca e a subida (41 dp, 0,375 s, de 89% a
 *    100%) começa no quadro em que a página nova aparece; até lá a antiga fica parada.
 * 18) versão 18: a página nova só começa a subir completa (youtube.js). Na gravação, a engrenagem surgia 1
 *    quadro depois, a foto do perfil 2 e as miniaturas ficavam cinza por 2 a 4 quadros, tudo no meio da
 *    subida. Agora ela espera invisível no ponto de partida (no máximo 120 ms) até as imagens à vista estarem
 *    carregadas e decodificadas e o YouTube passar um quadro sem pôr nada novo.
 */
public class MainActivity extends Activity {

    private static final String ORIGEM_APP = "https://hcostamc-sys.github.io";
    private static final String PAGINA = ORIGEM_APP + "/legenda-dupla/";
    private static final int VERSAO_APK = 19; // a página usa para saber o que o app sabe fazer
    private static final int PEDIDO_NOTIFICACAO = 7;
    private static final String INICIO_YOUTUBE = "https://m.youtube.com/";

    private WebView web;
    private FrameLayout raiz;
    private LinearLayout painelYt;
    private WebView ytWeb;
    private String ultimoUrlYt = "";
    private String scriptYoutube = "";
    private TextView botaoEntrar;
    private String ultimoVideo = "";
    private long ultimoVideoEm = 0;
    private View telaCheia;
    private WebChromeClient.CustomViewCallback fimTelaCheia;
    private String agenteUsuario = "";
    private final ExecutorService rede = Executors.newSingleThreadExecutor();
    /** Pedido de download esperando a permissão de notificações (null: nenhum). */
    private String pedidoPendente;
    /** A página já mostrou "o Android não pergunta mais": o próximo toque abre as configurações. */
    private boolean avisouBloqueio;
    /** Algum vídeo foi registrado no histórico do YouTube desde a última vez que o YouTube apareceu. */
    private final AtomicBoolean historicoMudou = new AtomicBoolean(false);
    /** O YouTube está saindo da tela (animação de 0,24 s): para o app, já não está mais na tela. */
    private boolean ytFechando = false;
    // Curvas "enfatizadas" do Material Design 3: entrar desacelerando bem no fim, sair acelerando.
    private static final PathInterpolator CURVA_ENTRA = new PathInterpolator(0.05f, 0.7f, 0.1f, 1f);
    /** Atualizar puxando para baixo (envolve o YouTube da tela inicial). */
    private SwipeRefreshLayout atualizadorYt;
    /** Capa por cima do YouTube enquanto ele recarrega: a lista antiga nunca aparece. */
    private View capaYt;
    private boolean recarregandoYt = false;
    private boolean recargaComecou = false;
    private int geracaoRecarga = 0;
    /** Elementos que indicam que a lista nova do YouTube já foi desenhada. */
    private static final String ITENS_YT = "ytm-rich-item-renderer, ytm-video-with-context-renderer, "
            + "ytm-compact-video-renderer, ytm-media-item, ytm-playlist-video-renderer, ytm-video-card-renderer";
    private ConnectivityManager conectividade;
    private ConnectivityManager.NetworkCallback ouvinteRede;
    private Boolean ultimoOnline;
    /** Rede padrão e capacidades dela, como o aviso do Android trouxe (não depende do bloqueio em segundo plano). */
    private Network redePadrao;
    private NetworkCapabilities capsPadrao;
    private boolean appNaTela = false;
    /** Queda da internet esperando confirmação (2 s): um tremido da rede não vira aviso. */
    private Runnable quedaPendente;
    private static final long CONFIRMAR_QUEDA_MS = 2000;
    /** Abrindo um vídeo: o YouTube só sai quando a página avisa que desenhou a tela nova (ou no limite). */
    private boolean esperandoTela = false;
    private int geracaoTransicao = 0;
    private static final long LIMITE_ESPERA_TELA_MS = 450;
    private static final PathInterpolator CURVA_PADRAO = new PathInterpolator(0.2f, 0f, 0f, 1f);
    /** Troca entre o YouTube e a página (versão 15): a tela nova desliza inteira por cima da antiga. */
    private static final long DURACAO_TROCA_MS = 360;
    /** Quanto a tela de baixo recua enquanto a nova entra (fração da largura). */
    private static final float RECUO = 0.25f;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        WebView.setWebContentsDebuggingEnabled(true); // permite inspecionar pelo chrome://inspect do notebook
        web = new WebView(this);
        raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#111111"));
        raiz.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setOutlineProvider(null); // a ordem das telas muda pelo Z, sem sombra
        setContentView(raiz);
        // Android 15 desenha atrás das barras do sistema: afasta o conteúdo delas e do teclado.
        raiz.setOnApplyWindowInsetsListener((v, ins) -> {
            int esq, topo, dir, baixo;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets b = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets t = ins.getInsets(WindowInsets.Type.ime());
                esq = b.left; topo = b.top; dir = b.right; baixo = Math.max(b.bottom, t.bottom);
            } else {
                esq = ins.getSystemWindowInsetLeft(); topo = ins.getSystemWindowInsetTop();
                dir = ins.getSystemWindowInsetRight(); baixo = ins.getSystemWindowInsetBottom();
            }
            v.setPadding(esq, topo, dir, baixo);
            return ins;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        agenteUsuario = s.getUserAgentString();

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true); // o player do YouTube fica num quadro de outro site
        // Versão 16: o YouTube (tela inicial e player) no idioma do celular, antes de qualquer página carregar.
        aplicarIdiomaYoutube();

        boolean gancho = false;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            String script = lerAsset("gancho.js");
            if (!script.isEmpty()) {
                Set<String> origensYoutube = new HashSet<>(Arrays.asList(
                        "https://www.youtube.com", "https://www.youtube-nocookie.com"));
                WebViewCompat.addDocumentStartJavaScript(web, script, origensYoutube);
                gancho = true;
            }
        }

        boolean ponte = false;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Set<String> origensApp = new HashSet<>(Arrays.asList(ORIGEM_APP));
            WebViewCompat.addWebMessageListener(web, "LDNativo", origensApp,
                    new WebViewCompat.WebMessageListener() {
                        @Override
                        public void onPostMessage(WebView view, WebMessageCompat mensagem, Uri origem,
                                                  boolean quadroPrincipal, JavaScriptReplyProxy resposta) {
                            if (quadroPrincipal) aoMensagem(mensagem.getData(), resposta);
                        }
                    });
            ponte = true;
        }

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (telaCheia != null) { callback.onCustomViewHidden(); return; }
                telaCheia = view;
                fimTelaCheia = callback;
                ((FrameLayout) getWindow().getDecorView()).addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                esconderBarras(true);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }

            @Override
            public void onHideCustomView() {
                sairTelaCheia();
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest pedido) {
                String url = pedido.getUrl().toString();
                if (url.startsWith(ServicoModelos.PREFIXO_LOCAL)) return ServicoModelos.responder(MainActivity.this, url);
                if (url.contains("/api/timedtext")) {
                    runOnUiThread(() -> chamarPagina("ldNativoViu", url));
                }
                return null; // não muda nada: a WebView segue com o pedido normal
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
                if (!pedido.isForMainFrame()) return false;
                Uri u = pedido.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.equals("hcostamc-sys.github.io")) return false;
                // Links para fora (por exemplo, abrir no YouTube) vão para o app certo.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) {
                    // nada
                }
                return true;
            }
        });

        // A página tem service worker: pedidos feitos por ele passam por aqui (os arquivos dos pacotes).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
                && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest pedido) {
                    return ServicoModelos.responder(MainActivity.this, pedido.getUrl().toString());
                }
            });
        }

        vigiarInternet();

        // Andamento do download dos pacotes: vai para a página.
        ServicoModelos.ouvinte = json -> runOnUiThread(() -> chamarPagina("ldModelosEstado", json));

        String versaoWebView = "?";
        PackageInfo pacote = WebViewCompat.getCurrentWebViewPackage(this);
        if (pacote != null) versaoWebView = pacote.versionName;

        String link = linkCompartilhado(getIntent());
        String url = PAGINA + "?app=android&apk=" + VERSAO_APK
                + "&gancho=" + gancho
                + "&ponte=" + ponte
                + "&wv=" + Uri.encode(versaoWebView)
                + link;
        web.loadUrl(url);
        // A tela inicial é o YouTube; vindo do Compartilhar, o vídeo abre direto no Legenda Dupla.
        if (link.isEmpty()) mostrarYoutube(null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String link = linkCompartilhado(intent);
        if (!link.isEmpty() && web != null) {
            fecharYoutube();
            web.loadUrl(PAGINA + "?app=android&apk=" + VERSAO_APK + link);
        }
    }

    /** Texto compartilhado pelo app do YouTube vira o parâmetro &link=... */
    private String linkCompartilhado(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return "";
        String texto = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (texto == null || texto.isEmpty()) return "";
        return "&text=" + Uri.encode(texto);
    }

    private void esconderBarras(boolean esconder) {
        View decor = getWindow().getDecorView();
        if (esconder) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private void sairTelaCheia() {
        if (telaCheia == null) return;
        ((FrameLayout) getWindow().getDecorView()).removeView(telaCheia);
        telaCheia = null;
        esconderBarras(false);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (fimTelaCheia != null) {
            WebChromeClient.CustomViewCallback cb = fimTelaCheia;
            fimTelaCheia = null;
            cb.onCustomViewHidden();
        }
    }

    // ------------------------------------------------------------------ YouTube (tela inicial)

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    /** Botão de texto com cantos redondos (os botões padrão do Android ficam com cara antiga). */
    private TextView criarBotao(String texto, boolean principal) {
        TextView b = new TextView(this);
        b.setText(texto);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(14), 0, dp(14), 0);
        b.setMinHeight(dp(38));
        b.setClickable(true);
        b.setFocusable(true);
        GradientDrawable fundo = new GradientDrawable();
        fundo.setCornerRadius(dp(19));
        if (principal) {
            fundo.setColor(Color.parseColor("#ffd54f"));
            b.setTextColor(Color.parseColor("#111111"));
        } else {
            fundo.setColor(Color.parseColor("#262626"));
            fundo.setStroke(dp(1), Color.parseColor("#3a3a3a"));
            b.setTextColor(Color.WHITE);
        }
        b.setBackground(fundo);
        return b;
    }

    private void criarPainelYoutube() {
        painelYt = new LinearLayout(this);
        painelYt.setOutlineProvider(null); // a ordem das telas muda pelo Z, sem sombra
        painelYt.setOrientation(LinearLayout.VERTICAL);
        painelYt.setBackgroundColor(Color.parseColor("#111111"));

        LinearLayout barra = new LinearLayout(this);
        barra.setOrientation(LinearLayout.HORIZONTAL);
        barra.setGravity(Gravity.CENTER_VERTICAL);
        barra.setBackgroundColor(Color.parseColor("#111111"));
        barra.setPadding(dp(12), dp(6), dp(10), dp(6));

        ImageView icone = new ImageView(this);
        icone.setImageResource(R.mipmap.ic_launcher);
        TextView nome = new TextView(this);
        nome.setText(R.string.app_name);
        nome.setTextColor(Color.WHITE);
        nome.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        nome.setTypeface(Typeface.DEFAULT_BOLD);
        nome.setSingleLine(true);
        nome.setPadding(dp(8), 0, dp(8), 0);

        TextView meus = criarBotao(getString(R.string.meus_videos), false);
        meus.setContentDescription(getString(R.string.meus_videos_desc));
        meus.setOnClickListener(v -> abrirMeusVideos());
        botaoEntrar = criarBotao(getString(R.string.entrar), true);
        botaoEntrar.setContentDescription(getString(R.string.entrar_desc));
        botaoEntrar.setOnClickListener(v -> entrarNaConta());

        barra.addView(icone, new LinearLayout.LayoutParams(dp(30), dp(30)));
        barra.addView(nome, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        barra.addView(meus, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38)));
        LinearLayout.LayoutParams pe = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38));
        pe.leftMargin = dp(8);
        barra.addView(botaoEntrar, pe);

        View linha = new View(this);
        linha.setBackgroundColor(Color.parseColor("#2a2a2a"));

        ytWeb = new WebView(this);
        WebSettings s = ytWeb.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true); // a lista não começa a tocar sozinha
        CookieManager.getInstance().setAcceptThirdPartyCookies(ytWeb, true);
        // Sem Shorts: o botão da barra de baixo e as prateleiras somem (antes do código do YouTube rodar).
        scriptYoutube = lerAsset("youtube.js");
        if (!scriptYoutube.isEmpty() && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(ytWeb, scriptYoutube,
                    new HashSet<>(Arrays.asList("https://m.youtube.com", "https://www.youtube.com")));
        }
        // Toque num vídeo: youtube.js avisa por aqui antes de o YouTube abrir a página do vídeo (a lista fica
        // como estava). Sem esse recurso, o app pega a troca de endereço (doUpdateVisitedHistory) e volta.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(ytWeb, "LDYoutube",
                    new HashSet<>(Arrays.asList("https://m.youtube.com", "https://www.youtube.com")),
                    (view, mensagem, origem, quadroPrincipal, resposta) -> {
                        if (!quadroPrincipal) return;
                        final String url = mensagem.getData();
                        if (url == null || url.isEmpty()) return;
                        runOnUiThread(() -> {
                            Uri u = Uri.parse(url);
                            if ("https".equals(u.getScheme()) && ehVideo(u) && youtubeNaTela()) escolherVideo(url, false);
                        });
                    });
        }
        // Durante a saída animada do YouTube, o toque não vai mais para ele (vai para o vídeo que está abrindo).
        ytWeb.setOnTouchListener((v, ev) -> ytFechando);
        ytWeb.setWebChromeClient(new WebChromeClient());
        ytWeb.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
                String url = pedido.getUrl().toString();
                if (pedido.isForMainFrame() && ehVideo(pedido.getUrl())) {
                    escolherVideo(url, false);
                    return true;
                }
                if (!pedido.isForMainFrame()) return false;
                String host = pedido.getUrl().getHost() == null ? "" : pedido.getUrl().getHost();
                if (host.endsWith("youtube.com") || host.endsWith("google.com") || host.endsWith("google.com.br")
                        || host.endsWith("gstatic.com") || host.endsWith("youtu.be")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, pedido.getUrl()));
                } catch (Exception e) {
                    // nada
                }
                return true;
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean recarregou) {
                // O site do YouTube troca de página sem recarregar: a abertura de um vídeo aparece aqui.
                if (url != null && ehVideo(Uri.parse(url))) escolherVideo(url, true);
                atualizarBotaoEntrar();
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icone) {
                if (recarregandoYt) recargaComecou = true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                atualizarBotaoEntrar();
                if (recarregandoYt && recargaComecou) esperarListaNova(geracaoRecarga, 20);
                // Reforço (WebView sem script no início da página): o script não repete se já rodou.
                if (!scriptYoutube.isEmpty() && url != null && url.contains("youtube.com")) {
                    view.evaluateJavascript(scriptYoutube, null);
                }
            }
        });

        painelYt.addView(barra, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        painelYt.addView(linha, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
        // YouTube + capa de recarga, dentro do "puxar para atualizar".
        FrameLayout caixaYt = new FrameLayout(this);
        caixaYt.addView(ytWeb, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        capaYt = new View(this);
        capaYt.setBackgroundColor(Color.parseColor("#111111"));
        capaYt.setClickable(true); // enquanto recarrega, o toque não vai para a lista
        capaYt.setVisibility(View.GONE);
        caixaYt.addView(capaYt, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        atualizadorYt = new SwipeRefreshLayout(this);
        atualizadorYt.setColorSchemeColors(Color.parseColor("#ffd54f"));
        atualizadorYt.setProgressBackgroundColorSchemeColor(Color.parseColor("#262626"));
        // Só puxa para atualizar com a lista no topo (o YouTube rola a página inteira).
        atualizadorYt.setOnChildScrollUpCallback((pai, filho) -> recarregandoYt || ytWeb.canScrollVertically(-1));
        atualizadorYt.setOnRefreshListener(() -> recarregarYoutube(false));
        atualizadorYt.addView(caixaYt, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        painelYt.addView(atualizadorYt, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        painelYt.setVisibility(View.GONE);
        raiz.addView(painelYt, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        atualizarBotaoEntrar();
    }

    /** Conectado ao YouTube: o cookie LOGIN_INFO só existe com a conta conectada. */
    private boolean conectadoAoYoutube() {
        String c = CookieManager.getInstance().getCookie("https://www.youtube.com");
        if (c == null) c = "";
        String m = CookieManager.getInstance().getCookie("https://m.youtube.com");
        if (m != null) c = c + "; " + m;
        return c.contains("LOGIN_INFO=");
    }

    private void atualizarBotaoEntrar() {
        if (botaoEntrar == null) return;
        botaoEntrar.setVisibility(conectadoAoYoutube() ? View.GONE : View.VISIBLE);
    }

    /**
     * Código de idioma do YouTube (parâmetro hl) para o idioma do celular. O YouTube só aceita os códigos da
     * lista dele (i18nLanguages da API de dados): "pt" é o português do Brasil e "pt-PT" o de Portugal;
     * espanhol: "es" (Espanha), "es-US" e "es-419" (América Latina); inglês: "en", "en-GB", "en-IN";
     * francês: "fr", "fr-CA"; chinês: "zh-CN", "zh-TW", "zh-HK"; hebraico é "iw"; norueguês, "no".
     */
    static String idiomaYoutube(Locale l) {
        String lingua = l.getLanguage();
        String pais = l.getCountry() == null ? "" : l.getCountry().toUpperCase(Locale.ROOT);
        String escrita = l.getScript() == null ? "" : l.getScript();
        if (lingua == null || lingua.isEmpty()) return "en";
        switch (lingua) {
            case "pt": return "PT".equals(pais) ? "pt-PT" : "pt";
            case "es":
                if (pais.isEmpty() || "ES".equals(pais)) return "es";
                return "US".equals(pais) ? "es-US" : "es-419";
            case "en": return "GB".equals(pais) ? "en-GB" : "IN".equals(pais) ? "en-IN" : "en";
            case "fr": return "CA".equals(pais) ? "fr-CA" : "fr";
            case "zh":
                if ("HK".equals(pais) || "MO".equals(pais)) return "zh-HK";
                if ("TW".equals(pais) || "Hant".equals(escrita)) return "zh-TW";
                return "zh-CN";
            case "he": case "iw": return "iw";
            case "in": return "id";
            case "nb": case "nn": return "no";
            case "tl": return "fil";
            case "sr": return "Latn".equals(escrita) ? "sr-Latn" : "sr";
            default: return lingua;
        }
    }

    /**
     * O YouTube guarda o idioma da interface no cookie PREF (campo hl), escolhido na primeira visita; depois
     * não mudava mais, mesmo trocando o idioma do celular. Aqui o campo hl passa a ser o idioma do celular a cada
     * abertura do app (trocar o idioma do Android reinicia a tela do app), mantendo o resto do PREF (fuso,
     * tema etc.). O cookie é de .youtube.com: vale para a tela inicial (m.youtube.com) e para o player.
     */
    private void aplicarIdiomaYoutube() {
        try {
            String hl = idiomaYoutube(Locale.getDefault());
            CookieManager cm = CookieManager.getInstance();
            String todos = cm.getCookie("https://www.youtube.com");
            String pref = "";
            if (todos != null) {
                for (String parte : todos.split(";")) {
                    String p = parte.trim();
                    if (p.startsWith("PREF=")) { pref = p.substring(5); break; }
                }
            }
            StringBuilder novo = new StringBuilder();
            for (String campo : pref.split("&")) {
                if (campo.isEmpty() || campo.startsWith("hl=")) continue;
                if (novo.length() > 0) novo.append('&');
                novo.append(campo);
            }
            if (novo.length() > 0) novo.append('&');
            novo.append("hl=").append(hl);
            cm.setCookie("https://www.youtube.com", "PREF=" + novo
                    + "; Domain=.youtube.com; Path=/; Max-Age=63072000; Secure; SameSite=None");
            cm.flush();
        } catch (Exception e) {
            // nada: o YouTube segue no idioma que já tinha
        }
    }

    /** Endereço do YouTube com o idioma do celular (hl), reforço do cookie na primeira página carregada. */
    private static String comIdiomaYoutube(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost() == null ? "" : u.getHost();
            if (!host.endsWith("youtube.com") || u.getQueryParameter("hl") != null) return url;
            return u.buildUpon().appendQueryParameter("hl", idiomaYoutube(Locale.getDefault())).build().toString();
        } catch (Exception e) {
            return url;
        }
    }

    /** Tela de login do Google para o YouTube, dentro do próprio YouTube do app (os cookies valem para o player). */
    private void entrarNaConta() {
        if (ytWeb == null) return;
        String hl = Uri.encode(Locale.getDefault().toLanguageTag()); // tela de login no idioma do celular
        String volta = "https://m.youtube.com/signin?action_handle_signin=true&app=m&hl="
                + Uri.encode(idiomaYoutube(Locale.getDefault())) + "&next=" + Uri.encode(INICIO_YOUTUBE);
        String url = "https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&hl=" + hl + "&continue="
                + Uri.encode(volta);
        ultimoUrlYt = url;
        ytWeb.loadUrl(url);
    }

    /** "Meus vídeos": esconde o YouTube e mostra a lista de vídeos do Legenda Dupla. */
    private void abrirMeusVideos() {
        fecharYoutube(true);
        chamarPagina("ldMostrarBiblioteca", "");
    }

    private static boolean ehVideo(Uri u) {
        if (u == null || u.getHost() == null) return false;
        String host = u.getHost();
        String caminho = u.getPath() == null ? "" : u.getPath();
        if (host.endsWith("youtu.be")) return caminho.length() > 1;
        if (!host.endsWith("youtube.com")) return false;
        if (caminho.startsWith("/watch")) return u.getQueryParameter("v") != null;
        return caminho.startsWith("/shorts/") || caminho.startsWith("/live/");
    }

    /** Mostra o YouTube. Sem endereço: continua onde estava (ou abre a página inicial na primeira vez). */
    private void mostrarYoutube(String url) {
        if (url != null && !url.isEmpty()) {
            Uri u = Uri.parse(url);
            String host = u.getHost() == null ? "" : u.getHost();
            if (!"https".equals(u.getScheme()) || !host.endsWith("youtube.com")) return;
        }
        if (painelYt == null) criarPainelYoutube();
        ytWeb.onResume();
        atualizarBotaoEntrar();
        String alvo = (url == null || url.isEmpty()) ? (ultimoUrlYt.isEmpty() ? INICIO_YOUTUBE : null) : url;
        if (alvo != null && !alvo.equals(ultimoUrlYt)) {
            ultimoUrlYt = alvo;
            historicoMudou.set(false); // a página nova já vem atualizada
            ytWeb.loadUrl(comIdiomaYoutube(alvo));
        } else if (historicoMudou.get() && paginaDeHistorico(ytWeb.getUrl())) {
            // Página do histórico: recarrega por baixo da capa (a capa entra antes de o YouTube aparecer).
            recarregarYoutube(true);
        }
        // A página inicial do YouTube fica exatamente como estava: sem recarregar (só puxando para baixo).
        // Transição (voltando, versão 15): o YouTube entra deslizando pela esquerda, INTEIRO (opaco), POR CIMA
        // da página, que fica inteira por baixo e só recua um pouco para a direita. Nunca há duas telas
        // apagadas (a "piscada escura" da versão 13) nem uma tela meio transparente sobre a outra (versão 14).
        geracaoTransicao++;
        esperandoTela = false;
        boolean escondido = painelYt.getVisibility() != View.VISIBLE;
        painelYt.animate().cancel();
        ytFechando = false;
        painelYt.setTranslationZ(dp(2));
        if (web != null) web.setTranslationZ(0f);
        float largura = larguraTela();
        if (escondido) {
            painelYt.setAlpha(1f);
            painelYt.setTranslationX(-largura);
            painelYt.setTranslationY(0f);
            painelYt.setVisibility(View.VISIBLE);
            if (web != null) {
                web.animate().cancel();
                web.setAlpha(1f);
                web.animate().translationX(largura * RECUO).setStartDelay(0).setDuration(DURACAO_TROCA_MS)
                        .setInterpolator(CURVA_ENTRA).start();
            }
        }
        if (painelYt.getAlpha() < 1f || painelYt.getTranslationX() != 0f) {
            painelYt.animate().alpha(1f).translationX(0f).setStartDelay(0).setDuration(DURACAO_TROCA_MS)
                    .setInterpolator(CURVA_ENTRA).withEndAction(this::restaurarPagina).start();
        } else {
            restaurarPagina();
        }
    }

    /** Largura da tela do app (para as telas entrarem inteiras pela borda). */
    private float larguraTela() {
        int w = raiz != null ? raiz.getWidth() : 0;
        return w > 0 ? w : getResources().getDisplayMetrics().widthPixels;
    }

    /** A página por baixo do YouTube volta ao lugar (fica pronta para a próxima vez). */
    private void restaurarPagina() {
        if (web == null || !youtubeNaTela()) return;
        web.animate().cancel();
        web.setAlpha(1f);
        web.setTranslationX(0f);
    }

    /** Páginas do YouTube que mostram o histórico: valem a recarga depois de assistir a um vídeo. */
    private static boolean paginaDeHistorico(String url) {
        if (url == null) return false;
        String caminho = Uri.parse(url).getPath();
        if (caminho == null) return false;
        return caminho.startsWith("/feed/history") || caminho.startsWith("/feed/library")
                || caminho.startsWith("/feed/you") || caminho.startsWith("/playlist");
    }

    /**
     * Recarrega o YouTube da tela inicial por baixo de uma capa com o ícone de recarregando: a lista antiga
     * some na hora e a nova só aparece já desenhada. depoisDoHistorico: espera os últimos registros do
     * histórico saírem (a fila "rede") e um instante para o YouTube processá-los.
     */
    private void recarregarYoutube(boolean depoisDoHistorico) {
        if (ytWeb == null || capaYt == null) return;
        String atual = ytWeb.getUrl();
        if (atual == null || atual.isEmpty() || atual.contains("accounts.google")) {
            atualizadorYt.setRefreshing(false);
            return;
        }
        final int geracao = ++geracaoRecarga;
        recarregandoYt = true;
        recargaComecou = false;
        historicoMudou.set(false);
        capaYt.animate().cancel();
        capaYt.setAlpha(1f);
        capaYt.setVisibility(View.VISIBLE);
        atualizadorYt.setRefreshing(true);
        Runnable recarregar = () -> {
            if (geracao != geracaoRecarga || ytWeb == null) return;
            ytWeb.reload();
        };
        if (depoisDoHistorico) {
            rede.execute(() -> runOnUiThread(() -> ytWeb.postDelayed(recarregar, 700)));
        } else {
            recarregar.run();
        }
        // Limite: a capa nunca fica mais de 15 s (internet lenta: aparece o que o YouTube tiver).
        capaYt.postDelayed(() -> { if (geracao == geracaoRecarga && recarregandoYt) mostrarListaNova(); }, 15000);
    }

    /** Espera a lista nova estar desenhada (até ~3 s depois de a página carregar) e tira a capa. */
    private void esperarListaNova(int geracao, int tentativas) {
        if (geracao != geracaoRecarga || !recarregandoYt || ytWeb == null) return;
        String js = "!!document.querySelector(" + JSONObject.quote(ITENS_YT) + ")";
        ytWeb.evaluateJavascript(js, r -> {
            if (geracao != geracaoRecarga || !recarregandoYt) return;
            if ("true".equals(r) || tentativas <= 0) ytWeb.postDelayed(this::mostrarListaNova, 120);
            else ytWeb.postDelayed(() -> esperarListaNova(geracao, tentativas - 1), 150);
        });
    }

    /** Tira a capa de recarga com um esmaecimento curto. */
    private void mostrarListaNova() {
        if (capaYt == null) return;
        recarregandoYt = false;
        recargaComecou = false;
        atualizadorYt.setRefreshing(false);
        capaYt.animate().cancel();
        capaYt.animate().alpha(0f).setStartDelay(0).setDuration(220).setInterpolator(CURVA_ENTRA)
                .withEndAction(() -> {
                    if (recarregandoYt) return; // outra recarga começou
                    capaYt.setVisibility(View.GONE);
                    capaYt.setAlpha(1f);
                }).start();
    }

    private void pausarYoutube() {
        if (ytWeb == null) return;
        ytWeb.evaluateJavascript(
                "document.querySelectorAll('video').forEach(function(v){try{v.pause()}catch(e){}})", null);
    }

    /** O YouTube está na tela (e não saindo dela). */
    private boolean youtubeNaTela() {
        return painelYt != null && painelYt.getVisibility() == View.VISIBLE && !ytFechando;
    }

    private void fecharYoutube() {
        fecharYoutube(false);
    }

    /**
     * Esconde o YouTube com a transição de eixo horizontal (avançando): a página entra pela direita, POR CIMA
     * do YouTube, que fica inteiro por baixo e só desliza um pouco para a esquerda (sem "piscada escura").
     * esperarPagina: a página está trocando de tela (abrir um vídeo, Meus vídeos): a animação espera ela avisar
     * que a tela nova já está desenhada (telaPronta), no máximo 0,45 s. Enquanto isso o YouTube fica como está
     * e o toque não vai mais para ele.
     */
    private void fecharYoutube(boolean esperarPagina) {
        if (!youtubeNaTela()) return;
        pausarYoutube();
        ytFechando = true;
        final int g = ++geracaoTransicao;
        if (esperarPagina && web != null) {
            esperandoTela = true;
            raiz.postDelayed(() -> {
                if (g == geracaoTransicao && esperandoTela) animarSaidaYoutube(g);
            }, LIMITE_ESPERA_TELA_MS);
        } else {
            animarSaidaYoutube(g);
        }
    }

    /** A página avisou que desenhou a tela nova: espera esse quadro chegar à tela e começa a animação. */
    private void aoTelaPronta() {
        if (!esperandoTela || web == null) return;
        final int g = geracaoTransicao;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.VISUAL_STATE_CALLBACK)) {
            WebViewCompat.postVisualStateCallback(web, g, id -> {
                if (g == geracaoTransicao && esperandoTela) animarSaidaYoutube(g);
            });
        } else {
            animarSaidaYoutube(g);
        }
    }

    private void animarSaidaYoutube(int g) {
        esperandoTela = false;
        if (g != geracaoTransicao || !ytFechando) return;
        float largura = larguraTela();
        // A página passa para cima do YouTube (Z) e entra deslizando pela direita, INTEIRA (opaca): nada de
        // tela meio transparente por cima da lista (versão 15). O YouTube, por baixo, só recua um pouco.
        painelYt.setTranslationZ(0f);
        painelYt.animate().cancel();
        painelYt.setAlpha(1f);
        painelYt.animate().translationX(-largura * RECUO).setStartDelay(0).setDuration(DURACAO_TROCA_MS)
                .setInterpolator(CURVA_ENTRA)
                .withEndAction(() -> {
                    if (!ytFechando || g != geracaoTransicao) return; // voltou a aparecer no meio da animação
                    ytFechando = false;
                    painelYt.setVisibility(View.GONE);
                    painelYt.setAlpha(1f);
                    painelYt.setTranslationX(0f);
                    ytWeb.onPause();
                }).start();
        if (web != null) {
            web.animate().cancel();
            web.setTranslationZ(dp(2));
            web.setAlpha(1f);
            web.setTranslationX(largura);
            web.animate().translationX(0f).setStartDelay(0).setDuration(DURACAO_TROCA_MS)
                    .setInterpolator(CURVA_ENTRA).start();
        }
    }

    /** Vídeo tocado na lista do YouTube: fecha o YouTube e abre o vídeo no Legenda Dupla. */
    private void escolherVideo(String url, boolean jaAbriu) {
        long agora = System.currentTimeMillis();
        if (url.equals(ultimoVideo) && agora - ultimoVideoEm < 2000) return; // o mesmo aviso duas vezes
        ultimoVideo = url;
        ultimoVideoEm = agora;
        if (jaAbriu) {
            pausarYoutube();
            if (ytWeb.canGoBack()) ytWeb.goBack(); // volta para a lista, para a próxima busca
        }
        fecharYoutube(true);
        chamarPagina("ldAbrirDoYoutube", url);
    }

    /** Toque de verdade (como o do dedo) num ponto da página, em pixels CSS. Usado no "Pular anúncio". */
    private void tocarNaPagina(double x, double y, double larguraCss) {
        if (web == null || larguraCss <= 0 || web.getWidth() <= 0) return;
        float f = (float) (web.getWidth() / larguraCss);
        final float px = (float) (x * f);
        final float py = (float) (y * f);
        if (px < 0 || py < 0 || px > web.getWidth() || py > web.getHeight()) return;
        final long inicio = SystemClock.uptimeMillis();
        MotionEvent baixo = MotionEvent.obtain(inicio, inicio, MotionEvent.ACTION_DOWN, px, py, 0);
        baixo.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        web.dispatchTouchEvent(baixo);
        baixo.recycle();
        web.postDelayed(() -> {
            MotionEvent cima = MotionEvent.obtain(inicio, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, px, py, 0);
            cima.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            web.dispatchTouchEvent(cima);
            cima.recycle();
        }, 70);
    }

    @Override
    public void onBackPressed() {
        if (telaCheia != null) { sairTelaCheia(); return; }
        if (youtubeNaTela()) {
            if (ytWeb.canGoBack()) ytWeb.goBack();
            else super.onBackPressed(); // o YouTube é a tela inicial: voltar daqui sai do app
            return;
        }
        if (web == null) { super.onBackPressed(); return; }
        // A página decide (fecha janelas, sai do vídeo); se não houver o que fazer, volta ao YouTube.
        web.evaluateJavascript("window.ldVoltar ? window.ldVoltar() : 'nao'", r -> {
            if (r != null && r.contains("ok")) return;
            mostrarYoutube(null);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        ServicoModelos.appVisivel = true;
        appNaTela = true;
        // De volta ao app: confere a internet de novo e manda o estado atual à página (versão 14).
        if (conectividade != null) conferirInternet(true);
        // De volta ao app: o aviso de "download concluído" já não precisa ficar nas notificações.
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ServicoModelos.NOTIF_FIM);
        // Voltou das configurações com as notificações ligadas: o download começa sozinho.
        if (pedidoPendente != null && notificacoesLiberadas()) {
            String pedido = pedidoPendente;
            pedidoPendente = null;
            comecarDownloadModelos(pedido);
        }
    }

    @Override
    protected void onPause() {
        ServicoModelos.appVisivel = false;
        appNaTela = false;
        cancelarQuedaPendente();
        super.onPause();
    }

    // ------------------------------------------------------------------ internet

    /**
     * Avisa a página quando a internet cai ou volta (e a WebView, que repassa os eventos online/offline).
     * "Com internet" = a rede padrão chega à internet e o Android confirmou (VALIDATED).
     * Versão 14: usa a rede e as capacidades que o próprio aviso do Android traz. getActiveNetwork() devolve null
     * quando o Android bloqueia a rede do app em segundo plano (economia de bateria), e isso não é internet caída.
     */
    private void vigiarInternet() {
        try {
            conectividade = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (conectividade == null) return;
            ouvinteRede = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network n) {
                    runOnUiThread(() -> {
                        if (!n.equals(redePadrao)) capsPadrao = null;
                        redePadrao = n;
                        conferirInternet(false);
                    });
                }

                @Override
                public void onLost(Network n) {
                    runOnUiThread(() -> {
                        if (n.equals(redePadrao)) {
                            redePadrao = null;
                            capsPadrao = null;
                        }
                        conferirInternet(false);
                    });
                }

                @Override
                public void onCapabilitiesChanged(Network n, NetworkCapabilities c) {
                    runOnUiThread(() -> {
                        redePadrao = n;
                        capsPadrao = c;
                        conferirInternet(false);
                    });
                }

                @Override
                public void onBlockedStatusChanged(Network n, boolean bloqueada) {
                    // Bloqueio em segundo plano não é internet caída; ao desbloquear, confere de novo.
                    if (!bloqueada) runOnUiThread(() -> conferirInternet(false));
                }
            };
            conectividade.registerDefaultNetworkCallback(ouvinteRede);
            conferirInternet(true);
        } catch (Exception e) {
            ouvinteRede = null; // sem o aviso do Android, a página ainda percebe o vídeo travado
        }
    }

    /** Internet chegando agora? Pelo aviso do Android; sem ele, pela rede ativa (pode ser null se bloqueada). */
    private boolean internetAgora() {
        try {
            Network n = redePadrao;
            NetworkCapabilities c = capsPadrao;
            if (n != null && c == null) c = conectividade.getNetworkCapabilities(n);
            if (n == null) {
                n = conectividade.getActiveNetwork();
                c = n == null ? null : conectividade.getNetworkCapabilities(n);
            }
            return c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (Exception e) {
            return ultimoOnline == null || ultimoOnline; // na dúvida, não avisa queda
        }
    }

    /**
     * Confere a internet e avisa a página se mudou. A volta é avisada na hora; a queda só depois de 2 s
     * confirmada e com o app na tela. forcar: manda o estado mesmo sem mudança (ao abrir e ao voltar ao app).
     */
    private void conferirInternet(boolean forcar) {
        if (conectividade == null) return;
        boolean online = internetAgora();
        if (online) {
            cancelarQuedaPendente();
            enviarInternet(true, forcar);
            return;
        }
        if (ultimoOnline == null) { enviarInternet(false, true); return; } // abrindo o app sem internet
        if (!ultimoOnline) { if (forcar) enviarInternet(false, true); return; }
        if (!appNaTela || quedaPendente != null) return; // em segundo plano não avisa; ao voltar, confere
        quedaPendente = () -> {
            quedaPendente = null;
            if (appNaTela && !internetAgora()) enviarInternet(false, false);
        };
        raiz.postDelayed(quedaPendente, CONFIRMAR_QUEDA_MS);
    }

    private void cancelarQuedaPendente() {
        if (quedaPendente != null && raiz != null) raiz.removeCallbacks(quedaPendente);
        quedaPendente = null;
    }

    private void enviarInternet(boolean valor, boolean forcar) {
        if (!forcar && ultimoOnline != null && ultimoOnline == valor) return;
        ultimoOnline = valor;
        if (web != null) {
            web.setNetworkAvailable(valor);
            chamarPagina("ldRede", valor ? "1" : "0");
        }
        if (ytWeb != null) ytWeb.setNetworkAvailable(valor);
    }

    @Override
    protected void onDestroy() {
        cancelarQuedaPendente();
        try {
            if (conectividade != null && ouvinteRede != null) conectividade.unregisterNetworkCallback(ouvinteRede);
        } catch (Exception e) {
            // nada
        }
        ServicoModelos.ouvinte = null;
        rede.shutdownNow();
        if (ytWeb != null) ytWeb.destroy();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ ponte com a página

    private void chamarPagina(String funcao, String valor) {
        if (web == null) return;
        String js = "window." + funcao + " && window." + funcao + "(" + JSONObject.quote(valor) + ")";
        web.evaluateJavascript(js, null);
    }

    /**
     * Mensagens da página: {"acao":"telaLigada","ligada":true}, {"acao":"youtube","url":"..."} (url vazia: volta
     * ao YouTube onde estava), {"acao":"tocar","x":..,"y":..,"largura":..} ou {"acao":"baixar","url":"...","id":"..."}
     */
    private void aoMensagem(String dados, JavaScriptReplyProxy resposta) {
        try {
            JSONObject o = new JSONObject(dados == null ? "{}" : dados);
            if ("youtube".equals(o.optString("acao"))) {
                final String url = o.optString("url", "");
                runOnUiThread(() -> mostrarYoutube(url));
                return;
            }
            if ("telaPronta".equals(o.optString("acao"))) {
                runOnUiThread(this::aoTelaPronta);
                return;
            }
            if ("rede".equals(o.optString("acao"))) {
                runOnUiThread(() -> { if (conectividade != null) conferirInternet(true); });
                return;
            }
            if ("tocar".equals(o.optString("acao"))) {
                final double x = o.optDouble("x", -1);
                final double y = o.optDouble("y", -1);
                final double largura = o.optDouble("largura", 0);
                runOnUiThread(() -> tocarNaPagina(x, y, largura));
                return;
            }
            String acao = o.optString("acao");
            if ("baixarModelos".equals(acao)) {
                runOnUiThread(() -> iniciarDownloadModelos(dados));
                return;
            }
            if ("cancelarModelos".equals(acao)) {
                runOnUiThread(() -> {
                    try {
                        startService(new Intent(this, ServicoModelos.class).setAction(ServicoModelos.ACAO_CANCELAR));
                    } catch (Exception e) {
                        // nada
                    }
                });
                return;
            }
            if ("estadoModelos".equals(acao)) {
                rede.execute(() -> {
                    String json = ServicoModelos.estadoAtual(this);
                    runOnUiThread(() -> chamarPagina("ldModelosEstado", json));
                });
                return;
            }
            if ("apagarModelos".equals(acao)) {
                rede.execute(() -> ServicoModelos.apagarTudo(this));
                return;
            }
            if ("historico".equals(acao)) {
                runOnUiThread(() -> registrarHistorico(o));
                return;
            }
            if ("telaLigada".equals(o.optString("acao"))) {
                if (o.optBoolean("ligada")) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                return;
            }
            if (!"baixar".equals(o.optString("acao"))) return;
            final String url = o.optString("url");
            final String id = o.optString("id");
            final String cookie = CookieManager.getInstance().getCookie(url);
            rede.execute(() -> {
                JSONObject r = baixar(url, cookie);
                try {
                    r.put("id", id);
                } catch (Exception e) {
                    // nada
                }
                final String texto = r.toString();
                runOnUiThread(() -> resposta.postMessage(texto));
            });
        } catch (Exception e) {
            // mensagem inválida: ignora
        }
    }

    // ------------------------------------------------------------------ download dos pacotes e permissão

    /** O app pode mostrar notificações? (Android 13+: permissão; todos: notificações ligadas nas configurações) */
    private boolean notificacoesLiberadas() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    private static String idDoPedido(String pedido) {
        try {
            return new JSONObject(pedido).optString("id", "");
        } catch (Exception e) {
            return "";
        }
    }

    private void avisarPermissao(String id, String estado, boolean bloqueado) {
        String json = "{\"estado\":\"" + estado + "\",\"id\":" + JSONObject.quote(id) + ",\"bloqueado\":" + bloqueado + "}";
        chamarPagina("ldModelosEstado", json);
    }

    /**
     * Pedido de download da página. O download precisa da permissão de notificações (é por ela que o Android
     * mostra o andamento e deixa o download seguir com o app fechado): sem ela, pergunta; se a pessoa negar,
     * a página explica e o botão "Tentar de novo" pergunta outra vez. Quando o Android não pergunta mais
     * (negado duas vezes) ou as notificações estão desligadas, o botão abre as configurações do app.
     */
    private void iniciarDownloadModelos(String pedido) {
        if (notificacoesLiberadas()) {
            pedidoPendente = null;
            avisouBloqueio = false;
            comecarDownloadModelos(pedido);
            return;
        }
        pedidoPendente = pedido;
        String id = idDoPedido(pedido);
        SharedPreferences pref = getSharedPreferences("ld", MODE_PRIVATE);
        boolean semPermissao = Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
        boolean jaPerguntou = pref.getBoolean("notificacaoPedida", false);
        if (semPermissao && (!jaPerguntou || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
            pref.edit().putBoolean("notificacaoPedida", true).apply();
            avisarPermissao(id, "pedindoPermissao", false);
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PEDIDO_NOTIFICACAO);
            return;
        }
        // O Android não mostra mais a pergunta: primeiro a página explica; no toque seguinte, abre as configurações.
        if (avisouBloqueio) abrirConfiguracoesNotificacao();
        avisouBloqueio = true;
        avisarPermissao(id, "semPermissao", true);
    }

    @Override
    public void onRequestPermissionsResult(int codigo, String[] permissoes, int[] resultados) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados);
        if (codigo != PEDIDO_NOTIFICACAO || pedidoPendente == null) return;
        String pedido = pedidoPendente;
        if (notificacoesLiberadas()) {
            pedidoPendente = null;
            avisouBloqueio = false;
            comecarDownloadModelos(pedido);
            return;
        }
        // Negou. Se o Android não vai perguntar de novo, o próximo toque já abre as configurações.
        boolean bloqueado = Build.VERSION.SDK_INT >= 33
                && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS);
        avisouBloqueio = bloqueado;
        avisarPermissao(idDoPedido(pedido), "semPermissao", bloqueado);
    }

    private void abrirConfiguracoesNotificacao() {
        try {
            startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception ignorar) {
                // nada
            }
        }
    }

    /** Começa o download dos pacotes (serviço em primeiro plano, com a notificação de andamento). */
    private void comecarDownloadModelos(String pedido) {
        try {
            Intent i = new Intent(this, ServicoModelos.class)
                    .setAction(ServicoModelos.ACAO_BAIXAR)
                    .putExtra(ServicoModelos.EXTRA_PEDIDO, pedido);
            startForegroundService(i);
        } catch (Exception e) {
            String json = "{\"estado\":\"erro\",\"id\":" + JSONObject.quote(idDoPedido(pedido))
                    + ",\"erro\":" + JSONObject.quote("O Android não deixou começar o download. Feche o app, abra de novo e toque em Tentar de novo.")
                    + ",\"detalhe\":" + JSONObject.quote(e.getClass().getSimpleName() + ": " + e.getMessage()) + "}";
            chamarPagina("ldModelosEstado", json);
        }
    }

    // ------------------------------------------------------------------ histórico do YouTube

    // O vídeo toca no player embutido (dentro da página), e o YouTube não põe vídeo de player embutido no
    // histórico da conta. Por isso o app faz o que o app do YouTube faz ao tocar um vídeo: lê, na página do
    // vídeo (com a conta conectada), os endereços de registro de reprodução e os chama com a sessão da conta.
    // Tudo nesta thread "rede": as variáveis abaixo só são usadas nela.
    private static final String UA_COMPUTADOR =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    private String histVideo = "";
    private String histPlayback = "";
    private String histWatchtime = "";
    private String histCpn = "";
    private double histUltimo = 0;
    private boolean histInicioEnviado;

    /** {"acao":"historico","evento":"preparar"|"inicio"|"progresso","video":"...","tempo":12.3} */
    private void registrarHistorico(JSONObject o) {
        final String video = o.optString("video", "");
        final String evento = o.optString("evento", "");
        final double tempo = Math.max(0, o.optDouble("tempo", 0));
        if (!video.matches("[A-Za-z0-9_-]{11}") || !conectadoAoYoutube()) return;
        final String cookie = CookieManager.getInstance().getCookie("https://www.youtube.com");
        if (cookie == null || cookie.isEmpty()) return;
        rede.execute(() -> {
            try {
                if ("preparar".equals(evento)) {
                    // O vídeo acabou de abrir: busca já os endereços; o "início" sai sem esperar nada.
                    histInicioEnviado = false; // abertura nova: o próximo "início" é uma reprodução nova
                    prepararHistorico(video, cookie);
                } else if ("inicio".equals(evento)) {
                    registrarInicio(video, tempo, cookie);
                } else if ("progresso".equals(evento)) {
                    // O início não saiu (internet fraca, por exemplo): tenta o início agora, já com este ponto.
                    if (!histInicioEnviado || !video.equals(histVideo)) {
                        registrarInicio(video, tempo, cookie);
                        return;
                    }
                    if (histWatchtime.isEmpty()) return;
                    int st;
                    if (tempo < histUltimo - 0.25) {
                        // Voltou no vídeo: avisa o ponto novo (trecho vazio), para o "continuar de onde parou".
                        st = chamar(montarRegistro(histWatchtime, tempo, tempo, tempo), cookie, video);
                    } else {
                        if (tempo - histUltimo < 0.5) return;
                        st = chamar(montarRegistro(histWatchtime, tempo, histUltimo, tempo), cookie, video);
                    }
                    histUltimo = tempo;
                    if (st >= 200 && st < 300) historicoMudou.set(true);
                    else avisarHistorico("tempo assistido: HTTP " + st);
                }
            } catch (Exception e) {
                avisarHistorico("falhou: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        });
    }

    /** Endereços de registro do vídeo (da página do vídeo, com a conta). true se já os tem. Só na thread "rede". */
    private boolean prepararHistorico(String video, String cookie) throws Exception {
        if (video.equals(histVideo) && !histPlayback.isEmpty()) return true;
        histVideo = video;
        histPlayback = "";
        histWatchtime = "";
        histInicioEnviado = false;
        long t0 = SystemClock.elapsedRealtime();
        String html = baixarPaginaVideo("https://www.youtube.com/watch?v=" + video + "&bpctr=9999999999&has_verified=1", cookie);
        histPlayback = extrairUrl(html, "videostatsPlaybackUrl");
        histWatchtime = extrairUrl(html, "videostatsWatchtimeUrl");
        if (histPlayback.isEmpty()) {
            avisarHistorico("a página do vídeo não trouxe o endereço de registro (" + html.length() + " letras)");
            return false;
        }
        avisarHistorico("endereços prontos em " + (SystemClock.elapsedRealtime() - t0) + " ms");
        return true;
    }

    /** Registra o começo da reprodução (o vídeo entra no histórico). Só na thread "rede". */
    private void registrarInicio(String video, double tempo, String cookie) throws Exception {
        if (!prepararHistorico(video, cookie)) return;
        histCpn = novoCpn(); // cada abertura do vídeo é uma reprodução nova (como no YouTube)
        histUltimo = tempo;
        int st = chamar(montarRegistro(histPlayback, tempo, -1, -1), cookie, video);
        histInicioEnviado = st >= 200 && st < 300;
        if (histInicioEnviado) historicoMudou.set(true);
        avisarHistorico("início registrado: HTTP " + st);
    }

    private void avisarHistorico(String texto) {
        runOnUiThread(() -> chamarPagina("ldHistorico", texto));
    }

    private static String novoCpn() {
        final String alfabeto = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
        java.security.SecureRandom r = new java.security.SecureRandom();
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 16; i++) b.append(alfabeto.charAt(r.nextInt(64)));
        return b.toString();
    }

    /** Endereço "baseUrl" de playbackTracking na página do vídeo (vazio se não achar). */
    private static String extrairUrl(String html, String chave) {
        // A página pode trazer o JSON escapado dentro de texto JavaScript (\x22 no lugar de aspas).
        String t = html.replace("\\x22", "\"").replace("\\x7b", "{").replace("\\x7d", "}");
        Matcher m = Pattern.compile("\"" + chave + "\":\\{\"baseUrl\":\"([^\"]+)\"").matcher(t);
        if (!m.find()) return "";
        String u = m.group(1).replace("\\u0026", "&").replace("\\/", "/").replace("\\x26", "&").replace("\\x3d", "=");
        return u.startsWith("https://") && Uri.parse(u).getHost() != null && Uri.parse(u).getHost().endsWith("youtube.com") ? u : "";
    }

    /** Monta o endereço de registro: cmt = ponto do vídeo; st/et = trecho assistido (só no tempo assistido). */
    private String montarRegistro(String base, double cmt, double st, double et) {
        Uri u = Uri.parse(base);
        Uri.Builder b = u.buildUpon().clearQuery();
        Set<String> trocar = new HashSet<>(Arrays.asList("ver", "cpn", "cmt", "st", "et", "el"));
        for (String nome : u.getQueryParameterNames()) {
            if (trocar.contains(nome)) continue;
            for (String v : u.getQueryParameters(nome)) b.appendQueryParameter(nome, v);
        }
        b.appendQueryParameter("ver", "2");
        b.appendQueryParameter("cpn", histCpn);
        b.appendQueryParameter("el", "detailpage");
        b.appendQueryParameter("cmt", String.format(Locale.US, "%.3f", cmt));
        if (st >= 0) {
            b.appendQueryParameter("st", String.format(Locale.US, "%.3f", st));
            b.appendQueryParameter("et", String.format(Locale.US, "%.3f", et));
        }
        return b.build().toString();
    }

    /**
     * Página do vídeo, lida só até achar os dois endereços de registro (eles vêm no começo do código da
     * página): a leitura para ali, em vez de baixar a página inteira (mais de 1 MB). Mais rápido na internet fraca.
     */
    private String baixarPaginaVideo(String endereco, String cookie) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(endereco).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Cookie", cookie);
            c.setRequestProperty("User-Agent", UA_COMPUTADOR);
            c.setRequestProperty("Accept-Language", Locale.getDefault().toLanguageTag());
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                int conferido = 0;
                while ((n = in.read(buf)) > 0 && out.size() < 8_000_000) {
                    out.write(buf, 0, n);
                    if (out.size() - conferido >= 65536) {
                        conferido = out.size();
                        String parcial = new String(out.toByteArray(), StandardCharsets.UTF_8);
                        if (!extrairUrl(parcial, "videostatsPlaybackUrl").isEmpty()
                                && !extrairUrl(parcial, "videostatsWatchtimeUrl").isEmpty()) {
                            return parcial;
                        }
                    }
                }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            c.disconnect();
        }
    }

    private int chamar(String endereco, String cookie, String video) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(endereco).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setRequestProperty("Cookie", cookie);
            c.setRequestProperty("User-Agent", UA_COMPUTADOR);
            c.setRequestProperty("Referer", "https://www.youtube.com/watch?v=" + video);
            int st = c.getResponseCode();
            try (InputStream in = st < 400 ? c.getInputStream() : c.getErrorStream()) {
                if (in != null) while (in.read() >= 0) { /* esvazia */ }
            } catch (Exception ignorar) {
                // nada
            }
            return st;
        } finally {
            c.disconnect();
        }
    }

    /** Plano B: baixa a URL de legenda pelo Android, com os cookies e o navegador da WebView. */
    private JSONObject baixar(String endereco, String cookie) {
        JSONObject r = new JSONObject();
        HttpURLConnection c = null;
        try {
            if (!endereco.startsWith("https://www.youtube.com/api/timedtext")) {
                r.put("erro", "Endereço não é de legenda do YouTube.");
                return r;
            }
            c = (HttpURLConnection) new URL(endereco).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent", agenteUsuario);
            c.setRequestProperty("Referer", "https://www.youtube.com/");
            c.setRequestProperty("Accept-Language", Locale.getDefault().toLanguageTag() + ",en;q=0.8");
            if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String corpo = "";
            if (in != null) {
                ByteArrayOutputStream saida = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) saida.write(buf, 0, n);
                in.close();
                corpo = new String(saida.toByteArray(), StandardCharsets.UTF_8);
            }
            r.put("status", status);
            r.put("texto", corpo);
        } catch (Exception e) {
            try {
                r.put("erro", e.getClass().getSimpleName() + ": " + e.getMessage());
            } catch (Exception ignorar) {
                // nada
            }
        } finally {
            if (c != null) c.disconnect();
        }
        return r;
    }

    private String lerAsset(String nome) {
        try (InputStream in = getAssets().open(nome)) {
            ByteArrayOutputStream saida = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) saida.write(buf, 0, n);
            return new String(saida.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }
}
