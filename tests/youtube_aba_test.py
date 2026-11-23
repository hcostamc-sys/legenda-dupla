"""Teste da animação de troca de aba do YouTube do app (android/app/src/main/assets/youtube.js), versão 16.

Monta uma página de mentira com os nomes de elementos do m.youtube.com (barra de cima, conteúdo e barra de
abas), injeta o youtube.js e confere, quadro a quadro, a curva medida no app oficial do YouTube:
sobe 41 px em 0,375 s na curva (0.4, 0, 0.2, 1), opacidade 0 -> 0,89 em uns 22 ms e depois até 1.

Uso (na raiz do projeto): python3 tests/youtube_aba_test.py
"""
import functools
import http.server
import json
import os
import shutil
import socketserver
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(RAIZ, 'android', 'app', 'src', 'main', 'assets', 'youtube.js')

PAGINA = """<!doctype html><html><head><meta name=viewport content="width=384"></head>
<body style="margin:0;background:#0f0f0f;color:#fff">
<ytm-mobile-topbar-renderer style="display:block;height:48px;background:#0f0f0f">topo</ytm-mobile-topbar-renderer>
<ytm-browse id="pag" style="display:block;height:600px;background:#222">Você</ytm-browse>
<ytm-pivot-bar-renderer style="display:flex;position:fixed;bottom:0;left:0;right:0;height:48px">
  <ytm-pivot-bar-item-renderer id="inicio"><div class="pivot-bar-item-tab pivot-w2w" role="tab" aria-selected="false">Início</div></ytm-pivot-bar-item-renderer>
  <ytm-pivot-bar-item-renderer id="inscr"><div class="pivot-bar-item-tab pivot-subs" role="tab" aria-selected="false">Inscrições</div></ytm-pivot-bar-item-renderer>
  <ytm-pivot-bar-item-renderer id="voce"><div class="pivot-bar-item-tab pivot-library" role="tab" aria-selected="true">Você</div></ytm-pivot-bar-item-renderer>
</ytm-pivot-bar-renderer>
<script>
  // Como o m.youtube.com: troca o conteúdo pelos blocos cinza, muda o endereço e depois põe outra página.
  function irPara(item, caminho) {
    document.querySelectorAll('[role=tab]').forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
    item.querySelector('[role=tab]').setAttribute('aria-selected', 'true');
    document.getElementById('pag').textContent = 'blocos cinza';
    setTimeout(function () { history.pushState({}, '', caminho); }, 10);
    setTimeout(function () {
      var velha = document.getElementById('pag');
      var nova = document.createElement('ytm-browse');
      nova.id = 'pag'; nova.style.cssText = velha.style.cssText; nova.textContent = 'conteúdo novo';
      velha.replaceWith(nova);
    }, 60);
  }
  document.getElementById('inicio').addEventListener('click', function () { irPara(this, '/'); });
  document.getElementById('inscr').addEventListener('click', function () { irPara(this, '/feed/subscriptions'); });
  document.getElementById('voce').addEventListener('click', function () { /* já aberta: nada */ });
  // Grava, a cada quadro, o deslocamento e a opacidade da barra de cima e do conteúdo.
  window.gravar = function (ms) {
    return new Promise(function (ok) {
      var t0 = performance.now(), linhas = [];
      function ler(el) {
        var cs = getComputedStyle(el); var m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
        return [m.m42, Number(cs.opacity)];
      }
      (function q() {
        var t = performance.now() - t0;
        // tempo da animação da barra de cima (o relógio da própria animação; sem ela, o do gravador)
        var an = document.querySelector('ytm-mobile-topbar-renderer').getAnimations()
          .filter(function (a) { return a.animationName === 'ld-aba-sobe'; })[0];
        if (an && an.currentTime !== null) t = an.currentTime; else if (linhas.length) t = Math.max(t, 1000);
        linhas.push([t].concat(ler(document.querySelector('ytm-mobile-topbar-renderer')), ler(document.getElementById('pag')),
          [document.documentElement.classList.contains('ld-aba')]));
        if (t < ms) requestAnimationFrame(q); else ok(linhas);
      })();
    });
  };
</script></body></html>"""


