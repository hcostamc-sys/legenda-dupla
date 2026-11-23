"""Teste da troca para a aba Início do YouTube do app (android/app/src/main/assets/youtube.js), versão 19.

Na aba Você tudo já subia junto (versão 18), mas na aba Início um conjunto de elementos pulava fora de
sincronia (gravação do usuário, 23/11/2026). A aba Início é a única com a fileira de chips (Tudo, Música,
Ao vivo...) logo abaixo da barra de cima, e no m.youtube.com essa barra de cima fica num cabeçalho FIXO.
Os nomes e o CSS reais do m.youtube.com não podem ser vistos daqui (o YouTube é bloqueado), então este
teste monta as três formas que tiram uma parte da página da animação:
- 'fixo': chips com position: fixed DENTRO do conteúdo (com o conteúdo deslocado, o fixo passa a contar a
  partir dele e pula para o lugar no fim);
- 'fora': chips fora do conteúdo (ytm-browse), que a versão 18 não movia;
- 'transicao': chips com uma transição própria do YouTube (entram deslizando no tempo deles).
Em cada quadro, os chips, a barra de cima e o conteúdo têm de estar no mesmo deslocamento (até 1,5 px),
nada da página nova pode aparecer durante a espera escura, e no fim tudo fica no lugar.

Uso (na raiz do projeto): python3 tests/youtube_aba_inicio_test.py
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
<body style="margin:0;background:#0f0f0f;color:#fff;font:14px sans-serif">
<ytm-app style="display:block"><div id="app">
  <header id="cab" style="position:fixed;top:0;left:0;right:0;height:48px;background:#0f0f0f;z-index:4">
    <ytm-mobile-topbar-renderer style="display:block;height:48px">topo</ytm-mobile-topbar-renderer>
  </header>
  <div class="page-container" style="padding-top:48px">
    <ytm-browse id="pag" style="display:block;min-height:800px;background:#222"><div class="lista" style="height:800px">Você</div></ytm-browse>
  </div>
  <div class="pivot-fundo" style="position:fixed;bottom:0;left:0;right:0;height:48px;background:#111"></div>
  <ytm-pivot-bar-renderer style="display:flex;position:fixed;bottom:0;left:0;right:0;height:48px;z-index:5">
    <ytm-pivot-bar-item-renderer id="inicio"><div class="pivot-bar-item-tab pivot-w2w" role="tab" aria-selected="false">Início</div></ytm-pivot-bar-item-renderer>
    <ytm-pivot-bar-item-renderer id="inscr"><div class="pivot-bar-item-tab pivot-subs" role="tab" aria-selected="false">Inscrições</div></ytm-pivot-bar-item-renderer>
    <ytm-pivot-bar-item-renderer id="voce"><div class="pivot-bar-item-tab pivot-library" role="tab" aria-selected="true">Você</div></ytm-pivot-bar-item-renderer>
  </ytm-pivot-bar-renderer>
</div></ytm-app>
<script>
  window.chips = 'fixo';
  var CHIP = 'left:0;right:0;height:40px;background:#333;z-index:3';
  function novaPagina(texto) {
    var velha = document.getElementById('pag');
    var nova = document.createElement('ytm-browse');
    nova.id = 'pag'; nova.style.cssText = velha.style.cssText;
    var antes = document.querySelector('.chips-fora'); if (antes) antes.remove();
    var html = '';
    if (texto === 'Início' && window.chips === 'fixo')
      html = '<div class="chips" style="position:fixed;top:48px;' + CHIP + '">Tudo Música</div><div style="height:40px"></div>';
    if (texto === 'Início' && window.chips === 'transicao')
      html = '<div class="chips" style="position:sticky;top:48px;transition:transform 0.25s;transform:translateY(-48px);' + CHIP + '">Tudo Música</div>';
    nova.innerHTML = html + '<div class="lista" style="height:760px">' + texto + '</div>';
    velha.replaceWith(nova);
    if (texto === 'Início' && window.chips === 'fora') {
      // fora do conteúdo: num irmão do ytm-browse, como uma barra do cabeçalho
      nova.insertAdjacentHTML('beforebegin', '<div class="chips chips-fora" style="' + CHIP + '">Tudo Música</div>');
    }
    document.querySelector('ytm-mobile-topbar-renderer').textContent = 'topo ' + texto;
    if (texto === 'Início' && window.chips === 'transicao') {
      // o YouTube mostra a barra no quadro seguinte, com a transição dele
      requestAnimationFrame(function () { nova.querySelector('.chips').style.transform = 'none'; });
    }
  }
  function irPara(item, caminho, texto) {
    document.querySelectorAll('[role=tab]').forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
    item.querySelector('[role=tab]').setAttribute('aria-selected', 'true');
    setTimeout(function () { history.pushState({}, '', caminho); }, 10);
    setTimeout(function () { novaPagina(texto); }, 120);
  }
  document.getElementById('inicio').addEventListener('click', function () { irPara(this, '/', 'Início'); });
  document.getElementById('inscr').addEventListener('click', function () { irPara(this, '/feed/subscriptions', 'Inscrições'); });
  document.getElementById('voce').addEventListener('click', function () { irPara(this, '/feed/you', 'Você'); });

  function opacidade(el) {
    var o = 1;
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  }
  // A cada quadro: topo da barra de cima, da lista e dos chips (ou null), opacidade de cada um, texto da
  // lista, espera ligada, posição do fundo da barra de abas.
  window.gravar = function (ms) {
    return new Promise(function (ok) {
      var t0 = performance.now(), linhas = [];
      (function q() {
        var topo = document.querySelector('ytm-mobile-topbar-renderer');
        var lista = document.querySelector('#pag .lista');
        var ch = document.querySelector('.chips');
        linhas.push({
          t: performance.now() - t0,
          topo: topo.getBoundingClientRect().top, opTopo: opacidade(topo),
          lista: lista.getBoundingClientRect().top, opLista: opacidade(lista), texto: lista.textContent,
          chips: ch ? ch.getBoundingClientRect().top : null, opChips: ch ? opacidade(ch) : null,
          espera: document.documentElement.classList.contains('ld-aba-espera'),
          fundo: document.querySelector('.pivot-fundo').getBoundingClientRect().top,
          barra: document.querySelector('ytm-pivot-bar-renderer').getBoundingClientRect().top,
        });
        if (performance.now() - t0 < ms) requestAnimationFrame(q); else ok(linhas);
      })();
    });
  };
</script></body></html>"""


