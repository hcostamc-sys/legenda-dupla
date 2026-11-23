"""Testes da interface (PLANO.md 12.2) com Playwright para Python e o player falso (?mock=1).

Uso (na raiz do projeto):
    pip install --break-system-packages playwright
    python3 -m playwright install chromium      # se não instalar, usa /usr/bin/google-chrome
    python3 tests/e2e_test.py

Sobe um servidor local próprio, roda tudo e salva as capturas em tests/capturas/.
"""
import functools
import http.server
import json
import os
import re
import shutil
import socketserver
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURAS = os.path.join(RAIZ, 'tests', 'capturas')
ID = 'arj7oStGLkU'


# ---------------------------------------------------------------- arquivos de teste

def ts(seg):
    ms = round(seg * 1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def criar_legendas(pasta):
    """Legenda feita por pessoa: 40 falas de 2 s com 0,2 s de intervalo, começando em 0,5 s."""
    en, pt = [], []
    for i in range(40):
        s = 0.5 + i * 2.2
        e = s + 2.0
        en.append(f'{i + 1}\n{ts(s)} --> {ts(e)}\nLine {i + 1} of the test, with words.\n')
        pt.append(f'{i + 1}\n{ts(s)} --> {ts(e)}\nLinha {i + 1} do teste, com ação.\n')
    caminho_en = os.path.join(pasta, '[English] Vídeo de teste [DownSub.com].srt')
    caminho_pt = os.path.join(pasta, '[Portuguese] Vídeo de teste [DownSub.com].srt')
    with open(caminho_en, 'w', encoding='utf-8') as f:
        f.write('\n'.join(en))
    with open(caminho_pt, 'w', encoding='utf-8') as f:
        f.write('\n'.join(pt))
    return caminho_en, caminho_pt


# ---------------------------------------------------------------- servidor

class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        # Como o GitHub Pages: o .wasm vai comprimido (gzip) e o Content-Length é o tamanho comprimido,
        # menor que o arquivo que o navegador entrega já descomprimido.
        if self.path.split('?')[0].endswith('.wasm') and 'gzip' in self.headers.get('Accept-Encoding', ''):
            import gzip
            caminho = self.translate_path(self.path.split('?')[0])
            try:
                with open(caminho, 'rb') as f:
                    corpo = gzip.compress(f.read(), 6)
            except OSError:
                return super().do_GET()
            self.send_response(200)
            self.send_header('Content-Type', 'application/wasm')
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return
        return super().do_GET()


def subir_servidor():
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(Silencioso, directory=RAIZ)
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


# ---------------------------------------------------------------- ajudantes

def esperar(cond, limite=8.0, passo=0.05, msg='condição'):
    fim = time.time() + limite
    while time.time() < fim:
        v = cond()
        if v:
            return v
        time.sleep(passo)
    raise AssertionError(f'Tempo esgotado esperando: {msg}')


def exibida(page):
    return page.evaluate('window.__ld.S.exibida')


def estado(page):
    return page.evaluate('window.__ld.estado()')


def tempo(page):
    return page.evaluate('window.__ld.tempo()')


def arrastar(page, seletor, dx):
    caixa = page.locator(seletor).bounding_box()
    x = caixa['x'] + caixa['width'] / 2
    y = caixa['y'] + caixa['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    for k in range(1, 7):
        page.mouse.move(x + dx * k / 6, y + 2 * k / 6)
        time.sleep(0.02)
    page.mouse.up()


def tocar_rapido(page, seletor):
    caixa = page.locator(seletor).bounding_box()
    x = caixa['x'] + caixa['width'] / 2
    y = caixa['y'] + caixa['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    time.sleep(0.05)
    page.mouse.up()


resultados = []


def caso(nome):
    def deco(fn):
        def rodar(*a, **k):
            t0 = time.time()
            fn(*a, **k)
            resultados.append(nome)
            print(f'ok - {nome} ({time.time() - t0:.1f} s)', flush=True)
        return rodar
    return deco


# ---------------------------------------------------------------- casos

@caso('1. Carregar link e os dois arquivos de uma vez; abrir o vídeo')
def t_abrir(page, url, en, pt):
    page.goto(url)
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    expect(page.locator('#btn-abrir')).to_be_disabled()
    page.fill('#campo-link', 'texto qualquer')
    expect(page.locator('#msg-link')).to_have_text('Não reconheci esse link do YouTube.')
    page.fill('#campo-link', f'Assista no YouTube: https://youtu.be/{ID}?si=abc')
    assert page.locator('#btn-trocar-papeis').count() == 0  # não existe mais botão Trocar
    page.set_input_files('#arq-estudo', [pt, en])  # português primeiro: o app deve trocar sozinho
    expect(page.locator('#info-estudo')).to_contain_text('[English]')
    expect(page.locator('#info-estudo')).to_contain_text('inglês · 40 falas lidas')
    expect(page.locator('#info-traducao')).to_contain_text('[Portuguese]')
    expect(page.locator('#info-traducao')).to_contain_text('português')
    # um arquivo por vez, nos botões "errados": o app reconhece o idioma e arruma sozinho
    page.set_input_files('#arq-estudo', [pt])
    page.set_input_files('#arq-traducao', [en])
    expect(page.locator('#info-estudo')).to_contain_text('[English]')
    expect(page.locator('#info-traducao')).to_contain_text('[Portuguese]')
    expect(page.locator('#btn-abrir')).to_be_enabled()
    page.click('#btn-abrir')
    expect(page.locator('#tela-assistir')).to_be_visible()
    assert page.evaluate('location.hash') == '#assistir'
    expect(page.locator('#titulo-video')).to_have_text('Vídeo de teste')
    expect(page.locator('#btn-tocar-grande')).to_be_visible()
    # antes do primeiro play a camada de gestos não captura toques
    assert page.evaluate("getComputedStyle(document.querySelector('#camada-gestos')).pointerEvents") == 'none'


@caso('2. Tocar; a fala 1 aparece com as duas linhas')
def t_tocar(page):
    page.click('#btn-tocar-grande')
    esperar(lambda: estado(page) == 1, msg='tocando')
    esperar(lambda: page.evaluate("getComputedStyle(document.querySelector('#camada-gestos')).pointerEvents") == 'auto',
            msg='camada de gestos ativa')
    expect(page.locator('#btn-tocar-grande')).to_be_hidden()
    expect(page.locator('#caixa-l1')).to_have_text('Line 1 of the test, with words.', timeout=4000)
    expect(page.locator('#caixa-l2')).to_have_text('Linha 1 do teste, com ação.')
    # só o botão de play/pausa e a barra do tempo; nada de lista lateral nem chips
    for sel in ['#painel-lista', '#btn-anterior', '#btn-proxima', '#btn-mais5', '#btn-pausa-auto', '#btn-velocidade']:
        assert page.locator(sel).count() == 0, sel
    expect(page.locator('#btn-play')).to_have_attribute('aria-label', 'Pausar')


@caso('3. Arrastar sobre o vídeo e sobre a caixa de legenda (esquerda avança, direita volta)')
def t_arrastar(page):
    i0 = exibida(page)
    arrastar(page, '#camada-gestos', -150)  # esquerda = avançar (como virar página)
    esperar(lambda: exibida(page) == i0 + 1, msg='avançou pelo vídeo')
    arrastar(page, '#camada-gestos', -150)
    esperar(lambda: exibida(page) == i0 + 2, msg='avançou de novo')
    arrastar(page, '#camada-gestos', 150)  # direita = voltar
    esperar(lambda: exibida(page) == i0 + 1, msg='voltou pelo vídeo')
    arrastar(page, '#caixa-legenda', -150)
    esperar(lambda: exibida(page) == i0 + 2, msg='avançou pela caixa')
    arrastar(page, '#caixa-legenda', 150)
    esperar(lambda: exibida(page) == i0 + 1, msg='voltou pela caixa')
    # três arrastos rápidos para a direita voltam exatamente três falas
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowRight')
    esperar(lambda: exibida(page) == i0 + 4, msg='três à frente')
    time.sleep(0.9)
    for _ in range(3):
        arrastar(page, '#camada-gestos', 150)
    esperar(lambda: exibida(page) == i0 + 1, msg='três para trás')
    # inverter direção do arraste: volta ao sentido antigo (esquerda volta)
    page.evaluate("window.__ld.S.ajustes.inverterArraste = true")
    time.sleep(0.9)
    arrastar(page, '#camada-gestos', -150)
    esperar(lambda: exibida(page) == i0, msg='invertido: esquerda volta')
    page.evaluate("window.__ld.S.ajustes.inverterArraste = false")


@caso('4. Toque curto pausa e toca; segurar o dedo no vídeo anda em 2× até soltar')
def t_toque(page):
    esperar(lambda: estado(page) == 1, msg='tocando antes do toque')
    tocar_rapido(page, '#camada-gestos')
    esperar(lambda: estado(page) == 2, msg='pausou com toque')
    tocar_rapido(page, '#camada-gestos')
    esperar(lambda: estado(page) == 1, msg='voltou a tocar com toque')
    time.sleep(1.0)
    vel = lambda: page.evaluate('window.__ld.S.player.velocidade()')
    vel0 = vel()
    salva = page.evaluate('window.__ld.S.ajustes.velocidade')
    caixa = page.locator('#camada-gestos').bounding_box()
    page.mouse.move(caixa['x'] + caixa['width'] / 2, caixa['y'] + caixa['height'] / 2)
    # tocando: segurar → 2× com o selo no topo do vídeo; soltar → volta à velocidade de antes
    page.mouse.down()
    expect(page.locator('#selo-rapido')).to_be_visible(timeout=2000)
    expect(page.locator('#selo-rapido')).to_contain_text('2×')
    esperar(lambda: vel() == 2, msg='2× segurando')
    assert estado(page) == 1
    page.mouse.up()
    expect(page.locator('#selo-rapido')).to_be_hidden(timeout=2000)
    esperar(lambda: vel() == vel0, msg='voltou à velocidade de antes')
    assert estado(page) == 1
    assert page.evaluate('window.__ld.S.ajustes.velocidade') == salva  # o 2× não é salvo
    assert page.locator('#retorno-gesto').inner_text().strip() != '↻ Repetindo'  # segurar não repete mais
    # pausado: anda em 2× enquanto segura e pausa de novo ao soltar
    tocar_rapido(page, '#camada-gestos')
    esperar(lambda: estado(page) == 2, msg='pausou')
    page.mouse.down()
    esperar(lambda: estado(page) == 1 and vel() == 2, msg='pausado + segurar: toca em 2×')
    page.mouse.up()
    esperar(lambda: estado(page) == 2, msg='soltou: pausado de novo')
    esperar(lambda: vel() == vel0, msg='velocidade de volta')
    page.click('#btn-play')
    esperar(lambda: estado(page) == 1, msg='tocando de novo')
    # repetir a fala continua na tecla R
    page.locator('#titulo-video').click()
    page.keyboard.press('r')
    expect(page.locator('#retorno-gesto')).to_have_text('↻ Repetindo')


@caso('5. Teclas Espaço, ←, →, R, [ e ]; botão play/pausa; velocidade no menu')
def t_teclas(page):
    page.locator('#titulo-video').click()  # tira o foco de campos
    page.keyboard.press('Space')
    esperar(lambda: estado(page) == 2, msg='Espaço pausa')
    expect(page.locator('#btn-play')).to_have_attribute('aria-label', 'Tocar')
    page.click('#btn-play')
    esperar(lambda: estado(page) == 1, msg='botão toca')
    page.click('#btn-play')
    esperar(lambda: estado(page) == 2, msg='botão pausa')
    page.keyboard.press('Space')
    esperar(lambda: estado(page) == 1, msg='Espaço toca')
    i = exibida(page)
    page.keyboard.press('ArrowRight')
    esperar(lambda: exibida(page) == i + 1, msg='→ avança')
    time.sleep(0.9)
    page.keyboard.press('ArrowLeft')
    esperar(lambda: exibida(page) == i, msg='← volta')
    time.sleep(0.9)
    page.keyboard.press('r')
    expect(page.locator('#retorno-gesto')).to_have_text('↻ Repetindo')
    page.keyboard.press(']')
    esperar(lambda: page.evaluate('window.__ld.S.velConfirmada') == 1.25, msg='] acelera')
    page.keyboard.press('[')
    esperar(lambda: page.evaluate('window.__ld.S.velConfirmada') == 1, msg='[ volta')
    # velocidade pelo painel de ajustes
    page.click('#btn-ajustes')
    expect(page.locator('#linha-velocidade .chip.confirmada')).to_have_text('1×')
    page.locator('#linha-velocidade .chip', has_text='1,5×').click()
    expect(page.locator('#linha-velocidade .chip.confirmada')).to_have_text('1,5×')
    page.locator('#linha-velocidade .chip', has_text='1×').first.click()
    expect(page.locator('#linha-velocidade .chip.confirmada')).to_have_text('1×')
    # menu enxuto: nada de pausa automática, loop, pré-rolagem, opacidade...
    for k in ['pausaAuto', 'loopVezes', 'preRolagem', 'opacidadeFundo', 'modoFrases', 'linha1']:
        assert page.locator(f'[data-ajuste="{k}"]').count() == 0, k
    # bloco Controles (versão 15): inverter, velocidade e sincronia juntos
    controles = page.locator('.grupo', has=page.locator('h3', has_text='Controles'))
    assert controles.locator('[data-ajuste="inverterArraste"]').count() == 1
    assert controles.locator('#linha-velocidade').count() == 1
    assert controles.locator('#grupo-sincronia').count() == 1
    expect(controles).to_contain_text('Inverter sentido de deslizamento para avançar e retroceder')
    expect(page.locator('[data-mostra="fonteL1"]')).to_have_text('19 px (padrão)')
    # tamanho das letras: pergunta antes de trocar; "Alterar" muda as duas linhas e salva
    page.locator('[data-ajuste="fonteL1"]').fill('24')
    expect(page.locator('#dialogo')).to_be_visible()
    expect(page.locator('#dialogo-texto')).to_contain_text('de 19\u00a0px para 24\u00a0px')
    page.click('#dialogo-ok')
    expect(page.locator('#dialogo')).to_be_hidden()
    assert page.evaluate("getComputedStyle(document.querySelector('#caixa-l1')).fontSize") == '24px'
    assert page.evaluate("getComputedStyle(document.querySelector('#caixa-l2')).fontSize") == '20px'
    assert page.evaluate("JSON.parse(localStorage.getItem('ld.ajustes')).fonteL1") == 24
    expect(page.locator('[data-mostra="fonteL1"]')).to_have_text('24 px (padrão: 19 px)')
    # "Cancelar" volta ao tamanho de antes
    page.locator('[data-ajuste="fonteL1"]').fill('30')
    expect(page.locator('#dialogo')).to_be_visible()
    page.click('#dialogo-cancelar')
    assert page.evaluate("getComputedStyle(document.querySelector('#caixa-l1')).fontSize") == '24px'
    assert page.locator('[data-ajuste="fonteL1"]').input_value() == '24'
    assert page.evaluate("JSON.parse(localStorage.getItem('ld.ajustes')).fonteL1") == 24
    # Restaurar ajustes padrão: pergunta; "Cancelar" não muda nada; "Restaurar" volta tudo ao padrão
    page.locator('[data-ajuste="inverterArraste"]').check()
    page.click('#btn-restaurar-padrao')
    expect(page.locator('#dialogo')).to_be_visible()
    page.click('#dialogo-cancelar')
    assert page.evaluate('window.__ld.S.ajustes.inverterArraste') is True
    page.click('#btn-restaurar-padrao')
    page.click('#dialogo-ok')
    expect(page.locator('#dialogo')).to_be_hidden()
    esperar(lambda: page.evaluate('window.__ld.S.ajustes.fonteL1') == 19, msg='letras no padrão')
    assert page.evaluate('window.__ld.S.ajustes.inverterArraste') is False
    assert page.locator('[data-ajuste="inverterArraste"]').is_checked() is False
    assert page.evaluate("getComputedStyle(document.querySelector('#caixa-l1')).fontSize") == '19px'
    expect(page.locator('[data-mostra="fonteL1"]')).to_have_text('19 px (padrão)')
    page.click('#btn-fechar-ajustes')


@caso('5b. Folga antes da fala (v20): destino no silêncio; pausado, avançar devagar não repete a fala; ajuste no menu')
def t_folga(page):
    page.locator('#titulo-video').click()  # tira o foco de campos
    if estado(page) != 2:
        page.keyboard.press('Space')
        esperar(lambda: estado(page) == 2, msg='pausa')
    U = page.evaluate('window.__ld.S.unidades.map((u) => [u.s, u.e])')
    i = exibida(page)
    # pausado, com mais de 0,8 s entre um toque e outro: cada → vai para a fala seguinte
    for k in (1, 2, 3):
        page.keyboard.press('ArrowRight')
        esperar(lambda: exibida(page) == i + k, msg=f'→ nº {k} avança uma fala')
        s, _ = U[i + k]
        e_ant = U[i + k - 1][1]
        # falas de teste: 0,2 s de silêncio → folga = mínima (0,12 s), depois do fim da fala anterior
        esperar(lambda: abs(tempo(page) - (s - 0.12)) < 0.02, msg=f'destino {s - 0.12:.2f} s')
        assert tempo(page) > e_ant, 'destino dentro da fala anterior'
        assert estado(page) == 2, 'continua pausado'
        time.sleep(0.9)
    page.keyboard.press('ArrowLeft')
    esperar(lambda: exibida(page) == i + 2, msg='← volta uma fala')
    # ajuste: folga máxima 0,45 s (padrão); escolher 0,8 s salva
    page.click('#btn-ajustes')
    controles = page.locator('.grupo', has=page.locator('h3', has_text='Controles'))
    assert controles.locator('#linha-folga').count() == 1
    expect(page.locator('#linha-folga .chip')).to_have_text(['0,3 s', '0,45 s', '0,6 s', '0,8 s'])
    expect(page.locator('#linha-folga .chip.confirmada')).to_have_text('0,45 s')
    page.locator('#linha-folga .chip', has_text='0,8 s').click()
    expect(page.locator('#linha-folga .chip.confirmada')).to_have_text('0,8 s')
    assert page.evaluate("JSON.parse(localStorage.getItem('ld.ajustes')).folgaFala") == 0.8
    page.locator('#linha-folga .chip', has_text='0,45 s').click()
    expect(page.locator('#linha-folga .chip.confirmada')).to_have_text('0,45 s')
    page.click('#btn-fechar-ajustes')


@caso('6. Cartão da palavra')
def t_extras(page):
    def significado(route):
        route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                      body=json.dumps({'sentences': [{'trans': 'linha (teste)', 'orig': 'Line'}],
                                       'dict': [{'pos': 'substantivo', 'terms': ['linha', 'fila']}], 'src': 'en'}))
    page.route('https://translate.googleapis.com/translate_a/single**', significado)
    page.locator('#titulo-video').click()
    if estado(page) == 1:
        page.keyboard.press('Space')
    esperar(lambda: estado(page) == 2, msg='pausado')
    page.locator('#caixa-l1 .palavra').nth(1).click()
    expect(page.locator('#cartao-palavra')).to_be_visible()
    expect(page.locator('#cp-palavra')).to_have_text(page.locator('#caixa-l1 .palavra').nth(1).inner_text().strip(',.'))
    # significado dentro do app (tradutor simulado) e botões copiar, copiar frase e dicionário
    expect(page.locator('#cp-significado .cp-principal')).to_have_text('linha (teste)')
    expect(page.locator('#cp-significado .cp-classe')).to_have_text('substantivo')
    assert page.locator('#cartao-palavra a, #cartao-palavra button').count() == 4  # fechar + 3 botões
    expect(page.locator('#cp-copiar-palavra')).to_be_visible()
    expect(page.locator('#cp-copiar-frase')).to_be_visible()
    href = page.get_attribute('#cp-dicionario', 'href')
    assert href.startswith('https://dictionary.cambridge.org/search/direct/?datasetsearch=english-portuguese&q=') or 'wiktionary.org' in href, href
    page.screenshot(path=os.path.join(CAPTURAS, 'cartao-palavra.png'))
    page.click('#cp-fechar')
    expect(page.locator('#cartao-palavra')).to_be_hidden()
    page.unroute('https://translate.googleapis.com/translate_a/single**')
    # os atalhos continuam valendo depois de mexer na barra de progresso
    page.locator('#barra-progresso').click()
    st = estado(page)
    page.keyboard.press('Space')
    esperar(lambda: estado(page) != st, msg='Espaço depois da barra')
    if estado(page) != 1:
        page.keyboard.press('Space')
    page.evaluate('window.__ld.S.player.irPara(5)')
    time.sleep(0.3)


@caso('6b. Loop da fala, trecho A–B e menu da tradução (tamanho automático)')
def t_repeticao(page):
    page.locator('#titulo-video').click()
    if estado(page) != 1:
        page.click('#btn-play')
    esperar(lambda: estado(page) == 1, msg='tocando')
    # botões: loop, A–B, tradução e modo lista à esquerda; play na ponta direita; nada além disso
    assert page.locator('.controles button').count() == 5
    xs = page.evaluate("""() => [...document.querySelectorAll('.controles button')].map(b => b.getBoundingClientRect().right)""")
    play_dir = page.evaluate("document.querySelector('#btn-play').getBoundingClientRect().right")
    assert play_dir == max(xs), (play_dir, xs)
    larg = page.evaluate('window.innerWidth')
    assert play_dir > larg - 40, (play_dir, larg)  # encostado na direita (polegar direito)
    page.evaluate('window.__ld.S.player.irPara(9.3)')  # fala 5 (8,9 a 10,9)
    esperar(lambda: exibida(page) == 4, msg='fala 5')
    page.click('#btn-loop')
    expect(page.locator('#btn-loop')).to_have_attribute('aria-pressed', 'true')
    voltas, ultimo, fim_t = 0, tempo(page), time.time() + 6
    while time.time() < fim_t and voltas < 2:
        t = tempo(page)
        if t < ultimo - 0.5:
            voltas += 1
        ultimo = t
        time.sleep(0.03)
    assert voltas == 2, voltas
    assert exibida(page) == 4, exibida(page)
    page.click('#btn-loop')
    expect(page.locator('#btn-loop')).to_have_attribute('aria-pressed', 'false')
    esperar(lambda: exibida(page) == 5, limite=4, msg='seguiu sem loop')
    # A–B: o botão abre a lista das falas na tela inteira, centrada na fala atual, e pausa
    esperar(lambda: exibida(page) == 5, limite=4, msg='chegou na fala 6')
    page.click('#btn-ab')
    expect(page.locator('#tela-ab')).to_be_visible()
    esperar(lambda: estado(page) == 2, msg='pausou para escolher')
    expect(page.locator('#ab-titulo')).to_have_text('Escolha o início (A)')
    assert page.locator('#ab-lista .ab-fala').count() == 40
    expect(page.locator('#ab-lista .ab-fala.agora')).to_have_attribute('data-i', '5')
    expect(page.locator('#ab-lista .ab-fala.agora .ab-l2')).to_have_text('Linha 6 do teste, com ação.')
    # a lista ocupa a tela inteira e rola
    alt = page.evaluate("document.querySelector('#tela-ab').getBoundingClientRect().height")
    assert alt >= page.evaluate('window.innerHeight') - 1, alt
    assert page.evaluate("document.querySelector('#ab-lista').scrollHeight > document.querySelector('#ab-lista').clientHeight")
    # ✕ cancela e volta a tocar
    page.click('#ab-cancelar')
    expect(page.locator('#tela-ab')).to_be_hidden()
    esperar(lambda: estado(page) == 1, msg='voltou a tocar ao cancelar')
    assert page.evaluate('[window.__ld.S.ab.a, window.__ld.S.ab.b]') == [None, None]
    # o voltar do celular também fecha a tela, sem sair do vídeo
    page.click('#btn-ab')
    expect(page.locator('#tela-ab')).to_be_visible()
    page.go_back()
    expect(page.locator('#tela-ab')).to_be_hidden()
    expect(page.locator('#tela-assistir')).to_be_visible()
    # escolhe A (fala 6), refaz, escolhe A de novo e B (fala 7): volta ao vídeo e repete
    page.click('#btn-ab')
    page.locator('#ab-lista .ab-fala[data-i="5"]').click()
    expect(page.locator('#ab-titulo')).to_have_text('Agora o fim (B)')
    expect(page.locator('#ab-lista .ab-fala[data-i="5"]')).to_have_class(re.compile(r'marca-a'))
    page.click('#ab-refazer')
    expect(page.locator('#ab-titulo')).to_have_text('Escolha o início (A)')
    page.locator('#ab-lista .ab-fala[data-i="5"]').click()
    page.locator('#ab-lista .ab-fala[data-i="6"]').click()
    expect(page.locator('#tela-ab')).to_be_hidden()
    expect(page.locator('#tela-assistir')).to_be_visible()
    expect(page.locator('#btn-ab')).to_have_attribute('aria-pressed', 'true')
    esperar(lambda: estado(page) == 1, msg='tocando o trecho')
    # trecho repetindo: estilo próprio (borda cheia âmbar) e selo com o trecho
    expect(page.locator('#caixa-legenda')).to_have_class(re.compile(r'\bloop-ab\b'))
    expect(page.locator('#dica-ab')).to_be_visible()
    expect(page.locator('#dica-ab')).to_contain_text('Repetindo A–B')
    assert page.evaluate("getComputedStyle(document.querySelector('#caixa-legenda')).borderTopStyle") == 'solid'
    assert page.evaluate('[window.__ld.S.ab.a, window.__ld.S.ab.b]') == [5, 6]
    inicio_a = page.evaluate('window.__ld.S.unidades[5].s')
    voltou, ultimo, fim_t = False, tempo(page), time.time() + 6
    while time.time() < fim_t:
        t = tempo(page)
        if t < ultimo - 0.5:
            voltou = True
            assert abs(t - inicio_a) < 0.5, (t, inicio_a)
            break
        ultimo = t
        time.sleep(0.03)
    assert voltou, 'o trecho A–B não repetiu'
    page.click('#btn-ab')
    expect(page.locator('#btn-ab')).to_have_attribute('aria-pressed', 'false')
    expect(page.locator('#caixa-legenda')).not_to_have_class(re.compile(r'loop-ab'))
    expect(page.locator('#dica-ab')).to_be_hidden()
    # menu da tradução
    l1_com = page.evaluate("parseFloat(getComputedStyle(document.querySelector('#caixa-l1')).fontSize)")
    page.click('#btn-traducao')
    expect(page.locator('#menu-traducao')).to_be_visible()
    expect(page.locator('#menu-traducao [data-modo="sempre"]')).to_have_attribute('aria-checked', 'true')
    page.click('#menu-traducao [data-modo="desligada"]')
    expect(page.locator('#menu-traducao')).to_be_hidden()
    expect(page.locator('#caixa-l2')).to_be_hidden()
    l1_so = page.evaluate("parseFloat(getComputedStyle(document.querySelector('#caixa-l1')).fontSize)")
    assert l1_so > l1_com, (l1_so, l1_com)  # só a original: letra maior
    page.click('#btn-traducao')
    page.click('#menu-traducao [data-modo="pausado"]')
    esperar(lambda: estado(page) == 1, msg='tocando')
    expect(page.locator('#caixa-l2')).to_be_hidden()
    page.click('#btn-play')
    esperar(lambda: estado(page) == 2, msg='pausado')
    expect(page.locator('#caixa-l2')).to_be_visible()
    assert page.evaluate("parseFloat(getComputedStyle(document.querySelector('#caixa-l1')).fontSize)") == l1_com
    page.click('#btn-play')
    expect(page.locator('#caixa-l2')).to_be_hidden()
    page.keyboard.press('t')  # pausado -> desativada
    page.keyboard.press('t')  # desativada -> sempre
    expect(page.locator('#caixa-l2')).to_be_visible()
    assert page.evaluate('window.__ld.S.ajustes.modoTraducao') == 'sempre'


@caso('6c. Modo lista: anterior, atual e próxima; tamanhos com a tradução; toque na vizinha')
def t_lista(page):
    page.locator('#titulo-video').click()
    # padrão de quem acabou de instalar: falas em lista; a tecla V volta para uma fala por vez
    expect(page.locator('#btn-modo-legenda')).to_have_attribute('aria-pressed', 'true')
    page.keyboard.press('v')
    expect(page.locator('#btn-modo-legenda')).to_have_attribute('aria-pressed', 'false')
    expect(page.locator('#fala-ant')).to_be_hidden()
    expect(page.locator('#fala-prox')).to_be_hidden()
    page.click('#btn-modo-legenda')
    expect(page.locator('#btn-modo-legenda')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('#caixa-legenda')).to_have_class(re.compile(r'\bmodo-lista\b'))
    if estado(page) == 1:
        page.click('#btn-play')
    esperar(lambda: estado(page) == 2, msg='pausado')
    page.evaluate('window.__ld.S.player.irPara(11.2)')  # fala 6 (11,5 a 13,5) logo depois
    page.evaluate('window.__ld.S.player.irPara(12)')
    esperar(lambda: exibida(page) == 5, msg='fala 6')
    expect(page.locator('#caixa-l1')).to_have_text('Line 6 of the test, with words.')
    expect(page.locator('#fala-ant .l1')).to_have_text('Line 5 of the test, with words.')
    expect(page.locator('#fala-prox .l1')).to_have_text('Line 7 of the test, with words.')
    expect(page.locator('#fala-ant .l2')).to_have_text('Linha 5 do teste, com ação.')
    op = lambda sel: float(page.evaluate(f"getComputedStyle(document.querySelector('{sel}')).opacity"))
    assert op('#fala-ant') < 0.6 and op('#fala-prox') < 0.6 and op('#fala-atual') == 1
    tam = lambda sel: page.evaluate(f"parseFloat(getComputedStyle(document.querySelector('{sel}')).fontSize)")
    assert tam('#fala-ant .l1') < tam('#caixa-l1')
    # a fala atual fica no meio da caixa
    meio = page.evaluate('''() => {
      const c = document.querySelector('#caixa-legenda').getBoundingClientRect();
      const a = document.querySelector('#fala-atual').getBoundingClientRect();
      return [c.top + c.height / 2, a.top + a.height / 2];
    }''')
    assert abs(meio[0] - meio[1]) < 30, meio
    # tradução desativada: as três falas crescem juntas
    l1_ant, l1_at = tam('#fala-ant .l1'), tam('#caixa-l1')
    page.click('#btn-traducao')
    page.click('#menu-traducao [data-modo="desligada"]')
    expect(page.locator('#fala-ant .l2')).to_be_hidden()
    assert tam('#fala-ant .l1') > l1_ant and tam('#caixa-l1') > l1_at
    # só quando pausar: pausado mostra a tradução nas três e volta ao tamanho normal
    page.click('#btn-traducao')
    page.click('#menu-traducao [data-modo="pausado"]')
    expect(page.locator('#fala-ant .l2')).to_be_visible()
    assert tam('#caixa-l1') == l1_at and tam('#fala-ant .l1') == l1_ant
    page.click('#btn-play')
    esperar(lambda: estado(page) == 1, msg='tocando')
    expect(page.locator('#fala-prox .l2')).to_be_hidden()
    assert tam('#caixa-l1') > l1_at
    page.click('#btn-play')
    esperar(lambda: estado(page) == 2, msg='pausado')
    page.click('#btn-traducao')
    page.click('#menu-traducao [data-modo="sempre"]')
    # toque na próxima fala: vai até ela
    i = exibida(page)
    tocar_rapido(page, '#fala-prox')
    esperar(lambda: exibida(page) == i + 1, msg='foi para a próxima')
    time.sleep(0.6)
    assert estado(page) == 2, 'tocar na vizinha com o vídeo pausado fez tocar'
    # A–B no modo lista: a vizinha fora do trecho fica mais apagada
    page.evaluate('window.__ld.S.ab = { a: window.__ld.S.exibida, b: window.__ld.S.exibida + 1 }')
    expect(page.locator('#fala-ant')).to_have_class(re.compile(r'fora-ab'))
    expect(page.locator('#fala-prox')).not_to_have_class(re.compile(r'fora-ab'))
    page.evaluate('window.__ld.S.ab = { a: null, b: null }')
    # tecla V volta para uma fala por vez
    page.keyboard.press('v')
    expect(page.locator('#btn-modo-legenda')).to_have_attribute('aria-pressed', 'false')
    expect(page.locator('#fala-ant')).to_be_hidden()
    expect(page.locator('#fala-prox')).to_be_hidden()


@caso('6d. A–B: B na mesma fala do A ou antes dele mostra aviso; selo "agora" alinhado; botões embaixo da legenda')
def t_ab_invalido(page):
    page.locator('#titulo-video').click()
    # botões embaixo da caixa da legenda; a barra do tempo continua logo abaixo do vídeo
    r = lambda sel: page.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.top, r.bottom]; }})()")
    video, tempo_b, caixa, botoes = r('#area-video'), r('#faixa'), r('#caixa-legenda'), r('#barra-botoes')
    assert video[1] <= tempo_b[0] + 1 and tempo_b[1] <= caixa[0] + 1 and caixa[1] < botoes[0], (video, tempo_b, caixa, botoes)
    assert botoes[1] <= page.evaluate('window.innerHeight') + 1, botoes
    if estado(page) == 1:
        page.click('#btn-play')
    esperar(lambda: estado(page) == 2, msg='pausado')
    page.evaluate('window.__ld.S.player.irPara(12)')
    esperar(lambda: exibida(page) == 5, msg='fala 6')
    page.click('#btn-ab')
    expect(page.locator('#tela-ab')).to_be_visible()
    # selo "agora" centralizado embaixo do tempo
    geo = page.evaluate("""() => {
      const b = document.querySelector('#ab-lista .ab-fala.agora');
      const t = b.querySelector('.ab-tempo').getBoundingClientRect();
      const s = b.querySelector('.ab-selo').getBoundingClientRect();
      const tx = document.createRange(); tx.selectNodeContents(b.querySelector('.ab-tempo').firstChild);
      const r = tx.getBoundingClientRect();
      return { tempo: r.left + r.width / 2, selo: s.left + s.width / 2, coluna: t.left + t.width / 2, larg: s.width };
    }""")
    assert abs(geo['tempo'] - geo['selo']) < 1.5 and abs(geo['coluna'] - geo['selo']) < 1.5, geo
    page.screenshot(path=os.path.join(CAPTURAS, 'ab-selo-agora.png'))
    page.locator('#ab-lista .ab-fala[data-i="5"]').click()  # A
    expect(page.locator('#ab-titulo')).to_have_text('Agora o fim (B)')
    expect(page.locator('#ab-lista .ab-fala[data-i="3"]')).to_have_class(re.compile(r'antes-a'))
    expect(page.locator('#ab-lista .ab-fala[data-i="7"]')).not_to_have_class(re.compile(r'antes-a'))
    # B na mesma fala: aviso, continua escolhendo o B
    page.locator('#ab-lista .ab-fala[data-i="5"]').click()
    expect(page.locator('#ab-aviso')).to_be_visible()
    expect(page.locator('#ab-aviso-titulo')).to_have_text('O trecho precisa de 2 falas ou mais')
    expect(page.locator('#ab-lista .ab-fala[data-i="5"]')).to_have_class(re.compile(r'recusada'))
    assert page.evaluate('[window.__ld.S.ab.a, window.__ld.S.ab.b, window.__ld.S.marcandoAB]') == [5, None, 'b']
    expect(page.locator('#tela-ab')).to_be_visible()
    time.sleep(0.35)
    page.screenshot(path=os.path.join(CAPTURAS, 'ab-aviso-mesma-fala.png'))
    # B antes do A: outro aviso
    page.locator('#ab-lista .ab-fala[data-i="3"]').click()
    expect(page.locator('#ab-aviso-titulo')).to_have_text('O B tem que vir depois do A')
    expect(page.locator('#ab-aviso-texto')).to_contain_text('Refazer A')
    assert page.evaluate('[window.__ld.S.ab.a, window.__ld.S.ab.b]') == [5, None]
    time.sleep(0.35)
    page.screenshot(path=os.path.join(CAPTURAS, 'ab-aviso-antes-do-a.png'))
    # o aviso some sozinho
    expect(page.locator('#ab-aviso')).to_be_hidden(timeout=6000)
    # B válido: trecho de 3 falas
    page.locator('#ab-lista .ab-fala[data-i="7"]').click()
    expect(page.locator('#tela-ab')).to_be_hidden()
    assert page.evaluate('[window.__ld.S.ab.a, window.__ld.S.ab.b]') == [5, 7]
    expect(page.locator('#dica-ab')).to_contain_text('3 falas')
    page.click('#btn-ab')
    expect(page.locator('#btn-ab')).to_have_attribute('aria-pressed', 'false')
    if estado(page) == 1:
        page.click('#btn-play')


