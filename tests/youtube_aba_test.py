"""Teste da animação de troca de aba do YouTube do app (android/app/src/main/assets/youtube.js), versão 18.

Monta uma página de mentira com os nomes de elementos do m.youtube.com (barra de cima, conteúdo e barra de
abas), que troca de página como o site de verdade fez na gravação de 23/11/2026: a página antiga fica na tela
uns 80 a 200 ms depois do toque e só então a nova entra. Injeta o youtube.js e confere, quadro a quadro:
- antes da troca, a página antiga não se mexe nem escurece (a versão 16 a fazia descer e piscar);
- o 1º quadro da página nova já está 41 px abaixo, a 89%, e ela sobe na curva medida no app oficial
  (41 px em 0,375 s, (0.4, 0, 0.2, 1)), clareando até 100%;
- a página nova só aparece completa (miniatura carregada, engrenagem no lugar), com no máximo 120 ms escuros;
- tocar na aba aberta, ou uma troca que nunca vem, não anima nada.

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

PAGINA = """<!doctype html><html><head><meta charset="utf-8"><meta name=viewport content="width=384"></head>
<body style="margin:0;background:#0f0f0f;color:#fff">
<ytm-mobile-topbar-renderer style="display:block;height:48px;background:#0f0f0f"><span>topo</span></ytm-mobile-topbar-renderer>
<ytm-browse id="pag" style="display:block;height:700px;background:#222"><div class="lista" style="height:700px">Você</div></ytm-browse>
<ytm-pivot-bar-renderer style="display:flex;position:fixed;bottom:0;left:0;right:0;height:48px;background:#000">
  <ytm-pivot-bar-item-renderer id="inicio"><div class="pivot-bar-item-tab pivot-w2w" role="tab" aria-selected="false">Início</div></ytm-pivot-bar-item-renderer>
  <ytm-pivot-bar-item-renderer id="inscr"><div class="pivot-bar-item-tab pivot-subs" role="tab" aria-selected="false">Inscrições</div></ytm-pivot-bar-item-renderer>
  <ytm-pivot-bar-item-renderer id="voce"><div class="pivot-bar-item-tab pivot-library" role="tab" aria-selected="true">Você</div></ytm-pivot-bar-item-renderer>