def conferir(linhas, nome, erros):
    novas = [l for l in linhas if l['texto'] == 'Início']
    if not novas:
        erros.append(f'{nome}: a página nova não entrou')
        return
    fim = novas[-1]
    if fim['chips'] is None:
        erros.append(f'{nome}: chips não encontrados')
        return
    # deslocamento de cada parte em relação ao lugar final
    for l in novas:
        d_lista = l['lista'] - fim['lista']
        d_topo = l['topo'] - fim['topo']
        d_chips = l['chips'] - fim['chips'] if l['chips'] is not None else None
        if l['espera']:
            visiveis = [x for x in (l['opTopo'], l['opLista'], l['opChips']) if x is not None]
            if max(visiveis) > 0.05:
                erros.append(f'{nome}: parte da página nova visível durante a espera: ' + json.dumps(l))
                break
            continue
        if d_chips is None or abs(d_chips - d_lista) > 1.5 or abs(d_topo - d_lista) > 1.5:
            erros.append(f'{nome}: fora de sincronia aos {l["t"]:.0f} ms: conteúdo {d_lista:.1f} px, '
                         f'barra de cima {d_topo:.1f} px, chips {d_chips if d_chips is None else round(d_chips, 1)} px')
            break
        if l['opChips'] is not None and abs(l['opChips'] - l['opLista']) > 0.02:
            erros.append(f'{nome}: chips com opacidade diferente do conteúdo aos {l["t"]:.0f} ms')
            break
    maior = max(l['lista'] - fim['lista'] for l in novas if not l['espera'])
    if maior < 35:
        erros.append(f'{nome}: a página nova não subiu (maior deslocamento {maior:.1f} px)')
    for l in linhas:
        if abs(l['fundo'] - l['barra']) > 0.5:
            erros.append(f'{nome}: o fundo da barra de abas se mexeu: ' + json.dumps(l))
            break
    if abs(linhas[-1]['lista'] - fim['lista']) > 0.01:
        erros.append(f'{nome}: não terminou no lugar')
    if os.environ.get('MOSTRAR'):
        for l in linhas:
            print(nome, {k: (round(v, 1) if isinstance(v, float) else v) for k, v in l.items()})


def main():
    pasta = tempfile.mkdtemp(prefix='ld-aba-inicio-')
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
        for modo in ('fixo', 'fora', 'transicao'):
            pag.evaluate(f"window.chips = '{modo}'")
            pag.click('#inicio')
            conferir(pag.evaluate('gravar(800)'), f'chips {modo}', erros)
            pag.click('#voce')
            pag.evaluate('gravar(800)')
        nav.close()
    servidor.shutdown()
    shutil.rmtree(pasta, ignore_errors=True)
    if erros:
        print('FALHOU:\n- ' + '\n- '.join(erros))
        sys.exit(1)
    print('ok: na aba Início, chips, barra de cima e conteúdo sobem juntos')


if __name__ == '__main__':
    main()