@caso('12d. App novo: vídeo ao vivo e Shorts não abrem (aviso com volta ao YouTube); padrões novos')
def t_ao_vivo_shorts(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    msgs = lambda: page.evaluate('window.__msgs')
    os.makedirs(CAPTURAS, exist_ok=True)
    # padrões de quem acabou de instalar: falas em lista e tradução "mostrar sempre"
    page.goto(base + '?mock=1&app=android&apk=6')
    page.evaluate('localStorage.clear()')
    page.reload()
    page.wait_for_function('!!window.__ld')
    assert page.evaluate('[window.__ld.S.ajustes.modoLegenda, window.__ld.S.ajustes.modoTraducao]') == ['lista', 'sempre']
    # sem link para a página de teste nos ajustes
    assert page.locator('#painel-ajustes a[href*="prototipo"]').count() == 0

    # ao vivo, visto pelo player (getVideoData().isLive)
    page.goto(base + '?mock=1&app=android&apk=6&mockAoVivo=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=KKKKKKKKKKK')")
    expect(page.locator('#tela-bloqueio')).to_be_visible(timeout=6000)
    expect(page.locator('#bloqueio-titulo')).to_have_text('Vídeos ao vivo não são suportados')
    expect(page.locator('#bloqueio-selo .selo-vivo')).to_be_visible()
    expect(page.locator('#bloqueio-voltar')).to_have_text('Voltar ao YouTube')
    expect(page.locator('#tela-carregando')).to_be_hidden()
    expect(page.locator('#tela-idioma')).to_be_hidden()
    esperar(lambda: estado(page) != 1, msg='vídeo parado')
    time.sleep(0.4)
    page.screenshot(path=os.path.join(CAPTURAS, 'app-novo-ao-vivo.png'))
    n = len(msgs())
    page.click('#bloqueio-voltar')
    expect(page.locator('#tela-bloqueio')).to_be_hidden()
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    esperar(lambda: {'acao': 'youtube', 'url': ''} in msgs()[n:], limite=3, msg='voltou ao YouTube')
    expect(page.locator('.item-bib')).to_have_count(0)  # não entra em "Meus vídeos"

    # ao vivo, visto pelo gancho (resposta do YouTube) com a escolha do idioma aberta
    page.goto(base + '?mock=1&app=android&apk=6')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=LLLLLLLLLLL')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    page.evaluate("""window.postMessage({ ldFaixas: true, versao: 3, video: 'LLLLLLLLLLL', faixas: [], fontes: ['resposta'],
      status: 'OK', temResposta: true, semCaptions: false, aoVivo: true, agendado: false }, '*')""")
    expect(page.locator('#tela-bloqueio')).to_be_visible(timeout=3000)
    expect(page.locator('#tela-idioma')).to_be_hidden()
    n = len(msgs())
    assert page.evaluate('window.ldVoltar()') == 'ok'  # o voltar do celular faz o mesmo que o botão
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    esperar(lambda: {'acao': 'youtube', 'url': ''} in msgs()[n:], limite=3, msg='voltou ao YouTube')

    # Shorts tocado no YouTube do app (ou pelo histórico)
    n = len(msgs())
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/shorts/abcdefghijk')")
    expect(page.locator('#tela-bloqueio')).to_be_visible()
    expect(page.locator('#bloqueio-titulo')).to_have_text('Vídeos Shorts não são suportados')
    expect(page.locator('#bloqueio-selo .selo-shorts')).to_be_visible()
    expect(page.locator('#bloqueio-selo .selo-vivo')).to_be_hidden()
    expect(page.locator('#tela-assistir')).to_be_hidden()
    time.sleep(0.4)
    page.screenshot(path=os.path.join(CAPTURAS, 'app-novo-shorts.png'))
    page.click('#bloqueio-voltar')
    expect(page.locator('#tela-bloqueio')).to_be_hidden()
    assert {'acao': 'youtube', 'url': ''} in msgs()[n:], msgs()[n:]
    # Shorts pelo Compartilhar do app do YouTube
    page.goto(base + '?mock=1&app=android&apk=6&text=' + 'https%3A%2F%2Fyoutube.com%2Fshorts%2Fabcdefghijk%3Fsi%3Dx')
    expect(page.locator('#tela-bloqueio')).to_be_visible(timeout=4000)
    expect(page.locator('#tela-assistir')).to_be_hidden()
    assert not erros, erros
    ctx.close()


@caso('15. YouTube do app: o botão e as prateleiras de Shorts somem')
def t_youtube_sem_shorts(browser, base):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'app', 'src', 'main', 'assets', 'youtube.js')
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script(path=script)
    page = ctx.new_page()
    page.goto(base + 'tests/fixtures/nao_legenda.txt')
    page.evaluate("""() => {
      document.body.innerHTML = `
        <ytm-reel-shelf-renderer id="prateleira">Shorts</ytm-reel-shelf-renderer>
        <ytm-video-with-context-renderer id="video">Vídeo normal</ytm-video-with-context-renderer>
        <ytm-pivot-bar-renderer>
          <ytm-pivot-bar-item-renderer id="p-inicio"><div class="pivot-bar-item-tab pivot-w2w">Início</div></ytm-pivot-bar-item-renderer>
          <ytm-pivot-bar-item-renderer id="p-shorts"><div class="pivot-bar-item-tab pivot-shorts">Shorts</div></ytm-pivot-bar-item-renderer>
          <ytm-pivot-bar-item-renderer id="p-voce"><div class="pivot-bar-item-tab pivot-library">Você</div></ytm-pivot-bar-item-renderer>
        </ytm-pivot-bar-renderer>`;
    }""")
    expect(page.locator('#p-shorts')).to_be_hidden()
    expect(page.locator('#prateleira')).to_be_hidden()
    expect(page.locator('#p-inicio')).to_be_visible()
    expect(page.locator('#p-voce')).to_be_visible()
    expect(page.locator('#video')).to_be_visible()
    # 23/11: Shorts soltos no resumo "Histórico" da aba Você somem (o "Ver tudo" não mostra Shorts, e as duas
    # listas não batiam). Cartão de nome conhecido e de nome desconhecido; o resto da prateleira fica.
    page.evaluate("""() => {
      document.body.insertAdjacentHTML('beforeend', `
        <ytm-shelf-renderer id="resumo">
          <h2>Histórico</h2><a id="ver-tudo" href="/feed/history">Ver tudo</a>
          <ytm-media-item id="h-video"><a href="/watch?v=aaaaaaaaaaa">Vídeo normal</a><button>⋮</button></ytm-media-item>
          <ytm-shorts-lockup-view-model id="h-short1"><a href="/shorts/bbbbbbbbbbb">Short</a></ytm-shorts-lockup-view-model>
          <div class="cartao-novo" id="h-short2"><div class="mini"><a href="/shorts/ccccccccccc?feature=x">capa</a></div>
            <div class="info"><a href="/shorts/ccccccccccc">Título do Short</a><span>Canal</span></div></div>
          <div class="cartao-novo" id="h-video2"><a href="/watch?v=ddddddddddd">Outro vídeo</a></div>
        </ytm-shelf-renderer>`);
    }""")
    expect(page.locator('#h-short1')).to_be_hidden()
    expect(page.locator('#h-short2')).to_be_hidden()
    expect(page.locator('#h-video')).to_be_visible()
    expect(page.locator('#h-video2')).to_be_visible()
    expect(page.locator('#ver-tudo')).to_be_visible()
    # o YouTube reaproveita o elemento: deixou de ser Shorts, volta a aparecer
    page.evaluate("document.querySelector('#h-short1 a').setAttribute('href', '/watch?v=eeeeeeeeeee')")
    expect(page.locator('#h-short1')).to_be_visible(timeout=3000)
    ctx.close()


@caso('8. Recarregar: vídeo na biblioteca, posição e ajustes mantidos')
def t_recarregar(page, url):
    page.locator('#titulo-video').click()
    page.keyboard.press(']')  # 1,25× para conferir que fica salvo
    esperar(lambda: page.evaluate('window.__ld.S.velConfirmada') == 1.25, msg='1,25×')
    page.keyboard.press('Space') if estado(page) == 1 else None
    esperar(lambda: estado(page) == 2, msg='pausado para salvar')
    pos = tempo(page)
    time.sleep(0.4)
    page.reload()
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    item = page.locator('.item-bib')
    expect(item).to_have_count(1)
    expect(item.locator('.titulo')).to_have_text('Vídeo de teste')
    expect(item.locator('.detalhe')).to_contain_text('parou em')
    item.locator('.abrir-item').click()
    expect(page.locator('#tela-assistir')).to_be_visible()
    esperar(lambda: page.evaluate('window.__ld.S.pronto'), msg='pronto')
    t = tempo(page)
    assert abs(t - max(0, pos - 2)) < 0.6, (t, pos)
    esperar(lambda: page.evaluate('window.__ld.S.velConfirmada') == 1.25, msg='velocidade salva')
    # botão voltar do navegador volta para a biblioteca
    page.go_back()
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    item.locator('.abrir-item').click()
    expect(page.locator('#tela-assistir')).to_be_visible()
    page.click('#btn-voltar')
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    page.evaluate("localStorage.setItem('ld.ajustes', JSON.stringify({...JSON.parse(localStorage.getItem('ld.ajustes')), velocidade: 1}))")


@caso('9. Exportar e importar a biblioteca')
def t_backup(page, url, pasta):
    page.reload()
    with page.expect_download() as info:
        page.click('#btn-exportar')
    down = info.value
    assert down.suggested_filename.startswith('legenda-dupla-backup-') and down.suggested_filename.endswith('.json')
    caminho = os.path.join(pasta, down.suggested_filename)
    down.save_as(caminho)
    with open(caminho, encoding='utf-8') as f:
        dados = json.load(f)
    assert dados['versao'] == 1 and len(dados['videos']) == 1 and dados['videos'][0]['id'] == ID
    assert dados['videos'][0]['traducao']['falas'][0]['t'] == 'Linha 1 do teste, com ação.'
    # apagar (confirmação na própria página)
    page.click('.item-bib .menu-item .btn-topo')
    page.click('.menu-item-opcoes button:has-text("Apagar")')
    expect(page.locator('#dialogo')).to_be_visible()
    page.click('#dialogo-ok')
    expect(page.locator('.item-bib')).to_have_count(0)
    # importar
    page.click('#btn-importar')
    page.check('#dialogo-extra input[type="checkbox"]')
    with page.expect_file_chooser() as fc:
        page.click('#dialogo-ok')
    fc.value.set_files(caminho)
    expect(page.locator('#toast')).to_contain_text('Importados 1 vídeo, 0 já existiam.')
    expect(page.locator('.item-bib')).to_have_count(1)
    # importar de novo: já existia
    page.click('#btn-importar')
    with page.expect_file_chooser() as fc:
        page.click('#dialogo-ok')
    fc.value.set_files(caminho)
    expect(page.locator('#toast')).to_contain_text('Importados 0 vídeos, 1 já existia.')
    # renomear
    page.click('.item-bib .menu-item .btn-topo')
    page.click('.menu-item-opcoes button:has-text("Renomear")')
    page.fill('#dialogo-extra input[type="text"]', 'Aula de motores')
    page.click('#dialogo-ok')
    expect(page.locator('.item-bib .titulo')).to_have_text('Aula de motores')


@caso('9b. Compartilhar do app do YouTube e erro 150')
def t_compartilhar(page, base):
    page.goto(base + f'?mock=1&title=V%C3%ADdeo&text=Assista%20https%3A%2F%2Fyoutu.be%2F{ID}%3Ft%3D1m30s')
    expect(page.locator('#campo-link')).to_have_value(f'https://www.youtube.com/watch?v={ID}&t=90s')
    expect(page.locator('#msg-link')).to_have_text('Link recebido. Agora escolha os arquivos de legenda.')
    assert 'text=' not in page.url
    page.goto(base + '?mock=1&mockErro=150#biblioteca')
    page.locator('.item-bib .abrir-item').click()
    expect(page.locator('#erro-player')).to_be_visible()
    expect(page.locator('#erro-texto')).to_have_text('O dono do vídeo não permite tocar fora do YouTube.')
    expect(page.locator('#erro-abrir-yt')).to_have_attribute('href', f'https://www.youtube.com/watch?v={ID}')


@caso('9d. Link automático: biblioteca, área de transferência e aviso de título; liberar toque')
def t_link_automatico(page, base, en, pt):
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.goto(base + '?mock=1')
    # 1) mesmo título de um vídeo da biblioteca: o link entra sozinho
    page.set_input_files('#arq-estudo', [en, pt])
    expect(page.locator('#campo-link')).to_have_value(f'https://www.youtube.com/watch?v={ID}')
    expect(page.locator('#msg-link')).to_contain_text('da sua biblioteca')
    # 2) título novo: usa o link copiado
    pasta = os.path.dirname(en)
    novo = os.path.join(pasta, '[English] Outro vídeo qualquer [DownSub.com].srt')
    shutil.copy(en, novo)
    page.goto(base + '?mock=1')
    page.evaluate("navigator.clipboard.writeText('Veja https://youtu.be/BBBBBBBBBBB?si=x')")
    page.set_input_files('#arq-estudo', [novo])
    expect(page.locator('#campo-link')).to_have_value('https://www.youtube.com/watch?v=BBBBBBBBBBB')
    expect(page.locator('#msg-link')).to_contain_text('do que você copiou')
    # 3) o título do vídeo ("Vídeo de teste") não bate com o do arquivo: aviso
    page.click('#btn-abrir')
    expect(page.locator('#toast')).to_contain_text('parecem ser de outro vídeo')
    page.click('#btn-tocar-grande')
    esperar(lambda: estado(page) == 1, msg='tocando')
    esperar(lambda: page.evaluate("getComputedStyle(document.querySelector('#camada-gestos')).pointerEvents") == 'auto', msg='gestos')
    page.click('#btn-liberar')
    assert page.evaluate("getComputedStyle(document.querySelector('#camada-gestos')).pointerEvents") == 'none'
    expect(page.locator('#btn-liberar')).to_have_text('👆10')
    page.click('#btn-liberar')  # tocar de novo cancela
    assert page.evaluate("getComputedStyle(document.querySelector('#camada-gestos')).pointerEvents") == 'auto'
    page.click('#btn-voltar')


def falso_tradutor(page, falhar=None):
    """Troca o tradutor do Google por um falso: devolve "PT: texto" para cada q."""
    from urllib.parse import parse_qs
    chamadas = []

    def responder(route):
        req = route.request
        q = parse_qs(req.post_data or '').get('q', [])
        chamadas.append(q)
        if falhar and falhar():
            route.fulfill(status=503, body='erro')
            return
        route.fulfill(status=200, content_type='application/json', body=json.dumps([f'PT: {t}' for t in q]),
                      headers={'Access-Control-Allow-Origin': '*'})
    page.route('https://translate.googleapis.com/**', responder)
    return chamadas


@caso('9c. Só a legenda estudada: tradução automática fala por fala, com cache')
def t_traducao_auto(page, base, en):
    estado_falha = {'falhar': True}
    chamadas = falso_tradutor(page, lambda: estado_falha['falhar'])
    page.goto(base + '?mock=1')
    page.fill('#campo-link', 'https://youtu.be/CCCCCCCCCCC')
    page.set_input_files('#arq-estudo', [en])
    expect(page.locator('#info-traducao')).to_have_text('Sem arquivo: o app traduz sozinho (Português).')
    page.click('#btn-abrir')
    # 1) o tradutor falha: aviso e botão para tentar de novo
    expect(page.locator('#aviso-legenda')).to_contain_text('Não consegui traduzir', timeout=15000)
    expect(page.locator('#btn-tentar-traducao')).to_be_visible()
    estado_falha['falhar'] = False
    page.click('#btn-tentar-traducao')
    expect(page.locator('#aviso-legenda')).to_contain_text('Tradução automática (Português)', timeout=8000)
    page.click('#btn-tocar-grande')
    esperar(lambda: estado(page) == 1, msg='tocando')
    page.evaluate('window.__ld.S.player.irPara(22.6)')  # fala 11
    expect(page.locator('#caixa-l1')).to_have_text('Line 11 of the test, with words.')
    expect(page.locator('#caixa-l2')).to_have_text('PT: Line 11 of the test, with words.')
    # cada fala tem a tradução dela, no mesmo tempo
    pares = page.evaluate('window.__ld.S.unidades.map(u => [u.texto, u.trad])')
    assert len(pares) == 40 and all(b == 'PT: ' + a for a, b in pares), pares[:3]
    # o ajuste de sincronia da tradução some (ela anda junto com a legenda)
    page.click('#btn-ajustes')
    expect(page.locator('.ajuste-sinc[data-alvo="ajusteTraducao"]')).to_be_hidden()
    page.click('#btn-fechar-ajustes')
    # 2) reabrir: usa o que já foi traduzido, sem pedir de novo
    n = len(chamadas)
    page.click('#btn-voltar')
    page.locator('.item-bib .abrir-item').first.click()
    expect(page.locator('#aviso-legenda')).to_contain_text('Tradução automática (Português)')
    time.sleep(0.5)
    assert len(chamadas) == n, (len(chamadas), n)
    # 3) "Não traduzir" tira a segunda linha
    page.click('#btn-ajustes')
    page.select_option('[data-ajuste="destino"]', 'nao')
    page.click('#btn-fechar-ajustes')
    page.evaluate('window.__ld.S.player.irPara(22.6)')
    expect(page.locator('#caixa-l2')).to_be_hidden()
    page.click('#btn-ajustes')
    page.select_option('[data-ajuste="destino"]', 'pt')
    page.click('#btn-fechar-ajustes')
    expect(page.locator('#aviso-legenda')).to_contain_text('Tradução automática (Português)', timeout=8000)
    page.click('#btn-voltar')
    page.unroute('https://translate.googleapis.com/**')


@caso('9e. Botão de legenda dupla: um arquivo com os dois idiomas')
def t_dupla(page, base, pasta):
    blocos = []
    for i in range(12):
        s = 0.5 + i * 2.2
        blocos.append(f'{i + 1}\n{ts(s)} --> {ts(s + 2)}\nNúmero {i + 1}, não é?\nNumber {i + 1}, is it not?\n')
    caminho = os.path.join(pasta, '[Bilingual] Vídeo duplo.srt')
    with open(caminho, 'w', encoding='utf-8') as f:
        f.write('\n'.join(blocos))
    page.goto(base + '?mock=1')
    page.fill('#campo-link', 'https://youtu.be/DDDDDDDDDDD')
    page.set_input_files('#arq-dupla', [caminho])
    expect(page.locator('#info-estudo')).to_contain_text('(parte do idioma estudado) — inglês · 12 falas lidas')
    expect(page.locator('#info-traducao')).to_contain_text('(parte da tradução) — português · 12 falas lidas')
    page.click('#btn-abrir')
    page.click('#btn-tocar-grande')
    esperar(lambda: estado(page) == 1, msg='tocando')
    page.evaluate('window.__ld.S.player.irPara(3)')
    expect(page.locator('#caixa-l1')).to_have_text('Number 2, is it not?')
    expect(page.locator('#caixa-l2')).to_have_text('Número 2, não é?')
    page.click('#btn-voltar')
    # arquivo com um idioma só: erro claro
    page.set_input_files('#arq-dupla', [os.path.join(pasta, '[English] Vídeo de teste [DownSub.com].srt')])
    expect(page.locator('#info-estudo')).to_contain_text('não tem dois idiomas')
    expect(page.locator('#btn-abrir')).to_be_disabled()


@caso('11. Protótipo Android: lista vazia, captura simulada do gancho e relatório')
def t_prototipo(page, base):
    page.goto(base + 'prototipo.html?teste=1&app=android&gancho=true&ponte=false&wv=130')
    expect(page.locator('#info')).to_contain_text('Aberto pelo app Android')
    expect(page.locator('#campo-link')).to_have_value(re.compile(r'youtube\.com/watch\?v='))
    expect(page.locator('#btn-pegar')).to_be_disabled()
    corpo = json.dumps({'events': [
        {'tStartMs': 1200, 'dDurationMs': 2300, 'segs': [{'utf8': 'Olá'}, {'utf8': ' mundo'}]},
        {'tStartMs': 4000, 'dDurationMs': 1500, 'segs': [{'utf8': 'ação'}]},
    ]})
    page.evaluate("""(corpo) => window.postMessage({ ldLegenda: true, via: 'xhr', status: 200, texto: corpo,
        url: 'https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr&tlang=pt&fmt=json3&pot=XYZ' }, '*')""", corpo)
    expect(page.locator('.captura.boa')).to_have_count(1)
    expect(page.locator('.captura.boa')).to_contain_text('2 falas')
    expect(page.locator('.captura.boa')).to_contain_text('tradução pt')
    expect(page.locator('.captura.boa .falas li').first).to_contain_text('Olá mundo')
    # resposta vazia (sem token): aparece como problema
    page.evaluate("""() => window.postMessage({ ldLegenda: true, via: 'xhr', status: 200, texto: '',
        url: 'https://www.youtube.com/api/timedtext?v=abc&lang=en' }, '*')""")
    expect(page.locator('.captura.vazia')).to_have_count(1)
    # 429 (excesso de pedidos): recusado, mesmo com texto
    page.evaluate("""() => window.postMessage({ ldLegenda: true, via: 'xhr', status: 429, texto: '<html><p>unusual traffic</p></html>',
        url: 'https://www.youtube.com/api/timedtext?v=abc&lang=en&tlang=pt' }, '*')""")
    expect(page.locator('.captura.vazia', has_text='recusou')).to_have_count(1)
    expect(page.locator('.captura.boa')).to_have_count(1)
    page.evaluate("window.ldNativoViu('https://www.youtube.com/api/timedtext?v=abc&lang=fr&pot=1')")
    expect(page.locator('#msg-vistos')).to_contain_text('1.')
    rel = page.locator('#relatorio').input_value()
    assert 'Capturas: 3' in rel and 'versão do teste 2' in rel and 'token sim' in rel and 'Pedidos de legenda vistos pelo Android: 1' in rel, rel


@caso('12. App Android: janela de carregar a legenda, escolha do idioma, legenda do YouTube e tradução do app')
def t_android(browser, base):
    from urllib.parse import quote
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&app=android')
    expect(page.locator('#dica-android')).to_be_visible()
    page.fill('#campo-link', 'https://youtu.be/CCCCCCCCCCC')
    expect(page.locator('#btn-abrir')).to_be_enabled()  # sem arquivo: basta o link
    page.click('#btn-abrir')
    # logo ao abrir: o vídeo fica coberto pela roda girando, sem o botão "Tocar"
    expect(page.locator('#video-preparando')).to_be_visible()
    expect(page.locator('#btn-tocar-grande')).to_be_hidden()
    # o player só informa as legendas depois de começar: o vídeo toca sem som atrás da janela
    expect(page.locator('#tela-idioma')).to_be_visible()
    assert page.evaluate('window.__ld.S.player.mudo') is True
    assert page.evaluate('window.__ld.S.yt.preparando') is True
    # com a janela de escolha aberta, o vídeo fica parado (só começa depois de "Começar")
    esperar(lambda: estado(page) != 1, msg='pausado na escolha')
    t_escolha = tempo(page)
    time.sleep(0.6)
    assert estado(page) != 1 and abs(tempo(page) - t_escolha) < 0.05, (estado(page), tempo(page), t_escolha)
    expect(page.locator('#video-preparando')).to_be_visible()
    expect(page.locator('#btn-tocar-grande')).to_be_hidden()
    # sugerida: inglês feita por pessoa (a automática indica o idioma falado)
    expect(page.locator('#sel-legenda-video')).to_have_value('1')
    expect(page.locator('#sel-legenda-video option')).to_have_text(['Inglês (automática)', 'Inglês', 'Português (Brasil)'])
    expect(page.locator('#sel-traducao-video')).to_have_value('pt')
    os.makedirs(CAPTURAS, exist_ok=True)
    page.screenshot(path=os.path.join(CAPTURAS, 'android-escolha-idioma.png'))
    page.click('#idioma-ok')
    expect(page.locator('#tela-idioma')).to_be_hidden()
    esperar(lambda: page.evaluate('window.__ld.S.registro?.estudo?.falas?.length || 0') == 40, msg='legenda aplicada')
    assert 'falas' not in (page.locator('#toast').text_content() or '')  # sem aviso da quantidade de falas
    expect(page.locator('#tela-carregando')).to_be_hidden()
    # a legenda do "anúncio" (outro vídeo) foi ignorada
    assert page.evaluate('window.__ld.S.unidades.length') == 40
    assert page.evaluate('window.__ld.S.registro.estudo.origem') == 'youtube'
    assert page.evaluate('window.__ld.S.player.legendasEscondidas') is True
    # com a legenda pronta: volta ao começo, com som, tocando
    assert page.evaluate('window.__ld.S.player.mudo') is False
    esperar(lambda: estado(page) == 1, msg='tocando')
    expect(page.locator('#video-preparando')).to_be_hidden()
    expect(page.locator('#btn-tocar-grande')).to_be_hidden()
    assert tempo(page) < 2, tempo(page)
    expect(page.locator('#caixa-l1')).to_contain_text('from YouTube')
    expect(page.locator('#caixa-l2')).to_contain_text('PT: Line')  # tradução do app
    page.screenshot(path=os.path.join(CAPTURAS, 'android-assistir.png'))
    # trocar o idioma pelo ⚙ Ajustes
    page.click('#btn-ajustes')
    # um bloco só: "Idioma do vídeo" (lista das legendas, com a atual marcada) e "Traduzir para"
    expect(page.locator('#sel-legenda-ajustes')).to_be_visible()
    expect(page.locator('#sel-legenda-ajustes option')).to_have_text(['Inglês (automática)', 'Inglês', 'Português (Brasil)'])
    expect(page.locator('#sel-legenda-ajustes')).to_have_value('1')
    page.wait_for_timeout(300)  # fim da animação do painel
    page.screenshot(path=os.path.join(CAPTURAS, 'android-ajustes-legenda.png'))
    page.select_option('#sel-legenda-ajustes', '0')  # troca direto, sem a janela de escolha
    expect(page.locator('#painel-ajustes')).to_be_hidden()
    expect(page.locator('#tela-idioma')).to_be_hidden()
    esperar(lambda: page.evaluate('window.__ld.S.registro.estudo.arquivo').startswith('[English (auto-generated)]'), msg='trocou para a automática')
    assert page.evaluate('window.__ld.S.frases') is True  # automática: frases montadas
    page.click('#btn-ajustes')
    expect(page.locator('#sel-legenda-ajustes')).to_have_value('0')  # a atual (automática) marcada
    page.click('#btn-fechar-ajustes')
    # selo dos botões: no meio do vídeo, com o ícone do botão
    page.click('#btn-modo-legenda')
    expect(page.locator('#selo-controle')).to_have_class(re.compile('visivel'))
    expect(page.locator('#selo-controle .selo-texto')).to_have_text(re.compile('Lista|Uma fala por vez'))
    expect(page.locator('#selo-controle .selo-icone svg')).to_have_count(1)
    caixa_selo = page.locator('#selo-controle').bounding_box()
    caixa_video = page.locator('#area-video').bounding_box()
    assert caixa_video['y'] <= caixa_selo['y'] and caixa_selo['y'] + caixa_selo['height'] <= caixa_video['y'] + caixa_video['height'], (caixa_selo, caixa_video)
    page.wait_for_timeout(250)  # fim da animação do selo
    page.screenshot(path=os.path.join(CAPTURAS, 'android-selo-controle.png'))
    page.click('#btn-modo-legenda')
    # volta para a biblioteca: o vídeo ficou salvo e reabre sem perguntar
    page.click('#btn-voltar')
    expect(page.locator('.item-bib')).to_have_count(1)
    page.fill('#campo-link', 'https://youtu.be/CCCCCCCCCCC')
    page.click('#btn-abrir')
    esperar(lambda: page.evaluate('window.__ld.S.unidades.length') > 0, msg='reabriu com a legenda salva')
    time.sleep(0.8)
    expect(page.locator('#tela-idioma')).to_be_hidden()
    expect(page.locator('#tela-carregando')).to_be_hidden()
    page.click('#btn-voltar')
    # compartilhar do app do YouTube: abre direto e pergunta o idioma; "Voltar" sai do vídeo sem salvar
    page.goto(base + '?mock=1&text=' + quote('Olha https://youtu.be/DDDDDDDDDDD'))
    expect(page.locator('#tela-assistir')).to_be_visible()
    expect(page.locator('#tela-idioma')).to_be_visible()
    page.click('#idioma-cancelar')
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    expect(page.locator('.item-bib')).to_have_count(1)
    assert not erros, erros
    ctx.close()


@caso('12b. App novo: YouTube na tela inicial, sem arquivos, sem legenda, anúncio com Pular e voltar')
def t_app_novo(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    msgs = lambda: page.evaluate('window.__msgs')
    page.goto(base + '?mock=1&app=android&apk=4')
    # "Meus vídeos": nada de arquivos, link, busca ou DownSub
    for sel in ['#area-novo', '#area-busca', '#btn-ajuda', '#zona-arquivos']:
        expect(page.locator(sel)).to_be_hidden()
    expect(page.locator('#btn-ir-youtube')).to_be_visible()
    assert page.locator('#t-continuar').inner_text() == 'Meus vídeos'
    assert 'Toque em YouTube' in page.locator('#biblioteca-vazia').inner_text()
    os.makedirs(CAPTURAS, exist_ok=True)
    page.screenshot(path=os.path.join(CAPTURAS, 'app-novo-meus-videos-vazio.png'))
    page.click('#btn-ir-youtube')
    assert msgs()[-1] == {'acao': 'youtube', 'url': ''}, msgs()
    assert page.evaluate('window.ldVoltar()') == 'nao'  # na lista: o app volta ao YouTube

    # vídeo sem legenda nenhuma
    page.goto(base + '?mock=1&app=android&apk=4&mockSemLegenda=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=GGGGGGGGGGG')")
    expect(page.locator('#tela-carregando')).to_be_visible()
    expect(page.locator('#carregando-titulo')).to_have_text('Carregando a legenda…')
    page.screenshot(path=os.path.join(CAPTURAS, 'app-novo-carregando.png'))
    expect(page.locator('#carregando-titulo')).to_have_text('Este vídeo não tem legenda', timeout=15000)
    expect(page.locator('#carregando-sem')).to_be_visible()
    expect(page.locator('#carregando-voltar')).to_have_text('Voltar ao YouTube')
    page.screenshot(path=os.path.join(CAPTURAS, 'app-novo-sem-legenda.png'))
    expect(page.locator('#carregando-diag')).to_be_visible()
    page.click('#carregando-diag')
    expect(page.locator('#toast')).to_contain_text('Diagnóstico copiado')
    diag = page.evaluate('window.__ld.textoDiagnostico()')
    assert 'resposta SEM legendas' in diag and 'Gancho v2' in diag, diag
    n = len(msgs())
    page.click('#carregando-voltar')
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    assert [m for m in msgs()[n:] if m.get('acao') not in ('telaLigada', 'telaPronta')] == [{'acao': 'youtube', 'url': ''}], msgs()[n:]
    expect(page.locator('.item-bib')).to_have_count(0)  # não entra em "Meus vídeos"

    # anúncio que ignora o clique por código: o app toca de verdade no "Pular"
    page.goto(base + '?mock=1&app=android&apk=4&mockAnuncio=teimoso')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=HHHHHHHHHHH')")
    expect(page.locator('#tela-carregando')).to_be_visible()
    expect(page.locator('#carregando-texto')).to_contain_text('anúncio')
    expect(page.locator('#carregando-pular')).to_be_visible()
    expect(page.locator('#selo-anuncio')).to_be_visible()
    page.screenshot(path=os.path.join(CAPTURAS, 'app-novo-anuncio.png'))
    n = len(msgs())
    page.click('#carregando-pular')
    esperar(lambda: any(m.get('acao') == 'tocar' for m in msgs()[n:]), limite=3, msg='toque nativo pedido')
    toque = [m for m in msgs()[n:] if m.get('acao') == 'tocar'][0]
    r = page.evaluate("(() => { const r = window.__ld.S.player.retangulo(); return { l: r.left, t: r.top }; })()")
    assert abs(toque['x'] - (r['l'] + 245)) < 1 and abs(toque['y'] - (r['t'] + 165)) < 1, (toque, r)
    assert toque['largura'] == 412, toque
    assert page.evaluate('window.__ld.S.player.pedidosPular') == 1
    # o anúncio de teste acaba sozinho: a legenda carrega e o vídeo começa do início, com som
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=8000)
    expect(page.locator('#selo-anuncio')).to_be_hidden()
    expect(page.locator('#idioma-cancelar')).to_have_text('Voltar ao YouTube')
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.registro?.estudo?.falas?.length || 0') == 40, msg='legenda aplicada')
    assert 'falas' not in (page.locator('#toast').text_content() or '')  # sem aviso da quantidade de falas
    esperar(lambda: estado(page) == 1, msg='tocando')
    assert page.evaluate('window.__ld.S.player.mudo') is False
    expect(page.locator('#btn-liberar')).to_be_hidden()  # sem a mãozinha no app novo
    expect(page.locator('#btn-voltar')).to_have_attribute('aria-label', 'Voltar ao YouTube')
    page.screenshot(path=os.path.join(CAPTURAS, 'app-novo-assistir.png'))
    # o voltar do celular fecha o menu e depois sai do vídeo, de volta ao YouTube
    page.click('#btn-traducao')
    assert page.evaluate('window.ldVoltar()') == 'ok'
    expect(page.locator('#menu-traducao')).to_be_hidden()
    n = len(msgs())
    assert page.evaluate('window.ldVoltar()') == 'ok'
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    esperar(lambda: {'acao': 'youtube', 'url': ''} in msgs()[n:], limite=3, msg='voltou ao YouTube')
    expect(page.locator('.item-bib')).to_have_count(1)
    expect(page.locator('#lista-biblioteca .item-bib button.btn-topo')).to_have_count(1)
    page.click('#lista-biblioteca .item-bib button.btn-topo')
    expect(page.locator('.menu-item-opcoes button')).to_have_text(['Renomear', 'Apagar'])
    page.keyboard.press('Escape')
    page.click('body', position={'x': 5, 'y': 5})

    # anúncio comum: o clique do gancho basta
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=IIIIIIIIIII')")
    expect(page.locator('#tela-carregando')).to_be_visible()
    page.goto(base + '?mock=1&app=android&apk=4&mockAnuncio=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=IIIIIIIIIII')")
    expect(page.locator('#carregando-pular')).to_be_visible()
    n = len(msgs())
    page.click('#carregando-pular')
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=3000)
    assert not any(m.get('acao') == 'tocar' for m in msgs()[n:]), msgs()[n:]

    # "Meus vídeos" com um vídeo aberto: fecha o vídeo e mostra a lista
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.registro?.estudo?.falas?.length || 0') == 40, msg='legenda aplicada')
    assert 'falas' not in (page.locator('#toast').text_content() or '')  # sem aviso da quantidade de falas
    page.evaluate('window.ldMostrarBiblioteca()')
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    expect(page.locator('.item-bib')).to_have_count(2)
    # vídeo aberto pela lista: voltar volta para a lista, não para o YouTube
    n = len(msgs())
    page.locator('.item-bib .abrir-item').first.click()
    expect(page.locator('#tela-assistir')).to_be_visible()
    expect(page.locator('#btn-voltar')).to_have_attribute('aria-label', 'Voltar para Meus vídeos')
    page.click('#btn-voltar')
    expect(page.locator('#tela-biblioteca')).to_be_visible()
    time.sleep(0.3)
    assert not any(m.get('acao') == 'youtube' for m in msgs()[n:]), msgs()[n:]
    assert not erros, erros
    ctx.close()


@caso('12c. Vídeo só com legenda automática: a API do iframe não mostra, o gancho mostra e baixa')
def t_so_automatica(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&app=android&apk=5&mockSoAsr=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=JJJJJJJJJJJ')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    expect(page.locator('#sel-legenda-video option')).to_have_text(['Inglês (automática)'])
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.registro?.estudo?.falas?.length || 0') == 30, msg='legenda aplicada')
    assert 'falas' not in (page.locator('#toast').text_content() or '')  # sem aviso da quantidade de falas
    assert page.evaluate('window.__ld.S.registro.estudo.arquivo').startswith('[English (auto-generated)]')
    esperar(lambda: estado(page) == 1, msg='tocando')
    expect(page.locator('#caixa-l1')).to_contain_text('from YouTube', timeout=4000)
    assert not erros, erros
    ctx.close()


@caso('12f. Velocidade de 0,05 em 0,05 abaixo de 1× (gancho v5); acima, as do YouTube')
def t_velocidade_fina(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&app=android&apk=8&mockSoAsr=1&mockVelFina=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=KKKKKKKKKKK')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    page.click('#idioma-ok')
    esperar(lambda: estado(page) == 1, msg='tocando')
    page.click('#btn-ajustes')
    chips = page.locator('#linha-velocidade .chip').all_text_contents()
    lentas = [f'0,{k:02d}×' for k in range(60, 100, 5)]  # nada abaixo de 0,60×
    assert chips == lentas + ['1×', '1,25×', '1,5×', '1,75×', '2×'], chips
    page.locator('#linha-velocidade .chip', has_text='0,95×').click()
    expect(page.locator('#linha-velocidade .chip.confirmada')).to_have_text('0,95×')
    assert page.evaluate('window.__ld.S.ajustes.velocidade') == 0.95
    page.locator('#linha-velocidade .chip', has_text='0,70×').click()
    expect(page.locator('#linha-velocidade .chip.confirmada')).to_have_text('0,70×')
    page.locator('#linha-velocidade .chip', has_text='1,5×').click()
    expect(page.locator('#linha-velocidade .chip.confirmada')).to_have_text('1,5×')
    assert not erros, erros
    ctx.close()


@caso('12e. Vídeo com dublagem automática: a legenda sugerida é a do áudio original; tradução no idioma do celular')
def t_dublado(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&app=android&apk=7&mockDublado=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=DUBDUBDUB00')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    expect(page.locator('#sel-legenda-video option')).to_have_text(['Alemão (automática)', 'Inglês (automática)'])
    expect(page.locator('#sel-legenda-video')).to_have_value('1')  # inglês: o áudio original
    expect(page.locator('#idioma-dica-audio')).to_have_text('Pré-selecionada pelo áudio do vídeo: Inglês.')
    expect(page.locator('#sel-traducao-video')).to_have_value('pt')  # idioma do celular
    assert page.locator('#sel-traducao-video option').count() > 130
    assert page.locator('[data-ajuste="destino"] option').count() > 130
    page.screenshot(path=os.path.join(CAPTURAS, 'android-dublado-escolha.png'))
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.registro?.estudo?.falas?.length || 0') == 30, msg='legenda aplicada')
    assert page.evaluate('window.__ld.S.registro.estudo.idioma') == 'en'
    assert page.evaluate('window.__ld.S.ajustes.destinoManual') is False  # não mexeu na lista: segue o celular
    expect(page.locator('#caixa-l2')).to_contain_text('PT:', timeout=6000)
    # ícone A–B com o símbolo de loop em volta
    assert page.locator('#btn-ab svg path').count() == 1 and page.locator('#btn-ab svg text').text_content() == 'A-B'
    # Dicas no lugar de Gestos
    page.click('#btn-ajustes')
    expect(page.locator('#painel-ajustes h3', has_text='Dicas')).to_be_visible()
    assert page.locator('#painel-ajustes h3', has_text='Gestos').count() == 0
    # mudar a tradução nos Ajustes vira escolha da pessoa
    page.select_option('[data-ajuste="destino"]', 'ja')
    assert page.evaluate('window.__ld.S.ajustes.destinoManual') is True
    page.click('#btn-fechar-ajustes')
    assert not erros, erros
    ctx.close()


@caso('12g. Pontuação melhorada: baixar o pacote na escolha do idioma, pontuar antes de começar, apagar nos Ajustes')
def t_pontuacao_modelo(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    # O Hugging Face vira o modelo falso (mesmas entradas e saídas do de verdade; tests/fixtures/modelo)
    pasta_modelo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'modelo')
    baixados = []

    def hf(route):
        url = route.request.url
        if not baixados:  # a 1ª tentativa falha (internet caiu): o cartão avisa e oferece baixar de novo
            baixados.append('falhou')
            route.fulfill(status=503, body='')
            return
        baixados.append(url.rsplit('/', 1)[-1])
        arq = 'falso.onnx' if url.endswith('.onnx') else 'falso.spmodel'
        with open(os.path.join(pasta_modelo, arq), 'rb') as f:
            route.fulfill(status=200, body=f.read(), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream'})
    page.route('https://huggingface.co/**', hf)
    page.goto(base + '?mock=1&app=android&apk=8&mockSoAsr=1&mockPalavras=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=PONTUA00000')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    cartao = page.locator('#cartao-pontuacao')
    expect(cartao).to_be_visible()
    expect(cartao.locator('.pm-baixar')).to_contain_text('MB')
    expect(cartao.locator('.pm-texto')).to_contain_text('Inglês')
    page.screenshot(path=os.path.join(CAPTURAS, 'android-pontuacao-oferta.png'))
    # o app confere o tamanho exato de cada arquivo: aqui valem os tamanhos do modelo falso
    page.evaluate(f"""(() => {{ const p = window.__ld.PACOTES.en;
      p.bytesModelo = {os.path.getsize(os.path.join(pasta_modelo, 'falso.onnx'))};
      p.bytesSp = {os.path.getsize(os.path.join(pasta_modelo, 'falso.spmodel'))}; }})()""")
    cartao.locator('.pm-baixar').click()
    expect(cartao).to_have_attribute('data-estado', 'erro', timeout=8000)
    expect(cartao.locator('.pm-texto')).to_contain_text('fora do ar')  # explicado, sem código técnico
    assert '503' not in cartao.locator('.pm-texto').inner_text()
    expect(cartao.locator('.pm-baixar')).to_have_text('Tentar de novo')
    cartao.locator('.pm-baixar').click()
    expect(cartao).to_have_attribute('data-estado', 'pronto', timeout=15000)
    expect(page.locator('#pm-usar')).to_be_visible()
    expect(page.locator('#pm-usar input')).to_be_checked()
    assert sorted(baixados) == ['falhou', 'punct_cap_seg_en.onnx', 'spe_32k_lc_en.model'], baixados
    page.wait_for_timeout(200)
    page.screenshot(path=os.path.join(CAPTURAS, 'android-pontuacao-instalada.png'))
    page.click('#idioma-ok')
    # Pontua antes de começar; depois a legenda usa o resultado do modelo
    esperar(lambda: page.evaluate('window.__ld.S.pontuadaModelo') is True, msg='pontuação do modelo aplicada', limite=20)
    n = page.evaluate('window.__ld.S.registro.estudo.pontuacaoModelo.palavras.length')
    assert n == 150, n  # 30 falas de 5 palavras
    expect(page.locator('#aviso-legenda')).to_contain_text('Pontuação melhorada')
    expect(page.locator('#tela-carregando')).to_be_hidden()
    esperar(lambda: estado(page) == 1, msg='tocando')
    # desligar nos Ajustes volta para a pontuação pelas pausas; ligar de novo usa o resultado guardado
    page.click('#btn-ajustes')
    expect(page.locator('#grupo-pontuacao')).to_be_visible()
    linha = page.locator('#grupo-pontuacao [data-pacote="en"]')
    expect(linha).to_have_attribute('data-estado', 'pronto')
    expect(page.locator('#grupo-pontuacao [data-pacote="latinas"] .pm-baixar')).to_be_visible()
    page.locator('#grupo-pontuacao [data-ajuste="pontuacaoModelo"]').uncheck()
    esperar(lambda: page.evaluate('window.__ld.S.pontuadaModelo') is False, msg='desligou')
    page.locator('#grupo-pontuacao [data-ajuste="pontuacaoModelo"]').check()
    esperar(lambda: page.evaluate('window.__ld.S.pontuadaModelo') is True, msg='ligou de novo')
    page.locator('#grupo-pontuacao').screenshot(path=os.path.join(CAPTURAS, 'android-pontuacao-ajustes.png'))
    # apagar o pacote (com confirmação)
    linha.locator('.pm-apagar').click()
    expect(page.locator('#dialogo')).to_be_visible()
    page.click('#dialogo-ok')
    expect(linha).to_have_attribute('data-estado', 'ausente', timeout=5000)
    restam = page.evaluate("caches.open('modelos-pontuacao-v1').then((c) => c.keys()).then((k) => k.length)")
    assert restam == 0, restam  # sem pacote nenhum, o motor também sai
    assert not erros, erros
    ctx.close()


@caso('15b. App Android 9: o download dos pacotes é feito pelo Android (segue em segundo plano)')
def t_pontuacao_nativa(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    pasta_modelo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'modelo')
    hf_pedidos = []
    page.route('https://huggingface.co/**', lambda route: (hf_pedidos.append(route.request.url), route.abort()))
    # Arquivos "baixados pelo Android": o app entrega cada um num endereço próprio (__ld_modelo/N)
    locais = {}

    def local(route):
        n = route.request.url.split('__ld_modelo/')[1].split('?')[0]
        url = locais.get(n)
        if url is None:
            route.fulfill(status=404, body='')
            return
        if url.endswith('.wasm'):
            caminho = os.path.join(RAIZ, 'vendor', 'ort', 'ort-wasm-simd-threaded.wasm')
        else:
            caminho = os.path.join(pasta_modelo, 'falso.onnx' if url.endswith('.onnx') else 'falso.spmodel')
        with open(caminho, 'rb') as f:
            route.fulfill(status=200, body=f.read(), headers={'Content-Type': 'application/octet-stream'})
    page.route('**/__ld_modelo/**', local)
    page.goto(base + '?mock=1&app=android&apk=9&mockSoAsr=1&mockPalavras=1')
    # ao abrir, a página pergunta ao app se há download em andamento
    esperar(lambda: any(m.get('acao') == 'estadoModelos' for m in page.evaluate('window.__msgs')), msg='pediu o estado')
    page.evaluate("window.ldModelosEstado(JSON.stringify({ estado: 'nada' }))")
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=NATIVO00000')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    page.evaluate(f"""(() => {{ const p = window.__ld.PACOTES.en;
      p.bytesModelo = {os.path.getsize(os.path.join(pasta_modelo, 'falso.onnx'))};
      p.bytesSp = {os.path.getsize(os.path.join(pasta_modelo, 'falso.spmodel'))}; }})()""")
    cartao = page.locator('#cartao-pontuacao')
    cartao.locator('.pm-baixar').click()
    esperar(lambda: any(m.get('acao') == 'baixarModelos' for m in page.evaluate('window.__msgs')), msg='pediu o download ao app')
    pedido = [m for m in page.evaluate('window.__msgs') if m.get('acao') == 'baixarModelos'][0]
    assert pedido['id'] == 'en' and pedido['nome'], pedido
    urls = [a['url'] for a in pedido['arquivos']]
    assert urls[-1].endswith('.onnx') and urls[-2].endswith('.model'), urls
    assert all(a['bytes'] > 0 for a in pedido['arquivos'])
    total = sum(a['bytes'] for a in pedido['arquivos'])
    expect(cartao).to_have_attribute('data-estado', 'baixando')
    expect(cartao.locator('.pm-texto')).to_contain_text('notificações')
    # andamento vindo do app
    page.evaluate(f"window.ldModelosEstado(JSON.stringify({{ id: 'en', estado: 'baixando', feitos: {total // 2}, total: {total} }}))")
    expect(cartao.locator('.pm-estado')).to_have_text('50%')
    # cancelar: a página pede ao app; o app confirma
    cartao.locator('.pm-cancelar').click()
    esperar(lambda: any(m.get('acao') == 'cancelarModelos' for m in page.evaluate('window.__msgs')), msg='pediu para cancelar')
    page.evaluate("window.ldModelosEstado(JSON.stringify({ id: 'en', estado: 'cancelado' }))")
    expect(cartao).to_have_attribute('data-estado', 'ausente')
    # de novo, agora até o fim: o app avisa "pronto" e a página copia os arquivos para o cache
    page.evaluate('window.__msgs.length = 0')
    cartao.locator('.pm-baixar').click()
    esperar(lambda: any(m.get('acao') == 'baixarModelos' for m in page.evaluate('window.__msgs')), msg='pediu de novo')
    arquivos = []
    for i, a in enumerate(pedido['arquivos']):
        locais[str(i)] = a['url']
        arquivos.append({'url': a['url'], 'bytes': a['bytes'], 'local': f'{base}__ld_modelo/{i}'})
    page.evaluate("(e) => window.ldModelosEstado(JSON.stringify(e))",
                  {'id': 'en', 'estado': 'pronto', 'feitos': total, 'total': total, 'arquivos': arquivos})
    expect(cartao).to_have_attribute('data-estado', 'pronto', timeout=15000)
    esperar(lambda: any(m.get('acao') == 'apagarModelos' for m in page.evaluate('window.__msgs')), msg='pediu para apagar a cópia do app')
    guardados = page.evaluate("caches.open('modelos-pontuacao-v1').then((c) => c.keys()).then((k) => k.map((r) => r.url))")
    assert sorted(guardados) == sorted(urls), guardados  # guardados com o endereço original
    assert not hf_pedidos, hf_pedidos  # a página não baixou nada do Hugging Face
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.pontuadaModelo') is True, msg='pontuação do modelo aplicada', limite=20)
    # erro vindo do app (ex.: sem espaço): o cartão mostra e oferece baixar de novo
    page.evaluate("window.ldModelosEstado(JSON.stringify({ id: 'latinas', estado: 'erro', erro: 'Falta espaço no celular para o pacote.' }))")
    page.click('#btn-ajustes')
    linha = page.locator('#grupo-pontuacao [data-pacote="latinas"]')
    expect(linha).to_have_attribute('data-estado', 'erro')
    expect(linha.locator('.pm-texto')).to_contain_text('Falta espaço')
    assert not erros, erros
    ctx.close()


@caso('16. Celular em inglês: a interface é traduzida (e guardada); legendas e títulos ficam como estão')
def t_interface_idioma(browser, base):
    from urllib.parse import parse_qs
    ctx = browser.new_context(locale='en-US', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    pedidos = []

    def responder(route):
        url = route.request.url
        q = parse_qs(route.request.post_data or '').get('q', [])
        pedidos.append(url)
        route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                      body=json.dumps([f'EN: {t}' for t in q]))
    page.route('https://translate.googleapis.com/**', responder)
    page.goto(base + '?mock=1&app=android&apk=7')
    expect(page.locator('#t-continuar .so-app')).to_have_text('EN: Meus vídeos', timeout=6000)
    assert page.evaluate('document.documentElement.lang') == 'en'
    assert any('sl=pt' in u and 'tl=en' in u for u in pedidos), pedidos
    # abre um vídeo: a janela de idioma vem traduzida; a legenda não
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=IIIIIIIIIII')")
    expect(page.locator('#idioma-ok')).to_have_text('EN: Começar', timeout=6000)
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.registro?.estudo?.falas?.length || 0') == 40, msg='legenda aplicada')
    expect(page.locator('#caixa-l1')).to_contain_text('from YouTube', timeout=4000)
    assert 'EN:' not in page.locator('#caixa-legenda').inner_text()
    assert page.evaluate('window.__ld.S.ajustes.destino') == 'en'  # tradução no idioma do celular
    # da segunda vez, sem internet: a tradução guardada aparece na hora
    page.unroute('https://translate.googleapis.com/**')
    page.route('https://translate.googleapis.com/**', lambda r: r.abort())
    page.goto(base + '?mock=1&app=android&apk=7')
    expect(page.locator('#t-continuar .so-app')).to_have_text('EN: Meus vídeos', timeout=2000)
    page.screenshot(path=os.path.join(CAPTURAS, 'interface-ingles.png'))
    assert not erros, erros
    ctx.close()


@caso('14. Gancho dentro de um player falso: lista a automática e baixa direto pelo endereço da faixa')
def t_gancho(browser, base):
    import json as _json
    gancho = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'app', 'src', 'main', 'assets', 'gancho.js')
    ctx = browser.new_context()
    ctx.add_init_script(path=gancho)
    page = ctx.new_page()
    vid = 'VVVVVVVVVVV'
    embed = """<!doctype html><html><body><div id="movie_player" class="html5-video-player">
      <button class="ytp-share-button ytp-button">Compartilhar</button><a class="ytp-youtube-button">YouTube</a>
      <div class="ytp-bezel">pausa</div><button class="ytp-large-play-button">play</button>
      <div class="video-ads ytp-ad-module"><button class="ytp-skip-ad-button">Pular</button></div>
      <video id="v"></video></div><script>
      const p = document.getElementById('movie_player');
      p.getVideoData = () => ({ video_id: '%s' });
      // dublagem automática: o player tocava o áudio em alemão; o original é o inglês
      const trilhas = [{ id: 'de-DE.3', displayName: 'Deutsch (Deutschland) (automatisch synchronisiert)', isOriginalTrack: false },
                       { id: 'en.4', displayName: 'English original', isOriginalTrack: true }];
      let atual = trilhas[0];
      p.getAvailableAudioTracks = () => trilhas;
      p.getAudioTrack = () => atual;
      p.setAudioTrack = (t) => { atual = t; window.__trocouAudio = t.id; };
      p.getOption = (m, o, op) => (op && op.includeAsr ? [{ languageCode: 'en', kind: 'asr', languageName: 'English (auto-generated)', vss_id: 'a.en' }] : []);
      p.loadModule = () => {};
      p.setOption = (m, o, v) => { window.__faixa = v; }; // este player falso não baixa nada
      fetch('/youtubei/v1/player?prettyPrint=false', { method: 'POST' }).then((r) => r.text());
    </script></body></html>""" % vid
    resposta = {
        'playabilityStatus': {'status': 'OK'}, 'videoDetails': {'videoId': vid}, 'streamingData': {},
        'captions': {'playerCaptionsTracklistRenderer': {'captionTracks': [
            {'baseUrl': f'/api/timedtext?v={vid}&lang=en&kind=asr&caps=asr', 'name': {'simpleText': 'English (auto-generated)'},
             'vssId': 'a.en', 'languageCode': 'en', 'kind': 'asr'}]}},
    }
    pedidos = []
    def rota(route):
        u = route.request.url
        if '/embed/' in u:
            route.fulfill(status=200, content_type='text/html', body=embed)
        elif '/youtubei/v1/player' in u:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps(resposta))
        elif '/api/timedtext' in u:
            pedidos.append(u)
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'events': [
                {'tStartMs': 0, 'dDurationMs': 1500, 'segs': [{'utf8': 'hello'}]}]}))
        else:
            route.continue_()
    page.route('**/*', rota)
    page.goto(base + 'tests/fixtures/nao_legenda.txt')  # qualquer página do servidor de teste
    page.evaluate("""() => {
      window.__vistas = [];
      window.addEventListener('message', (e) => window.__vistas.push(e.data));
      const f = document.createElement('iframe');
      f.src = '/embed/%s';
      document.body.appendChild(f);
      window.__f = f;
    }""" % vid)
    esperar(lambda: page.evaluate("window.__vistas.some((d) => d && d.ldFaixas && d.faixas.length)"), limite=6, msg='gancho listou as faixas')
    faixas = page.evaluate("window.__vistas.filter((d) => d && d.ldFaixas && d.faixas.length).pop()")
    assert faixas['video'] == vid and faixas['fontes'] == ['resposta', 'tracklist'], faixas
    assert faixas['faixas'][0]['kind'] == 'asr' and faixas['faixas'][0]['baseUrl'], faixas
    page.evaluate("window.__f.contentWindow.postMessage({ ldBaixar: { languageCode: 'en', kind: 'asr', vss_id: 'a.en' } }, '*')")
    esperar(lambda: page.evaluate("window.__vistas.some((d) => d && d.ldLegenda)"), limite=6, msg='legenda baixada direto')
    leg = page.evaluate("window.__vistas.find((d) => d && d.ldLegenda)")
    assert 'fmt=json3' in leg['url'] and 'kind=asr' in leg['url'] and leg['status'] == 200 and 'hello' in leg['texto'], leg
    assert page.evaluate("window.__f.contentWindow.__faixa.kind") == 'asr'  # pediu antes ao próprio player
    esperar(lambda: page.evaluate("window.__vistas.some((d) => d && d.ldBaixou && d.ok)"), limite=3, msg='aviso de download')
    # áudio original: informado à página e o player volta para ele
    audio = page.evaluate("window.__vistas.filter((d) => d && d.ldFaixas).pop().audio")
    assert audio and audio['original'] == 'en' and audio['fonte'] == 'player', audio
    assert page.evaluate("window.__f.contentWindow.__trocouAudio") == 'en.4'
    # player limpo: sem compartilhar, logotipo e ícone de pausa; o Pular anúncio continua
    vis = lambda sel: page.evaluate("(s) => { const e = window.__f.contentDocument.querySelector(s); return getComputedStyle(e).display !== 'none'; }", sel)
    assert not vis('.ytp-share-button') and not vis('.ytp-youtube-button') and not vis('.ytp-bezel')
    assert vis('.ytp-skip-ad-button')
    assert vis('.ytp-large-play-button')  # antes de tocar, o botão grande fica
    page.evaluate("window.__f.contentDocument.getElementById('v').dispatchEvent(new Event('playing'))")
    assert not vis('.ytp-large-play-button')
    # velocidade exata (gancho v5): 0,85× direto no vídeo, e volta se o YouTube trocar (menos no anúncio)
    assert faixas.get('velFina') is True and faixas['versao'] >= 5, faixas
    taxa = lambda: page.evaluate("window.__f.contentDocument.getElementById('v').playbackRate")
    page.evaluate("window.__f.contentWindow.postMessage({ ldVelocidade: 0.85 }, '*')")
    esperar(lambda: abs(taxa() - 0.85) < 1e-6, limite=3, msg='velocidade 0,85 no vídeo')
    esperar(lambda: page.evaluate("window.__vistas.some((d) => d && d.ldVel && Math.abs(d.v - 0.85) < 1e-6)"), limite=3, msg='aviso da velocidade')
    page.evaluate("window.__f.contentDocument.getElementById('v').playbackRate = 1")  # o YouTube trocou sozinho
    esperar(lambda: abs(taxa() - 0.85) < 1e-6, limite=3, msg='velocidade reaplicada')
    page.evaluate("""() => { const d = window.__f.contentDocument; d.getElementById('movie_player').classList.add('ad-showing');
      d.getElementById('v').playbackRate = 1; }""")
    time.sleep(1.0)
    assert abs(taxa() - 1) < 1e-6, 'durante o anúncio o gancho não força a velocidade'
    page.evaluate("window.__f.contentDocument.getElementById('movie_player').classList.remove('ad-showing')")
    esperar(lambda: abs(taxa() - 0.85) < 1e-6, limite=3, msg='velocidade volta depois do anúncio')
    ctx.close()


@caso('13. App Android: busca no YouTube com filtros e vídeo tocado lá abre aqui')
def t_busca(browser, base):
    # fora do app: o cartão de busca não aparece
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    page.goto(base + '?mock=1')
    expect(page.locator('#area-busca')).to_be_hidden()
    ctx.close()
    # app antigo (sem ?apk=3): pede para atualizar
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    page.goto(base + '?mock=1&app=android')
    expect(page.locator('#area-busca')).to_be_visible()
    expect(page.locator('#busca-atualizar')).to_be_visible()
    expect(page.locator('#form-busca')).to_be_hidden()
    ctx.close()
    # app novo, com a ponte LDNativo simulada
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&app=android&apk=3')
    expect(page.locator('#form-busca')).to_be_visible()
    expect(page.locator('#busca-atualizar')).to_be_hidden()
    # a busca fica acima do campo de link
    y_busca = page.locator('#campo-busca').bounding_box()['y']
    y_link = page.locator('#campo-link').bounding_box()['y']
    assert y_busca < y_link, (y_busca, y_link)
    page.click('#filtros-busca summary')
    page.select_option('[data-filtro="duracao"]', '2')
    page.check('[data-filtro="legendas"]')
    expect(page.locator('#resumo-filtros')).to_contain_text('Mais de 20 min')
    os.makedirs(CAPTURAS, exist_ok=True)
    page.screenshot(path=os.path.join(CAPTURAS, 'android-busca.png'))
    page.fill('#campo-busca', 'english podcast')
    page.keyboard.press('Enter')
    msgs = page.evaluate('window.__msgs')
    assert msgs == [{'acao': 'youtube', 'url': 'https://m.youtube.com/results?search_query=english%20podcast&sp=EgYQARgCKAE%3D'}], msgs
    page.click('#btn-youtube-inicio')
    assert page.evaluate('window.__msgs[1].url') == 'https://m.youtube.com/'
    # filtros ficam guardados
    page.reload()
    expect(page.locator('[data-filtro="duracao"]')).to_have_value('2')
    # o app Android avisa que um vídeo foi tocado no YouTube: abre aqui e pergunta o idioma
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=FFFFFFFFFFF&pp=abc')")
    expect(page.locator('#tela-assistir')).to_be_visible()
    expect(page.locator('#tela-idioma')).to_be_visible()
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.registro?.estudo?.falas?.length || 0') == 40, msg='legenda aplicada')
    assert 'falas' not in (page.locator('#toast').text_content() or '')  # sem aviso da quantidade de falas
    assert page.evaluate('window.__ld.S.registro.id') == 'FFFFFFFFFFF'
    assert not erros, erros
    ctx.close()


@caso('17. Ajustes de 22/11 (2): explicação dos gestos, entrada suave, pausa mantida, Ajustes pausa, histórico')
def t_ajustes_22_11(browser, base, en, pt):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    # Vídeo aberto pelos arquivos: a explicação aparece antes de tocar
    page.goto(base + '?mock=1&gestos=1')
    page.fill('#campo-link', f'https://youtu.be/{ID}')
    page.set_input_files('#arq-estudo', [en, pt])
    page.click('#btn-abrir')
    page.click('#btn-tocar-grande')
    expect(page.locator('#tela-gestos')).to_be_visible()
    assert estado(page) != 1  # o vídeo espera a explicação
    expect(page.locator('#gestos-titulo')).to_have_text('Como avançar e retroceder o vídeo')
    expect(page.locator('#gestos-acao-direita')).to_have_text('retrocede o vídeo')
    expect(page.locator('#gestos-acao-esquerda')).to_have_text('avança o vídeo')
    expect(page.locator('#gestos-nao-mostrar')).not_to_be_checked()
    # 1º deslize (da esquerda para a direita): ícone de retroceder; o de avançar não aparece nele
    assert page.locator('.demo-icone-1 svg.ic-retroceder').is_visible()
    assert not page.locator('.demo-icone-1 svg.ic-avancar').is_visible()
    page.wait_for_timeout(1250)  # ícone de retroceder no meio do vídeo (logo depois do 1º deslize)
    os.makedirs(CAPTURAS, exist_ok=True)
    page.screenshot(path=os.path.join(CAPTURAS, 'gestos-explicacao.png'))
    page.click('#gestos-ok')
    expect(page.locator('#tela-gestos')).to_be_hidden()
    esperar(lambda: estado(page) == 1, msg='tocando depois de Concluir')
    assert page.evaluate("document.querySelector('#area-video').classList.contains('entrada-suave')")
    assert page.evaluate('window.__ld.S.ajustes.gestosExplicados') is False  # não marcou: mostra de novo
    # Pausado + arrastar: continua pausado (só o play volta a tocar)
    esperar(lambda: page.evaluate("getComputedStyle(document.querySelector('#camada-gestos')).pointerEvents") == 'auto', msg='gestos ativos')
    esperar(lambda: exibida(page) >= 1, msg='na fala 2', limite=10)
    page.click('#btn-play')
    esperar(lambda: estado(page) == 2, msg='pausou')
    i0 = exibida(page)
    arrastar(page, '#camada-gestos', -150)
    esperar(lambda: exibida(page) == i0 + 1, msg='avançou pausado')
    time.sleep(0.8)
    assert estado(page) == 2, 'voltou a tocar sozinho depois do arraste'
    arrastar(page, '#caixa-legenda', 150)
    esperar(lambda: exibida(page) == i0, msg='voltou pausado')
    time.sleep(0.8)
    assert estado(page) == 2, 'voltou a tocar sozinho'
    page.keyboard.press('r')  # repetir também não toca
    time.sleep(0.5)
    assert estado(page) == 2
    # Tocando + arrastar: continua tocando
    page.click('#btn-play')
    esperar(lambda: estado(page) == 1, msg='tocando de novo')
    arrastar(page, '#camada-gestos', -150)
    time.sleep(0.6)
    assert estado(page) == 1
    # Abrir os Ajustes pausa na hora; velocidades lentas só até 0,60×
    page.click('#btn-ajustes')
    esperar(lambda: estado(page) == 2, msg='Ajustes pausou')
    chips = page.locator('#linha-velocidade .chip').all_text_contents()
    assert all(not c.startswith(('0,25', '0,5×', '0,50', '0,55')) for c in chips), chips
    # "Ver como avançar e retroceder o vídeo" nos Ajustes; marcar "não mostrar mais"
    expect(page.locator('#btn-ver-gestos')).to_have_text('Ver como avançar e retroceder o vídeo')
    # Dicas (23/11): o botão fica logo abaixo da dica de deslizar; sem as dicas da pausa e do idioma do app
    dicas = page.evaluate('''() => { const b = document.querySelector('#btn-ver-gestos');
      const antes = b.previousElementSibling; return { grupo: b.closest('.grupo').querySelector('h3').textContent,
      antes: antes && antes.textContent, texto: b.closest('.grupo').textContent }; }''')
    assert dicas['grupo'] == 'Dicas', dicas['grupo']
    assert dicas['antes'].strip().startswith('Deslizar para a esquerda'), dicas['antes']
    assert 'Com o vídeo pausado' not in dicas['texto']
    assert 'O app aparece no idioma do seu celular' not in dicas['texto']
    assert 'o dedo no vídeo: repete a fala' not in dicas['texto'] and '2×' in dicas['texto']
    page.click('#btn-ver-gestos')
    expect(page.locator('#tela-gestos')).to_be_visible()
    page.check('#gestos-nao-mostrar')
    page.click('#gestos-ok')
    assert page.evaluate('window.__ld.S.ajustes.gestosExplicados') is True
    assert estado(page) == 2  # fechar a explicação não faz tocar
    ctx.close()

    # App Android 10, vídeo novo: Começar → explicação → vídeo com entrada suave; histórico avisado ao app
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&gestos=1&app=android&apk=10&mockSoAsr=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=HISTORICO00')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    page.click('#idioma-ok')
    expect(page.locator('#tela-gestos')).to_be_visible(timeout=8000)
    expect(page.locator('#tela-carregando')).to_be_hidden()
    assert estado(page) != 1
    assert not any(m.get('acao') == 'historico' for m in page.evaluate('window.__msgs'))
    page.click('#gestos-ok')
    esperar(lambda: estado(page) == 1, msg='tocando')
    hist = lambda: [m for m in page.evaluate('window.__msgs') if m.get('acao') == 'historico']
    esperar(lambda: any(m['evento'] == 'inicio' and m['video'] == 'HISTORICO00' for m in hist()), msg='histórico: início')
    assert len([m for m in hist() if m['evento'] == 'inicio']) == 1, hist()
    page.click('#btn-play')
    esperar(lambda: any(m['evento'] == 'progresso' for m in hist()), msg='histórico: progresso ao pausar')
    page.evaluate("window.ldHistorico('início registrado: HTTP 204')")
    assert 'início registrado' in page.evaluate('window.__ld.textoDiagnostico()')
    # voltar do celular na explicação (vídeo novo) sai do vídeo
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=HISTORICO01')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    page.click('#idioma-ok')
    expect(page.locator('#tela-gestos')).to_be_visible(timeout=8000)
    assert page.evaluate('window.ldVoltar()') == 'ok'
    expect(page.locator('#tela-gestos')).to_be_hidden()
    expect(page.locator('#tela-assistir')).to_be_hidden()

    # Vídeo já salvo tocado no histórico: a explicação aparece na hora (vídeo escuro por trás, sem o botão
    # de tocar); ao Concluir, entrada suave e o vídeo toca sozinho.
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=HISTORICO00')")
    expect(page.locator('#tela-gestos')).to_be_visible(timeout=6000)
    expect(page.locator('#tela-idioma')).to_be_hidden()
    expect(page.locator('#btn-tocar-grande')).to_be_hidden()
    assert page.evaluate("document.querySelector('#area-video').classList.contains('antes-da-entrada')")
    time.sleep(0.8)
    assert estado(page) != 1  # espera a explicação
    page.click('#gestos-ok')
    esperar(lambda: estado(page) == 1, msg='vídeo salvo tocando sozinho depois de Concluir')
    assert page.evaluate("document.querySelector('#area-video').classList.contains('entrada-suave')")
    assert not page.evaluate("document.querySelector('#area-video').classList.contains('antes-da-entrada')")
    # Com "não mostrar mais": entrada suave já no toque e o vídeo começa sozinho
    page.evaluate("window.__ld.S.ajustes.gestosExplicados = true")
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=HISTORICO00')")
    esperar(lambda: page.evaluate("document.querySelector('#area-video').classList.contains('entrada-suave')"), msg='entrada suave no toque')
    expect(page.locator('#tela-gestos')).to_be_hidden()
    expect(page.locator('#btn-tocar-grande')).to_be_hidden()
    esperar(lambda: estado(page) == 1, msg='vídeo salvo tocando sozinho')
    assert not erros, erros
    ctx.close()


@caso('18. Ajustes de 22/11 (1 e 2): permissão de notificações e erros explicados no download')
def t_permissao_erros(browser, base):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    pasta_modelo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'modelo')
    falhar = {'n': 0}
    locais = {}

    def local(route):
        n = route.request.url.split('__ld_modelo/')[1].split('?')[0]
        if falhar['n'] > 0:  # a leitura do arquivo do app falha (como o "Cache.put ... network error")
            falhar['n'] -= 1
            route.abort('failed')
            return
        url = locais.get(n)
        if url.endswith('.wasm'):
            caminho = os.path.join(RAIZ, 'vendor', 'ort', 'ort-wasm-simd-threaded.wasm')
        else:
            caminho = os.path.join(pasta_modelo, 'falso.onnx' if url.endswith('.onnx') else 'falso.spmodel')
        with open(caminho, 'rb') as f:
            route.fulfill(status=200, body=f.read(), headers={'Content-Type': 'application/octet-stream'})
    page.route('**/__ld_modelo/**', local)
    page.goto(base + '?mock=1&app=android&apk=10&mockSoAsr=1&mockPalavras=1')
    page.evaluate("window.ldModelosEstado(JSON.stringify({ estado: 'nada' }))")
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=PERMISSAO00')")
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    page.evaluate(f"""(() => {{ const p = window.__ld.PACOTES.en;
      p.bytesModelo = {os.path.getsize(os.path.join(pasta_modelo, 'falso.onnx'))};
      p.bytesSp = {os.path.getsize(os.path.join(pasta_modelo, 'falso.spmodel'))}; }})()""")
    cartao = page.locator('#cartao-pontuacao')
    pedidos = lambda: [m for m in page.evaluate('window.__msgs') if m.get('acao') == 'baixarModelos']
    cartao.locator('.pm-baixar').click()
    esperar(lambda: len(pedidos()) == 1, msg='pediu o download')
    # o app pergunta a permissão
    page.evaluate("window.ldModelosEstado(JSON.stringify({ id: 'en', estado: 'pedindoPermissao', bloqueado: false }))")
    expect(cartao.locator('.pm-texto')).to_contain_text('Permitir')
    expect(cartao.locator('.pm-baixar')).to_be_hidden()
    # negou: explica e oferece tentar de novo (o app pergunta de novo)
    page.evaluate("window.ldModelosEstado(JSON.stringify({ id: 'en', estado: 'semPermissao', bloqueado: false }))")
    expect(cartao).to_have_attribute('data-estado', 'erro')
    expect(cartao.locator('.pm-estado')).to_have_text('Falta permissão')
    expect(cartao.locator('.pm-texto')).to_contain_text('notificações')
    expect(cartao.locator('.pm-baixar')).to_have_text('Tentar de novo')
    page.screenshot(path=os.path.join(CAPTURAS, 'android-permissao-negada.png'))
    cartao.locator('.pm-baixar').click()
    esperar(lambda: len(pedidos()) == 2, msg='pediu de novo')
    # negou de vez: o Android não pergunta mais → abrir configurações
    page.evaluate("window.ldModelosEstado(JSON.stringify({ id: 'en', estado: 'semPermissao', bloqueado: true }))")
    expect(cartao.locator('.pm-baixar')).to_have_text('Abrir configurações')
    expect(cartao.locator('.pm-texto')).to_contain_text('configurações')
    page.screenshot(path=os.path.join(CAPTURAS, 'android-permissao-bloqueada.png'))
    cartao.locator('.pm-baixar').click()
    esperar(lambda: len(pedidos()) == 3, msg='pediu de novo (o app abre as configurações)')
    # permitiu: baixando
    pedido = pedidos()[-1]
    total = sum(a['bytes'] for a in pedido['arquivos'])
    page.evaluate(f"window.ldModelosEstado(JSON.stringify({{ id: 'en', estado: 'baixando', feitos: 0, total: {total} }}))")
    expect(cartao).to_have_attribute('data-estado', 'baixando')
    # erro técnico do app (em inglês, com detalhe): a tela mostra a explicação, o detalhe vai ao diagnóstico
    page.evaluate("window.ldModelosEstado(JSON.stringify({ id: 'en', estado: 'erro', erro: 'unexpected end of stream on https://huggingface.co/...', detalhe: 'IOException: unexpected end of stream' }))")
    expect(cartao.locator('.pm-texto')).not_to_contain_text('unexpected')
    expect(cartao.locator('.pm-texto')).to_contain_text('Tentar de novo')
    assert 'unexpected end of stream' in page.evaluate('window.__ld.textoDiagnostico()')
    # o app terminou, mas guardar falha as 3 vezes: mensagem clara; "Tentar de novo" guarda sem baixar outra vez
    arquivos = []
    for i, a in enumerate(pedido['arquivos']):
        locais[str(i)] = a['url']
        arquivos.append({'url': a['url'], 'bytes': a['bytes'], 'local': f'{base}__ld_modelo/{i}'})
    falhar['n'] = 3
    page.evaluate("(e) => window.ldModelosEstado(JSON.stringify(e))",
                  {'id': 'en', 'estado': 'pronto', 'feitos': total, 'total': total, 'arquivos': arquivos})
    expect(cartao).to_have_attribute('data-estado', 'erro', timeout=20000)
    texto = cartao.locator('.pm-texto').inner_text()
    assert 'não precisa baixar outra vez' in texto and 'Cache' not in texto and 'Failed' not in texto, texto
    expect(cartao.locator('.pm-baixar')).to_have_text('Tentar de novo')
    page.screenshot(path=os.path.join(CAPTURAS, 'android-guardar-falhou.png'))
    assert not any(m.get('acao') == 'apagarModelos' for m in page.evaluate('window.__msgs'))  # guardou os arquivos
    n = len(pedidos())
    falhar['n'] = 1  # 1 falha: a nova tentativa interna (caminho direto) resolve
    cartao.locator('.pm-baixar').click()
    expect(cartao).to_have_attribute('data-estado', 'pronto', timeout=20000)
    assert len(pedidos()) == n  # não pediu outro download
    esperar(lambda: any(m.get('acao') == 'apagarModelos' for m in page.evaluate('window.__msgs')), msg='apagou a cópia do app')
    assert not erros, erros
    ctx.close()


@caso('19. Ajustes de 22/11 (3): demonstração com 3 falas, aviso de reconexão, histórico preparado ao abrir')
def t_ajustes_22_11_3(browser, base, en, pt):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.goto(base + '?mock=1&gestos=1')
    page.fill('#campo-link', f'https://youtu.be/{ID}')
    page.set_input_files('#arq-estudo', [en, pt])
    page.click('#btn-abrir')
    page.click('#btn-tocar-grande')
    expect(page.locator('#tela-gestos')).to_be_visible()
    # Demonstração: 3 falas em inglês no estilo lista, sem o ícone de play e sem o aviso da pausa
    assert page.locator('.demo-play').count() == 0
    assert page.locator('.demo-linha').count() == 5
    assert 'Com o vídeo pausado' not in page.inner_text('#tela-gestos')
    trilha_y = lambda: page.evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.demo-trilha')).transform).m42")
    y0 = trilha_y()
    time.sleep(1.2)  # depois do 1º deslize rápido (da esquerda para a direita): retrocede, a lista desce
    assert trilha_y() > y0 + 30, (y0, trilha_y())
    page.click('#gestos-ok')
    esperar(lambda: estado(page) == 1, msg='tocando')
    # Sem internet com o vídeo ainda andando (o que já foi baixado): sem aviso
    page.evaluate("window.ldRede('0')")
    time.sleep(0.8)
    assert page.locator('#aviso-rede').is_hidden()
    # Sem internet e o vídeo parado: aviso animado; a internet volta: o aviso some
    page.click('#btn-play')
    esperar(lambda: estado(page) == 2, msg='pausou')
    expect(page.locator('#aviso-rede')).to_be_visible(timeout=4000)
    expect(page.locator('#aviso-rede-titulo')).to_have_text('Sem Internet. Tentando reconectar…')
    page.evaluate("window.ldRede('1')")
    expect(page.locator('#aviso-rede')).to_be_hidden(timeout=4000)
    page.click('#btn-play')
    esperar(lambda: estado(page) == 1, msg='tocando de novo')
    time.sleep(1.2)  # a volta da internet já pede o trecho de novo (0,8 s depois): conta só os pedidos seguintes
    # Internet fraca: o vídeo "tocando" e o tempo parado (carregando) → aviso e novo pedido do trecho
    pedidos = lambda: page.evaluate('window.__ld.textoDiagnostico()').count('pedindo o trecho de novo')
    n0 = pedidos()
    page.evaluate("""() => { const p = window.__ld.S.player; window.__tParado = p.tempo();
      p.__estadoOriginal = p.estado; p.estado = () => 3; p.__tempoOriginal = p.tempo; p.tempo = () => window.__tParado;
      window.__irPara = 0; const ir = p.irPara.bind(p); p.irPara = (x, b) => { window.__irPara++; return ir(x, b); }; }""")
    expect(page.locator('#aviso-rede')).to_be_visible(timeout=5000)
    expect(page.locator('#aviso-rede-titulo')).to_have_text('Internet fraca. Tentando reconectar…')
    esperar(lambda: pedidos() > n0, limite=14, msg='pediu o trecho de novo')
    assert page.evaluate('window.__irPara') >= 1
    page.evaluate("() => { const p = window.__ld.S.player; p.estado = p.__estadoOriginal; p.tempo = p.__tempoOriginal; }")
    expect(page.locator('#aviso-rede')).to_be_hidden(timeout=5000)
    # 23/11: sair do app e voltar não mostra o aviso falso. O "parado desde" de antes de sair não conta, e o
    # app Android (versão 14) é chamado para conferir a internet de novo.
    page.evaluate('''() => { window.__ld.S.rede.travadoDesde = performance.now() - 60000;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange')); }''')
    assert page.evaluate('window.__ld.S.rede.travadoDesde') == 0
    # o player retomando devagar (carregando, tempo parado) dentro da carência: sem aviso
    page.evaluate('''() => { const p = window.__ld.S.player; window.__tParado = p.tempo();
      p.__estadoOriginal = p.estado; p.estado = () => 3; p.__tempoOriginal = p.tempo; p.tempo = () => window.__tParado; }''')
    time.sleep(3.0)
    assert page.locator('#aviso-rede').is_hidden(), 'aviso de reconectar logo depois de voltar ao app'
    page.evaluate("() => { const p = window.__ld.S.player; p.estado = p.__estadoOriginal; p.tempo = p.__tempoOriginal; }")
    ctx.close()

    # App Android 11: ao abrir o vídeo, o app já prepara o registro no histórico
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&app=android&apk=11&mockSoAsr=1')
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=HISTORICO02')")
    hist = lambda: [m for m in page.evaluate('window.__msgs') if m.get('acao') == 'historico']
    esperar(lambda: any(m['evento'] == 'preparar' and m['video'] == 'HISTORICO02' for m in hist()), msg='histórico: preparar')
    ctx.close()
    assert not erros, erros


@caso('10. Capturas de tela nos quatro tamanhos')
def t_capturas(browser, url, en, pt):
    os.makedirs(CAPTURAS, exist_ok=True)
    tamanhos = [(384, 854, 'celular-em-pe-384'), (412, 915, 'celular-em-pe-412'),
                (915, 412, 'celular-deitado-915'), (1366, 768, 'notebook-1366')]
    for w, h, nome in tamanhos:
        ctx = browser.new_context(locale='pt-BR', viewport={'width': w, 'height': h}, device_scale_factor=1,
                                  has_touch=w < 1000, is_mobile=False)
        page = ctx.new_page()
        page.goto(url)
        page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-biblioteca-vazia.png'))
        page.fill('#campo-link', f'https://youtu.be/{ID}')
        page.set_input_files('#arq-estudo', [en, pt])
        page.click('#btn-abrir')
        page.click('#btn-tocar-grande')
        esperar(lambda: estado(page) == 1, msg='tocando')
        page.evaluate('window.__ld.S.player.irPara(22.6)')
        time.sleep(0.6)
        page.evaluate('window.__ld.S.player.pausar()')
        time.sleep(0.3)
        page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-assistir.png'))
        page.click('#btn-traducao')
        time.sleep(0.2)
        page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-menu-traducao.png'))
        page.click('#menu-traducao [data-modo="desligada"]')
        time.sleep(0.2)
        page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-so-original.png'))
        page.click('#btn-traducao')
        page.click('#menu-traducao [data-modo="sempre"]')
        if nome != 'celular-deitado-915':
            expect(page.locator('#btn-modo-legenda')).to_have_attribute('aria-pressed', 'true')  # lista é o padrão
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-lista.png'))
            page.click('#btn-ab')  # tela de escolha do trecho, pelo fluxo real
            time.sleep(0.3)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-ab-escolher-a.png'))
            i = page.evaluate('window.__ld.S.exibida')
            page.locator(f'#ab-lista .ab-fala[data-i="{i}"]').click()
            time.sleep(0.2)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-ab-escolher-b.png'))
            page.locator(f'#ab-lista .ab-fala[data-i="{i + 1}"]').click()
            time.sleep(0.3)
            page.evaluate('window.__ld.S.player.pausar()')
            time.sleep(0.3)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-lista-ab-ativo.png'))
            page.click('#btn-ab')
            page.click('#btn-modo-legenda')
            time.sleep(0.3)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-uma-fala.png'))
        if w < 900:
            page.click('#btn-ajustes')
            time.sleep(0.3)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-ajustes.png'))
            page.click('#btn-fechar-ajustes')
        if nome != 'celular-deitado-915':  # deitado: a caixa de legenda fica escondida
            page.locator('#caixa-l1 .palavra').first.click()
            time.sleep(0.2)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-cartao.png'))
        page.go_back()
        time.sleep(0.3)
        page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-biblioteca.png'))
        ctx.close()


@caso('20. Ajustes de 22/11 (4): toque no vídeo avisa o app sem o YouTube navegar; abas sem a animação antiga (v15); 1 s entre as janelas')
def t_ajustes_22_11_4(browser, base):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'app', 'src', 'main', 'assets', 'youtube.js')
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__yt = []; window.LDYoutube = { postMessage: (m) => window.__yt.push(m) };")
    ctx.add_init_script(path=script)
    page = ctx.new_page()
    page.goto(base + 'tests/fixtures/nao_legenda.txt')
    page.evaluate("""() => {
      window.__navegou = 0;
      document.body.innerHTML = `
        <ytm-browse><a id="v1" href="https://m.youtube.com/watch?v=abcdefghijk"><span id="miniatura">Vídeo</span></a>
          <a id="v2" href="https://m.youtube.com/watch?v=zzzzzzzzzzz"><button id="menu">⋮</button></a>
          <a id="canal" href="https://m.youtube.com/@canal">Canal</a>
          <a id="local" href="/watch?v=localocalxx">Fora do YouTube</a></ytm-browse>`;
      // o "YouTube" abriria a página do vídeo no clique (fase de bolha)
      document.addEventListener('click', (e) => { if (e.target.closest('a')) { window.__navegou++; e.preventDefault(); } });
    }""")
    page.click('#miniatura')
    assert page.evaluate('window.__yt') == ['https://m.youtube.com/watch?v=abcdefghijk'], page.evaluate('window.__yt')
    assert page.evaluate('window.__navegou') == 0  # o YouTube não chegou a abrir o vídeo
    page.click('#menu')  # botão dentro do cartão: continua com o YouTube
    page.click('#canal')  # link que não é vídeo: continua com o YouTube
    page.click('#local')  # endereço fora do YouTube: não conta como vídeo
    assert len(page.evaluate('window.__yt')) == 1
    assert page.evaluate('window.__navegou') == 3
    # Abas: a animação antiga (v14, piscava) não volta, e trocar de endereço sem tocar numa aba não anima.
    # A animação da versão 16 (toque na aba, igual ao app oficial) é testada em tests/youtube_aba_test.py.
    page.evaluate("history.replaceState(null, '', '/')")
    for caminho in ['/feed/you', '/', '/feed/history']:
        page.evaluate(f"history.pushState(null, '', '{caminho}')")
        for _ in range(4):
            time.sleep(0.1)
            assert page.evaluate("getComputedStyle(document.querySelector('ytm-browse')).opacity") == '1', caminho
            assert not page.evaluate("document.documentElement.classList.contains('ld-saindo') || document.documentElement.classList.contains('ld-entrando') || document.documentElement.classList.contains('ld-aba')")
    ctx.close()

    # App Android, vídeo novo: a explicação dos gestos só aparece 1 s depois de a janela do idioma sair
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915})
    ctx.add_init_script("window.__msgs = []; window.LDNativo = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };")
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&gestos=1&app=android&apk=14&mockSoAsr=1')
    page.evaluate("window.__msgs.length = 0")
    page.evaluate("window.ldAbrirDoYoutube('https://m.youtube.com/watch?v=PAUSAJANELA')")
    # 23/11: vindo do YouTube, a página troca de tela na hora e avisa o app (que só então faz a animação)
    esperar(lambda: any(m.get('acao') == 'telaPronta' for m in page.evaluate('window.__msgs')), msg='telaPronta')
    assert page.locator('#tela-assistir').is_visible()
    expect(page.locator('#tela-idioma')).to_be_visible(timeout=6000)
    page.click('#idioma-ok')
    t0 = time.time()
    expect(page.locator('#tela-gestos')).to_be_visible(timeout=8000)
    passou = time.time() - t0
    assert passou >= 1.1, f'a explicação apareceu {passou:.2f} s depois da escolha do idioma'
    expect(page.locator('#tela-carregando')).to_be_hidden()
    page.click('#gestos-ok')
    esperar(lambda: estado(page) == 1, msg='tocando')
    assert not erros, erros
    ctx.close()


def main():
    srv, porta = subir_servidor()
    base = f'http://localhost:{porta}/'
    url = base + '?mock=1'
    pasta = tempfile.mkdtemp(prefix='ld-e2e-')
    en, pt = criar_legendas(pasta)
    erros = []
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = browser.new_context(locale='pt-BR', viewport={'width': 412, 'height': 915}, accept_downloads=True)
        page = ctx.new_page()
        page.on('pageerror', lambda e: erros.append(str(e)))
        page.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
        t_abrir(page, url, en, pt)
        t_tocar(page)
        t_arrastar(page)
        t_toque(page)
        t_teclas(page)
        t_folga(page)
        t_extras(page)
        t_repeticao(page)
        t_lista(page)
        t_ab_invalido(page)
        t_recarregar(page, url)
        t_backup(page, url, pasta)
        t_compartilhar(page, base)
        t_link_automatico(page, base, en, pt)
        t_traducao_auto(page, base, en)
        t_dupla(page, base, pasta)
        t_prototipo(page, base)
        ctx.close()
        t_capturas(browser, url, en, pt)
        t_android(browser, base)
        t_app_novo(browser, base)
        t_so_automatica(browser, base)
        t_velocidade_fina(browser, base)
        t_dublado(browser, base)
        t_pontuacao_modelo(browser, base)
        t_pontuacao_nativa(browser, base)
        t_interface_idioma(browser, base)
        t_ao_vivo_shorts(browser, base)
        t_gancho(browser, base)
        t_youtube_sem_shorts(browser, base)
        t_busca(browser, base)
        t_ajustes_22_11(browser, base, en, pt)
        t_permissao_erros(browser, base)
        t_ajustes_22_11_3(browser, base, en, pt)
        t_ajustes_22_11_4(browser, base)
        browser.close()
    srv.shutdown()
    shutil.rmtree(pasta, ignore_errors=True)
    erros = [e for e in erros if 'i.ytimg.com' not in e and 'Failed to load resource' not in e]
    if erros:
        print('Erros no console da página:')
        for e in erros:
            print('  ', e)
        sys.exit(1)
    print(f'\n{len(resultados)} casos passaram. Capturas em tests/capturas/')


if __name__ == '__main__':
    main()
