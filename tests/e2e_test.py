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


def segurar(page, seletor, ms=600):
    caixa = page.locator(seletor).bounding_box()
    x = caixa['x'] + caixa['width'] / 2
    y = caixa['y'] + caixa['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    time.sleep(ms / 1000)
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


@caso('4. Toque curto pausa e toca; segurar repete a fala')
def t_toque(page):
    esperar(lambda: estado(page) == 1, msg='tocando antes do toque')
    tocar_rapido(page, '#camada-gestos')
    esperar(lambda: estado(page) == 2, msg='pausou com toque')
    tocar_rapido(page, '#camada-gestos')
    esperar(lambda: estado(page) == 1, msg='voltou a tocar com toque')
    time.sleep(1.0)
    i = exibida(page)
    inicio = page.evaluate(f'window.__ld.S.unidades[{i}].s')
    segurar(page, '#camada-gestos', 650)
    expect(page.locator('#retorno-gesto')).to_have_text('↻ Repetindo')
    t = tempo(page)
    assert inicio - 0.3 <= t <= inicio + 0.6, (t, inicio)
    assert estado(page) == 1


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
    # tamanho das letras muda as duas linhas
    page.locator('[data-ajuste="fonteL1"]').fill('24')
    assert page.evaluate("getComputedStyle(document.querySelector('#caixa-l1')).fontSize") == '24px'
    assert page.evaluate("getComputedStyle(document.querySelector('#caixa-l2')).fontSize") == '20px'
    page.locator('[data-ajuste="fonteL1"]').fill('19')
    page.click('#btn-fechar-ajustes')


@caso('6. Cartão da palavra')
def t_extras(page):
    page.locator('#titulo-video').click()
    if estado(page) == 1:
        page.keyboard.press('Space')
    esperar(lambda: estado(page) == 2, msg='pausado')
    page.locator('#caixa-l1 .palavra').nth(1).click()
    expect(page.locator('#cartao-palavra')).to_be_visible()
    expect(page.locator('#cp-palavra')).to_have_text(page.locator('#caixa-l1 .palavra').nth(1).inner_text().strip(',.'))
    href = page.get_attribute('#cp-traduzir-palavra', 'href')
    assert href.startswith('https://translate.google.com/?sl=auto&tl=pt&text=') and href.endswith('&op=translate'), href
    page.click('#cp-fechar')
    expect(page.locator('#cartao-palavra')).to_be_hidden()
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
    if estado(page) == 1:
        page.click('#btn-play')
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
    page.fill('#dialogo-extra input', 'Aula de motores')
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
    expect(page.locator('#info-traducao')).to_have_text('Sem arquivo: o app traduz sozinho para o português.')
    page.click('#btn-abrir')
    # 1) o tradutor falha: aviso e botão para tentar de novo
    expect(page.locator('#aviso-legenda')).to_contain_text('Não consegui traduzir', timeout=15000)
    expect(page.locator('#btn-tentar-traducao')).to_be_visible()
    estado_falha['falhar'] = False
    page.click('#btn-tentar-traducao')
    expect(page.locator('#aviso-legenda')).to_contain_text('Tradução automática (português)', timeout=8000)
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
    expect(page.locator('#aviso-legenda')).to_contain_text('Tradução automática (português)')
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
    expect(page.locator('#aviso-legenda')).to_contain_text('Tradução automática (português)', timeout=8000)
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


@caso('12. App Android: só o link, escolha do idioma, legenda do YouTube e tradução do app')
def t_android(browser, base):
    from urllib.parse import quote
    ctx = browser.new_context(viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    erros = []
    page.on('pageerror', lambda e: erros.append(str(e)))
    falso_tradutor(page)
    page.goto(base + '?mock=1&app=android')
    expect(page.locator('#dica-android')).to_be_visible()
    page.fill('#campo-link', 'https://youtu.be/CCCCCCCCCCC')
    expect(page.locator('#btn-abrir')).to_be_enabled()  # sem arquivo: basta o link
    page.click('#btn-abrir')
    expect(page.locator('#tela-idioma')).to_be_visible()
    # sugerida: inglês feita por pessoa (a automática indica o idioma falado)
    expect(page.locator('#sel-legenda-video')).to_have_value('1')
    expect(page.locator('#sel-legenda-video option')).to_have_text(['Inglês (automática)', 'Inglês', 'Português (Brasil)'])
    expect(page.locator('#sel-traducao-video')).to_have_value('pt')
    os.makedirs(CAPTURAS, exist_ok=True)
    page.screenshot(path=os.path.join(CAPTURAS, 'android-escolha-idioma.png'))
    page.click('#idioma-ok')
    expect(page.locator('#tela-idioma')).to_be_hidden()
    expect(page.locator('#toast')).to_contain_text('40 falas')
    # a legenda do "anúncio" (outro vídeo) foi ignorada
    assert page.evaluate('window.__ld.S.unidades.length') == 40
    assert page.evaluate('window.__ld.S.registro.estudo.origem') == 'youtube'
    assert page.evaluate('window.__ld.S.player.legendasEscondidas') is True
    page.click('#btn-tocar-grande')
    esperar(lambda: estado(page) == 1, msg='tocando')
    expect(page.locator('#caixa-l1')).to_contain_text('from YouTube')
    expect(page.locator('#caixa-l2')).to_contain_text('PT: Line')  # tradução do app
    page.screenshot(path=os.path.join(CAPTURAS, 'android-assistir.png'))
    # trocar o idioma pelo ⚙ Ajustes
    page.click('#btn-ajustes')
    expect(page.locator('#btn-trocar-legenda')).to_be_visible()
    page.click('#btn-trocar-legenda')
    expect(page.locator('#tela-idioma')).to_be_visible()
    page.select_option('#sel-legenda-video', '0')
    page.click('#idioma-ok')
    esperar(lambda: page.evaluate('window.__ld.S.registro.estudo.arquivo').startswith('[Inglês (auto-generated)]'), msg='trocou para a automática')
    assert page.evaluate('window.__ld.S.frases') is True  # automática: frases montadas
    # volta para a biblioteca: o vídeo ficou salvo e reabre sem perguntar
    page.click('#btn-voltar')
    expect(page.locator('.item-bib')).to_have_count(1)
    page.fill('#campo-link', 'https://youtu.be/CCCCCCCCCCC')
    page.click('#btn-abrir')
    esperar(lambda: page.evaluate('window.__ld.S.unidades.length') > 0, msg='reabriu com a legenda salva')
    time.sleep(0.3)
    expect(page.locator('#tela-idioma')).to_be_hidden()
    page.click('#btn-voltar')
    # compartilhar do app do YouTube: abre direto e pergunta o idioma
    page.goto(base + '?mock=1&text=' + quote('Olha https://youtu.be/DDDDDDDDDDD'))
    expect(page.locator('#tela-assistir')).to_be_visible()
    expect(page.locator('#tela-idioma')).to_be_visible()
    page.click('#idioma-cancelar')
    expect(page.locator('#toast')).to_contain_text('Trocar o idioma da legenda')
    assert not erros, erros
    ctx.close()


@caso('13. App Android: busca no YouTube com filtros e vídeo tocado lá abre aqui')
def t_busca(browser, base):
    # fora do app: o cartão de busca não aparece
    ctx = browser.new_context(viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    page.goto(base + '?mock=1')
    expect(page.locator('#area-busca')).to_be_hidden()
    ctx.close()
    # app antigo (sem ?apk=3): pede para atualizar
    ctx = browser.new_context(viewport={'width': 412, 'height': 915})
    page = ctx.new_page()
    page.goto(base + '?mock=1&app=android')
    expect(page.locator('#area-busca')).to_be_visible()
    expect(page.locator('#busca-atualizar')).to_be_visible()
    expect(page.locator('#form-busca')).to_be_hidden()
    ctx.close()
    # app novo, com a ponte LDNativo simulada
    ctx = browser.new_context(viewport={'width': 412, 'height': 915})
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
    expect(page.locator('#toast')).to_contain_text('40 falas')
    assert page.evaluate('window.__ld.S.registro.id') == 'FFFFFFFFFFF'
    assert not erros, erros
    ctx.close()


@caso('10. Capturas de tela nos quatro tamanhos')
def t_capturas(browser, url, en, pt):
    os.makedirs(CAPTURAS, exist_ok=True)
    tamanhos = [(384, 854, 'celular-em-pe-384'), (412, 915, 'celular-em-pe-412'),
                (915, 412, 'celular-deitado-915'), (1366, 768, 'notebook-1366')]
    for w, h, nome in tamanhos:
        ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1,
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
            page.click('#btn-modo-legenda')
            time.sleep(0.3)
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
        ctx = browser.new_context(viewport={'width': 412, 'height': 915}, accept_downloads=True)
        page = ctx.new_page()
        page.on('pageerror', lambda e: erros.append(str(e)))
        page.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
        t_abrir(page, url, en, pt)
        t_tocar(page)
        t_arrastar(page)
        t_toque(page)
        t_teclas(page)
        t_extras(page)
        t_repeticao(page)
        t_lista(page)
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
        t_busca(browser, base)
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
