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
    page.set_input_files('#arq-estudo', [pt, en])  # português primeiro: o app deve trocar sozinho
    expect(page.locator('#info-estudo')).to_contain_text('[English]')
    expect(page.locator('#info-estudo')).to_contain_text('40 falas lidas')
    expect(page.locator('#info-traducao')).to_contain_text('[Portuguese]')
    page.click('#btn-trocar-papeis')
    expect(page.locator('#info-estudo')).to_contain_text('[Portuguese]')
    page.click('#btn-trocar-papeis')
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
    expect(page.locator('.item-fala.atual .a')).to_have_text('Line 1 of the test, with words.')


@caso('3. Arrastar sobre o vídeo e sobre a caixa de legenda')
def t_arrastar(page):
    i0 = exibida(page)
    arrastar(page, '#camada-gestos', 150)  # direita = avançar
    esperar(lambda: exibida(page) == i0 + 1, msg='avançou pelo vídeo')
    arrastar(page, '#camada-gestos', 150)
    esperar(lambda: exibida(page) == i0 + 2, msg='avançou de novo')
    arrastar(page, '#camada-gestos', -150)  # esquerda = voltar
    esperar(lambda: exibida(page) == i0 + 1, msg='voltou pelo vídeo')
    arrastar(page, '#caixa-legenda', 150)
    esperar(lambda: exibida(page) == i0 + 2, msg='avançou pela caixa')
    arrastar(page, '#caixa-legenda', -150)
    esperar(lambda: exibida(page) == i0 + 1, msg='voltou pela caixa')
    # três arrastos rápidos para a esquerda voltam exatamente três falas
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowRight')
    esperar(lambda: exibida(page) == i0 + 4, msg='três à frente')
    time.sleep(0.9)
    for _ in range(3):
        arrastar(page, '#camada-gestos', -150)
    esperar(lambda: exibida(page) == i0 + 1, msg='três para trás')
    # inverter direção do arraste
    page.evaluate("window.__ld.S.ajustes.inverterArraste = true")
    time.sleep(0.9)
    arrastar(page, '#camada-gestos', 150)
    esperar(lambda: exibida(page) == i0, msg='invertido: direita volta')
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


@caso('5. Teclas Espaço, ←, →, R, P, L, 1, 2, [ e ]')
def t_teclas(page):
    page.locator('#titulo-video').click()  # tira o foco de campos
    page.keyboard.press('Space')
    esperar(lambda: estado(page) == 2, msg='Espaço pausa')
    page.keyboard.press('Space')
    esperar(lambda: estado(page) == 1, msg='Espaço toca')
    i = exibida(page)
    page.keyboard.press('ArrowRight')
    esperar(lambda: exibida(page) == i + 1, msg='→ avança')
    time.sleep(0.9)
    page.keyboard.press('ArrowLeft')
    esperar(lambda: exibida(page) == i, msg='← volta')
    time.sleep(0.9)
    t_antes = tempo(page)
    page.keyboard.press('Shift+ArrowRight')
    esperar(lambda: tempo(page) >= t_antes + 4.5, msg='Shift+→ pula 5 s')
    page.keyboard.press('r')
    expect(page.locator('#retorno-gesto')).to_have_text('↻ Repetindo')
    page.keyboard.press('p')
    expect(page.locator('#btn-pausa-auto')).to_have_attribute('aria-pressed', 'true')
    page.keyboard.press('p')
    expect(page.locator('#btn-pausa-auto')).to_have_attribute('aria-pressed', 'false')
    page.keyboard.press('l')
    expect(page.locator('#btn-loop')).to_have_attribute('aria-pressed', 'true')
    page.keyboard.press('l')
    expect(page.locator('#btn-loop')).to_have_attribute('aria-pressed', 'false')
    page.keyboard.press('1')
    expect(page.locator('#btn-linha1')).to_have_text('Linha 1: borrada')
    expect(page.locator('#caixa-l1')).to_have_class('linha l1 borrada')
    page.keyboard.press('1')
    expect(page.locator('#btn-linha1')).to_have_text('Linha 1: oculta')
    page.keyboard.press('1')
    expect(page.locator('#btn-linha1')).to_have_text('Linha 1: visível')
    page.keyboard.press('2')
    expect(page.locator('#btn-linha2')).to_have_text('Linha 2: borrada')
    page.keyboard.press('2')
    page.keyboard.press('2')
    expect(page.locator('#btn-linha2')).to_have_text('Linha 2: visível')
    page.keyboard.press(']')
    expect(page.locator('#btn-velocidade')).to_have_text('1,25×')
    page.keyboard.press('[')
    expect(page.locator('#btn-velocidade')).to_have_text('1×')


