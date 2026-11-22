package io.github.hcostamcsys.legendadupla;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Bundle;
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
 * 4) tela cheia (deitado) quando a página pede.
 */
public class MainActivity extends Activity {

    private static final String ORIGEM_APP = "https://hcostamc-sys.github.io";
    private static final String PAGINA = ORIGEM_APP + "/legenda-dupla/";

    private WebView web;
    private View telaCheia;
    private WebChromeClient.CustomViewCallback fimTelaCheia;
    private String agenteUsuario = "";
    private final ExecutorService rede = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        WebView.setWebContentsDebuggingEnabled(true); // permite inspecionar pelo chrome://inspect do notebook
        web = new WebView(this);
        setContentView(web);

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

        String url = PAGINA + "?app=android"
                + "&gancho=" + gancho
                + "&ponte=" + ponte
                + "&wv=" + Uri.encode(versaoWebView)
                + linkCompartilhado(getIntent());
        web.loadUrl(url);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String link = linkCompartilhado(intent);
        if (!link.isEmpty() && web != null) {
            web.loadUrl(PAGINA + "?app=android" + link);
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

    @Override
    public void onBackPressed() {
        if (telaCheia != null) { sairTelaCheia(); return; }
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        rede.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ ponte com a página

    private void chamarPagina(String funcao, String valor) {
        if (web == null) return;
        String js = "window." + funcao + " && window." + funcao + "(" + JSONObject.quote(valor) + ")";
        web.evaluateJavascript(js, null);
    }

    /** Mensagens da página: {"acao":"telaLigada","ligada":true} ou {"acao":"baixar","url":"...","id":"..."} */
    private void aoMensagem(String dados, JavaScriptReplyProxy resposta) {
        try {
            JSONObject o = new JSONObject(dados == null ? "{}" : dados);
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