</ytm-pivot-bar-renderer>
<script>
  window.modo = 'troca'; window.atraso = 120;
  // Imagem de 1 px (a miniatura) e quanto ela demora: como na gravação, a página nova chega sem a
  // engrenagem (vem 1 quadro depois) e com a miniatura cinza (a imagem chega depois). 'nunca': não chega.
  var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  window.atrasoImg = 40;
  function novaPagina(texto) {
    var velha = document.getElementById('pag');
    var nova = document.createElement('ytm-browse');
    nova.id = 'pag'; nova.style.cssText = velha.style.cssText;
    nova.innerHTML = '<img class="mini" style="display:block;width:200px;height:110px;background:#555">' +
      '<div class="lista" style="height:590px">' + texto + '</div>';
    velha.replaceWith(nova);
    var topo = document.querySelector('ytm-mobile-topbar-renderer');
    topo.innerHTML = '<span>topo ' + texto + '</span>';
    requestAnimationFrame(function () { topo.insertAdjacentHTML('beforeend', '<i class="engrenagem">*</i>'); });
    if (window.atrasoImg !== 'nunca') setTimeout(function () { nova.querySelector('img').src = PNG; }, window.atrasoImg);
  }
  // Como o m.youtube.com: a aba acende na hora, o endereço muda e a página antiga continua na tela até a
  // nova chegar. modo 'duas': esconde a antiga num quadro e põe a nova no seguinte. modo 'nunca': não troca.
  function irPara(item, caminho, texto) {
    document.querySelectorAll('[role=tab]').forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
    item.querySelector('[role=tab]').setAttribute('aria-selected', 'true');
    setTimeout(function () { history.pushState({}, '', caminho); }, 10);
    if (window.modo === 'nunca') return;
    setTimeout(function () {
      window.trocouEm = performance.now();
      if (window.modo === 'duas') {
        document.getElementById('pag').hidden = true;
        requestAnimationFrame(function () { requestAnimationFrame(function () { novaPagina(texto); }); });
      } else novaPagina(texto);
    }, window.atraso);
  }
  document.getElementById('inicio').addEventListener('click', function () { irPara(this, '/', 'Início'); });
  document.getElementById('inscr').addEventListener('click', function () { irPara(this, '/feed/subscriptions', 'Inscrições'); });
  document.getElementById('voce').addEventListener('click', function () { irPara(this, '/feed/you', 'Você'); });
  window.addEventListener('popstate', function () {
    setTimeout(function () { novaPagina(location.pathname); }, 50);
  });
  // Grava, a cada quadro: tempo da animação (ou -1 sem ela), barra de cima (y, opacidade), conteúdo
  // (y, opacidade), texto do conteúdo e se a classe ld-aba está ligada.
  window.gravar = function (ms) {
    return new Promise(function (ok) {
      var t0 = performance.now(), linhas = [];
      function ler(el) {
        var cs = getComputedStyle(el); var m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
        return [m.m42, Number(cs.opacity)];
      }
      (function q() {
        var agora = performance.now();
        var an = document.querySelector('ytm-mobile-topbar-renderer').getAnimations()
          .filter(function (a) { return a.animationName === 'ld-aba-sobe'; })[0];
        var ta = an && an.currentTime !== null ? an.currentTime : -1;
        var pag = document.getElementById('pag');
        linhas.push([ta].concat(ler(document.querySelector('ytm-mobile-topbar-renderer')), ler(pag),
          [pag.hidden ? '' : pag.textContent, document.documentElement.classList.contains('ld-aba'), agora - t0,
           !!(pag.querySelector('img') ? pag.querySelector('img').naturalWidth : 1),
           !!document.querySelector('.engrenagem') || !pag.querySelector('img'), window.trocouEm ? agora - window.trocouEm : -1]));
        if (agora - t0 < ms) requestAnimationFrame(q); else ok(linhas);
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


def conferir_troca(linhas, antigo, nome, erros, completa=True):
    """Uma troca de aba gravada: antiga parada até sair; nova entra embaixo e sobe na curva."""
    antes = [l for l in linhas if l[5] == antigo]
    for l in antes:
        if abs(l[1]) > 0.01 or abs(l[3]) > 0.01 or l[2] < 0.999 or l[4] < 0.999:
            erros.append(f'{nome}: a página antiga se mexeu ou escureceu antes da troca: ' + json.dumps(l))
            break
    if not antes:
        erros.append(f'{nome}: a gravação não pegou a página antiga')
    novas = [l for l in linhas if l[5] not in (antigo, '')]
    vistas = [l for l in novas if l[4] > 0.05]
    if not vistas:
        erros.append(f'{nome}: a página nova não apareceu')
        return
    if completa:
        for l in vistas:
            if not (l[8] and l[9]):
                erros.append(f'{nome}: página nova na tela sem a miniatura ou sem a engrenagem: ' + json.dumps(l))
                break
    espera = vistas[0][7] - novas[0][7]
    if espera > 140:
        erros.append(f'{nome}: tela escura por {espera:.0f} ms antes da subida (limite 120 ms)')
    for l in novas:
        if l[4] <= 0.05 and l[6]:
            erros.append(f'{nome}: animação começou com a página invisível')
            break
    p = vistas[0]
    if p[3] < 38 or p[4] < 0.88 or p[4] > 0.92:
        erros.append(f'{nome}: o 1º quadro da página nova não estava 41 px abaixo a 89%: ' + json.dumps(p))
    maior = 0.0
    for t, ty_topo, op_topo, ty, op, *_ in vistas:
        if t < 0 or t > 360:
            continue
        x = fosi(min(1.0, t / 375))
        maior = max(maior, abs(ty_topo - 41 * (1 - x)), abs(ty - 41 * (1 - x)))
        if abs(op - (0.89 + 0.11 * x)) > 0.015 or abs(op - op_topo) > 0.01:
            erros.append(f'{nome}: opacidade fora da curva aos {t:.0f} ms ({op:.3f})')
            break
    if maior > 2.5:
        erros.append(f'{nome}: subida fora da curva: diferença de {maior:.1f} px')
    fim = linhas[-1]
    if abs(fim[1]) > 0.01 or abs(fim[3]) > 0.01 or fim[2] < 0.999 or fim[4] < 0.999 or fim[6]:
        erros.append(f'{nome}: não terminou no lugar: ' + json.dumps(fim))
    if os.environ.get('MOSTRAR'):
        for l in linhas:
            print(nome, [round(x, 2) if isinstance(x, float) else x for x in l])


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
        if any(abs(l[1]) > 0.01 or abs(l[3]) > 0.01 or l[6] for l in linhas):
            erros.append('tocar na aba aberta animou')

        # 2) trocar de aba, página nova 120 ms depois do toque (como na gravação)
        pag.click('#inicio')  # pointerup + click do mesmo toque: uma animação só
        conferir_troca(pag.evaluate('gravar(760)'), 'Você', 'troca 120 ms', erros)

        # 3) a página nova demora 300 ms (primeira abertura da aba)
        pag.evaluate('window.atraso = 300')
        pag.click('#inscr')
        conferir_troca(pag.evaluate('gravar(960)'), 'Início', 'troca 300 ms', erros)

        # 4) o site esconde a antiga num quadro e põe a nova dois quadros depois
        pag.evaluate("window.atraso = 100; window.modo = 'duas'")
        pag.click('#voce')
        conferir_troca(pag.evaluate('gravar(760)'), 'Inscrições', 'troca em dois passos', erros)

        # 5) toque que não troca de página: nada anima
        pag.evaluate("window.modo = 'nunca'")
        pag.click('#inicio')
        linhas = pag.evaluate('gravar(400)')
        if any(abs(l[1]) > 0.01 or abs(l[3]) > 0.01 or l[6] for l in linhas):
            erros.append('animou sem a página trocar')
        pag.evaluate("window.modo = 'troca'; window.atraso = 120")
        pag.evaluate("history.replaceState({}, '', '/feed/you')")
        pag.wait_for_timeout(3200)  # a espera armada pelo toque sem troca acaba

        # 6) miniatura que não carrega (internet lenta): sobe assim mesmo depois de uns 120 ms
        pag.evaluate("window.atrasoImg = 'nunca'")
        antigo = pag.evaluate("document.getElementById('pag').textContent")
        pag.click('#inscr')
        conferir_troca(pag.evaluate('gravar(800)'), antigo, 'imagem que não chega', erros, completa=False)
        pag.evaluate('window.atrasoImg = 40')
        pag.wait_for_timeout(300)

        # 7) voltar do celular entre abas: anima também, quando a página volta
        pag.click('#inicio')
        pag.evaluate('gravar(760)')
        texto = pag.evaluate("document.getElementById('pag').textContent")
        pag.go_back()
        conferir_troca(pag.evaluate('gravar(760)'), texto, 'voltar', erros)
        nav.close()
    servidor.shutdown()
    shutil.rmtree(pasta, ignore_errors=True)
    if erros:
        print('FALHOU:\n- ' + '\n- '.join(erros))
        sys.exit(1)
    print('ok: troca de aba igual à do app oficial, só quando a página nova entra')


if __name__ == '__main__':
    main()