@caso('6. Pausa automática pausa no fim da fala')
def t_pausa_auto(page):
    page.locator('#titulo-video').click()
    page.keyboard.press('p')
    i = exibida(page)
    page.keyboard.press('ArrowRight')
    esperar(lambda: estado(page) == 1, msg='tocando')
    alvo = i + 1
    fim = page.evaluate(f'window.__ld.S.unidades[{alvo}].e')
    esperar(lambda: estado(page) == 2, limite=5, msg='pausa automática')
    t = tempo(page)
    assert fim - 0.25 <= t <= fim + 0.1, (t, fim)
    assert exibida(page) == alvo
    # depois da pausa automática, R repete a fala que acabou de tocar (não a próxima)
    page.evaluate(f'window.__ld.S.player.irPara(window.__ld.S.unidades[{alvo}].e - 0.02)')
    time.sleep(0.2)
    assert exibida(page) == alvo, exibida(page)
    page.evaluate("window.__ld.S.ajustes.tocarAoNavegar = false")
    page.keyboard.press('r')
    time.sleep(0.2)
    ini = page.evaluate(f'window.__ld.S.unidades[{alvo}].s')
    assert abs(tempo(page) - (ini - 0.15)) < 0.05, (tempo(page), ini)
    page.evaluate("window.__ld.S.ajustes.tocarAoNavegar = true")
    page.evaluate(f'window.__ld.S.player.irPara(window.__ld.S.unidades[{alvo}].e - 0.12)')
    page.evaluate(f'window.__ld.S.pausadaEm = {alvo}')
    # tocar de novo segue para a próxima fala sem pausar logo em seguida
    page.keyboard.press('Space')
    esperar(lambda: exibida(page) == alvo + 1, limite=3, msg='seguiu para a próxima')
    esperar(lambda: estado(page) == 2, limite=4, msg='pausou no fim da próxima')
    page.keyboard.press('p')  # desliga
    # os atalhos continuam valendo depois de mexer na barra de progresso
    page.locator('#barra-progresso').click()
    st = estado(page)
    page.keyboard.press('Space')
    esperar(lambda: estado(page) != st, msg='Espaço depois da barra')
    if estado(page) != 1:
        page.keyboard.press('Space')
    page.evaluate('window.__ld.S.player.irPara(5)')  # o clique na barra levou para o meio do vídeo
    time.sleep(0.3)


@caso('7. Loop com contador 2: a fala toca duas vezes e segue')
def t_loop(page):
    page.click('#btn-ajustes')
    page.select_option('select[data-ajuste="loopVezes"]', '2')
    page.click('#btn-fechar-ajustes')
    page.locator('#titulo-video').click()
    page.keyboard.press(']')
    page.keyboard.press(']')
    page.keyboard.press(']')  # 1,75×
    expect(page.locator('#btn-velocidade')).to_have_text('1,75×')
    i = exibida(page)
    page.keyboard.press('ArrowRight')
    alvo = i + 1
    esperar(lambda: estado(page) == 1, msg='tocando')
    page.keyboard.press('l')
    expect(page.locator('#btn-loop')).to_have_attribute('aria-pressed', 'true')
    inicio = page.evaluate(f'window.__ld.S.unidades[{alvo}].s')
    voltas = 0
    ultimo = tempo(page)
    fim_t = time.time() + 6
    while time.time() < fim_t:
        t = tempo(page)
        if t < ultimo - 0.5:
            voltas += 1
            assert abs(t - inicio) < 0.6, (t, inicio)
        ultimo = t
        if exibida(page) == alvo + 1:
            break
        time.sleep(0.03)
    assert voltas == 1, f'voltou {voltas} vezes (esperado 1: tocou 2 vezes)'
    esperar(lambda: exibida(page) == alvo + 1, msg='seguiu para a próxima')
    expect(page.locator('#btn-loop')).to_have_attribute('aria-pressed', 'false')
    page.keyboard.press('[')
    page.keyboard.press('[')
    page.keyboard.press('[')
    expect(page.locator('#btn-velocidade')).to_have_text('1×')