def fosi(x):
    """cubic-bezier(0.4, 0, 0.2, 1) no ponto x (0..1)."""
    lo, hi = 0.0, 1.0
    for _ in range(60):
        s = (lo + hi) / 2
        xs = 3 * (1 - s) ** 2 * s * 0.4 + 3 * (1 - s) * s ** 2 * 0.2 + s ** 3
        if xs < x:
            lo = s
        else:
            hi = s
    s = (lo + hi) / 2
    return 3 * (1 - s) * s ** 2 + s ** 3


def main():
    pasta = tempfile.mkdtemp(prefix='ld-aba-')
    with open(os.path.join(pasta, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(PAGINA)
    servidor = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=pasta))
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    porta = servidor.server_address[1]
    erros = []
    with sync_playwright() as pw:
        try:
            nav = pw.chromium.launch()
        except Exception:
            nav = pw.chromium.launch(executable_path='/usr/bin/google-chrome')
        pag = nav.new_page(viewport={'width': 384, 'height': 824})
        pag.add_init_script(path=SCRIPT)
        pag.goto(f'http://127.0.0.1:{porta}/index.html')
        pag.evaluate("history.replaceState({}, '', '/feed/you')")

        # 1) tocar na aba que já está aberta: nada se move
        pag.click('#voce')
        linhas = pag.evaluate('gravar(150)')
        if any(abs(l[1]) > 0.01 or abs(l[3]) > 0.01 or l[5] for l in linhas):
            erros.append('tocar na aba aberta animou')

        # 2) trocar de aba: curva medida no app oficial
        pag.click('#inicio')  # pointerup + click do mesmo toque: uma animação só
        linhas = pag.evaluate('gravar(520)')
        if os.environ.get('MOSTRAR'):
            for l in linhas:
                print([round(x, 3) if isinstance(x, float) else x for x in l])
        maior = 0.0
        for t, ty_topo, op_topo, ty, op, _ in linhas:
            if t > 360:
                continue
            esperado = 41 * (1 - fosi(min(1.0, t / 375)))
            # a barra de cima e o conteúdo (trocado pelo "YouTube" aos 60 ms) andam juntos, na curva
            maior = max(maior, abs(ty_topo - esperado), abs(ty - esperado))
            if abs(op - op_topo) > 0.01:
                erros.append(f'conteúdo trocado piscou aos {t:.0f} ms (opacidade {op:.2f})')
                break
        if maior > 2.5:
            erros.append(f'barra de cima fora da curva: diferença de {maior:.1f} px')
        meio = [l for l in linhas if 25 <= l[0] <= 60 and not l[0] >= 1000]
        if meio and not all(0.85 <= l[2] <= 0.95 for l in meio):
            erros.append('opacidade logo depois do toque fora de 0,85..0,95: ' + json.dumps([round(l[2], 3) for l in meio]))
        fim = linhas[-1]
        if abs(fim[1]) > 0.01 or abs(fim[3]) > 0.01 or fim[2] < 0.999 or fim[4] < 0.999 or fim[5]:
            erros.append('não terminou no lugar: ' + json.dumps(fim))
        if not any(l[5] for l in linhas):
            erros.append('a classe ld-aba não apareceu')

        # 3) voltar do celular entre abas: anima também
        pag.go_back()
        linhas = pag.evaluate('gravar(60)')
        if not any(l[1] > 20 for l in linhas):
            erros.append('voltar entre abas não animou')
        nav.close()
    servidor.shutdown()
    shutil.rmtree(pasta, ignore_errors=True)
    if erros:
        print('FALHOU:\n- ' + '\n- '.join(erros))
        sys.exit(1)
    print('ok: troca de aba igual à curva do app oficial')


if __name__ == '__main__':
    main()
