package io.github.hcostamcsys.legendadupla;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
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
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.JavaScriptReplyProxy;
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
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * App Android do Legenda Dupla: abre o site numa WebView e
 * 1) injeta o gancho (assets/gancho.js) no player do YouTube, que copia a legenda que o player baixa;
 * 2) recebe o Compartilhar do app do YouTube;
 * 3) oferece à página o objeto LDNativo: tela ligada e, no teste, baixar de novo uma legenda;
 * 4) tela cheia (deitado) quando a página pede;
 * 5) o YouTube como tela inicial (com botão Entrar e Meus vídeos): tocar num vídeo abre o vídeo no Legenda Dupla;
 * 6) toque de verdade no botão "Pular anúncio" do player, quando a página pede.
 */
public class MainActivity extends Activity {

    private static final String ORIGEM_APP = "https://hcostamc-sys.github.io";
    private static final String PAGINA = ORIGEM_APP + "/legenda-dupla/";
    private static final int VERSAO_APK = 4; // a página usa para saber o que o app sabe fazer
    private static final String INICIO_YOUTUBE = "https://m.youtube.com/";

    private WebView web;
    private FrameLayout raiz;
    private LinearLayout painelYt;
    private WebView ytWeb;
    private String ultimoUrlYt = "";
    private TextView botaoEntrar;
    private String ultimoVideo = "";
    private long ultimoVideoEm = 0;
    private View telaCheia;
    private WebChromeClient.CustomViewCallback fimTelaCheia;
    private String agenteUsuario = "";
    private final ExecutorService rede = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        WebView.setWebContentsDebuggingEnabled(true); // permite inspecionar pelo chrome://inspect do notebook
        web = new WebView(this);
        raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#111111"));
        raiz.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
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
        nome.setText("Legenda Dupla");
        nome.setTextColor(Color.WHITE);
        nome.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        nome.setTypeface(Typeface.DEFAULT_BOLD);
        nome.setSingleLine(true);
        nome.setPadding(dp(8), 0, dp(8), 0);

        TextView meus = criarBotao("Meus vídeos", false);
        meus.setContentDescription("Meus vídeos: os vídeos que você já estudou");
        meus.setOnClickListener(v -> abrirMeusVideos());
        botaoEntrar = criarBotao("Entrar", true);
        botaoEntrar.setContentDescription("Entrar na sua conta do YouTube");
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
            public void onPageFinished(WebView view, String url) {
                atualizarBotaoEntrar();
            }
        });

        painelYt.addView(barra, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        painelYt.addView(linha, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
        painelYt.addView(ytWeb, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
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

    /** Tela de login do Google para o YouTube, dentro do próprio YouTube do app (os cookies valem para o player). */
    private void entrarNaConta() {
        if (ytWeb == null) return;
        String volta = "https://m.youtube.com/signin?action_handle_signin=true&app=m&hl=pt-BR&next="
                + Uri.encode(INICIO_YOUTUBE);
        String url = "https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&hl=pt-BR&continue="
                + Uri.encode(volta);
        ultimoUrlYt = url;
        ytWeb.loadUrl(url);
    }

    /** "Meus vídeos": esconde o YouTube e mostra a lista de vídeos do Legenda Dupla. */
    private void abrirMeusVideos() {
        fecharYoutube();
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
        painelYt.setVisibility(View.VISIBLE);
        ytWeb.onResume();
        atualizarBotaoEntrar();
        String alvo = (url == null || url.isEmpty()) ? (ultimoUrlYt.isEmpty() ? INICIO_YOUTUBE : null) : url;
        if (alvo != null && !alvo.equals(ultimoUrlYt)) {
            ultimoUrlYt = alvo;
            ytWeb.loadUrl(alvo);
        }
    }

    private void pausarYoutube() {
        if (ytWeb == null) return;
        ytWeb.evaluateJavascript(
                "document.querySelectorAll('video').forEach(function(v){try{v.pause()}catch(e){}})", null);
    }

    private void fecharYoutube() {
        if (painelYt == null || painelYt.getVisibility() != View.VISIBLE) return;
        pausarYoutube();
        painelYt.setVisibility(View.GONE);
        ytWeb.onPause();
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
        fecharYoutube();
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
        if (painelYt != null && painelYt.getVisibility() == View.VISIBLE) {
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
    protected void onDestroy() {
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
            if ("tocar".equals(o.optString("acao"))) {
                final double x = o.optDouble("x", -1);
                final double y = o.optDouble("y", -1);
                final double largura = o.optDouble("largura", 0);
                runOnUiThread(() -> tocarNaPagina(x, y, largura));
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
            c.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8");
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