@caso('7b. Cartão da palavra, linha borrada, busca e trecho A–B')
def t_extras(page):
    page.locator('#titulo-video').click()
    if estado(page) == 1:
        page.keyboard.press('Space')
    esperar(lambda: estado(page) == 2, msg='pausado')
    page.locator('#caixa-l1 .palavra').nth(1).click()
    expect(page.locator('#cartao-palavra')).to_be_visible()
    expect(page.locator('#cp-palavra')).to_have_text(page.locator('#caixa-l1 .palavra').nth(1).inner_text().strip(',.'))
    href = page.get_attribute('#cp-traduzir-palavra', 'href')
    assert href.startswith('https://translate.google.com/?sl=en&tl=pt&text=') and href.endswith('&op=translate'), href
    page.click('#cp-fechar')
    expect(page.locator('#cartao-palavra')).to_be_hidden()
    # linha borrada: o primeiro toque só revela
    page.keyboard.press('1')
    expect(page.locator('#caixa-l1')).to_have_class('linha l1 borrada')
    page.locator('#caixa-l1 .palavra').first.click()
    expect(page.locator('#caixa-l1')).to_have_class('linha l1')
    expect(page.locator('#cartao-palavra')).to_be_hidden()
    page.keyboard.press('1')
    page.keyboard.press('1')
    # busca sem acento acha texto com acento
    page.fill('#busca-falas', 'ACAO')
    expect(page.locator('.item-fala')).to_have_count(40)
    page.fill('#busca-falas', 'Linha 12 ')
    expect(page.locator('.item-fala')).to_have_count(1)
    page.fill('#busca-falas', '')
    expect(page.locator('.item-fala')).to_have_count(40)
    # A–B
    page.locator('.item-fala').nth(4).click()
    esperar(lambda: exibida(page) == 4, msg='foi para a fala 5')
    page.click('#btn-a')
    page.locator('.item-fala').nth(5).click()
    esperar(lambda: exibida(page) == 5, msg='foi para a fala 6')
    page.click('#btn-b')
    expect(page.locator('#info-ab')).to_contain_text('A em')
    page.keyboard.press(']')
    page.keyboard.press(']')
    page.keyboard.press(']')
    page.keyboard.press(']')  # 2×
    if estado(page) != 1:
        page.locator('#titulo-video').click()
        page.keyboard.press('Space')
    voltou = False
    fim_t = time.time() + 5
    ultimo = tempo(page)
    while time.time() < fim_t:
        t = tempo(page)
        if t < ultimo - 1:
            voltou = True
            break
        ultimo = t
        time.sleep(0.03)
    assert voltou, 'o trecho A–B não repetiu'
    assert exibida(page) in (3, 4), exibida(page)  # pode mostrar a anterior durante a pré-rolagem
    page.click('#btn-limpar-ab')
    for _ in range(4):
        page.keyboard.press('[')
    expect(page.locator('#btn-velocidade')).to_have_text('1×')


@caso('8. Recarregar: vídeo na biblioteca, posição e ajustes mantidos')
def t_recarregar(page, url):
    page.locator('#titulo-video').click()
    page.keyboard.press(']')  # 1,25× para conferir que fica salvo
    expect(page.locator('#btn-velocidade')).to_have_text('1,25×')
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
    expect(page.locator('#btn-velocidade')).to_have_text('1,25×')
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


@caso('9c. Lista virtual com 1.200 falas segue a fala atual')
def t_lista_grande(page, base, pasta):
    linhas = []
    for i in range(1200):
        s = i * 0.5
        linhas.append(f'{i + 1}\n{ts(s)} --> {ts(s + 0.45)}\nfala {i + 1}\n')
    caminho = os.path.join(pasta, 'grande.srt')
    with open(caminho, 'w', encoding='utf-8') as f:
        f.write('\n'.join(linhas))
    page.goto(base + '?mock=1')
    page.fill('#campo-link', 'https://youtu.be/AAAAAAAAAAA')
    page.set_input_files('#arq-estudo', [caminho])
    page.click('#btn-abrir')
    page.click('#btn-tocar-grande')
    esperar(lambda: estado(page) == 1, msg='tocando')
    assert page.evaluate('window.__ld.S.unidades.length') == 1200
    n_dom = page.locator('.item-fala').count()
    assert n_dom < 1200, n_dom
    page.evaluate('window.__ld.S.player.irPara(500.1)')
    esperar(lambda: page.evaluate("document.querySelector('.item-fala.atual')?.dataset.i") is not None, msg='destaque')
    i_atual = int(page.evaluate("document.querySelector('.item-fala.atual').dataset.i"))
    assert i_atual == exibida(page), (i_atual, exibida(page))
    time.sleep(1.0)
    visivel = page.evaluate("""(() => { const c = document.querySelector('#lista-falas').getBoundingClientRect();
        const r = document.querySelector('.item-fala.atual').getBoundingClientRect();
        return r.top >= c.top && r.bottom <= c.bottom; })()""")
    assert visivel, 'fala atual fora da área visível da lista'
    page.click('#btn-voltar')


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
        if w < 900:
            page.click('#btn-ajustes')
            time.sleep(0.3)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-ajustes.png'))
            page.click('#btn-fechar-ajustes')
        if nome == 'celular-deitado-915':
            page.click('#btn-lista')
            time.sleep(0.3)
            page.screenshot(path=os.path.join(CAPTURAS, f'{nome}-lista.png'))
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
        t_pausa_auto(page)
        t_loop(page)
        t_extras(page)
        t_recarregar(page, url)
        t_backup(page, url, pasta)
        t_compartilhar(page, base)
        t_lista_grande(page, base, pasta)
        ctx.close()
        t_capturas(browser, url, en, pt)
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
