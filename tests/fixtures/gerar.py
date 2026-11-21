# Gera os arquivos de teste SINTÉTICOS (texto inventado, sem direitos autorais).
# Uso: python3 tests/fixtures/gerar.py   (a partir da raiz do projeto)
import os

PASTA = os.path.dirname(os.path.abspath(__file__))


def ts(seg, sep=','):
    ms = round(seg * 1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}'


def srt(falas, numeros=True, final='\n'):
    blocos = []
    for i, (s, e, t) in enumerate(falas, 1):
        b = (f'{i}\n' if numeros else '') + f'{ts(s)} --> {ts(e)}\n{t}'
        blocos.append(b)
    return '\n\n'.join(blocos) + final


def salvar(nome, texto, cod='utf-8', bom=False, crlf=False):
    if crlf:
        texto = texto.replace('\n', '\r\n')
    dados = texto.encode(cod)
    if bom:
        dados = b'\xef\xbb\xbf' + dados
    with open(os.path.join(PASTA, nome), 'wb') as f:
        f.write(dados)


NORMAL = [
    (1.0, 3.5, 'Bom dia, pessoal.'),
    (4.0, 6.25, 'Hoje vamos falar de motores.'),
    (6.5, 9.0, 'Primeiro, a segurança.'),
]

salvar('normal.srt', srt(NORMAL))
salvar('bom_crlf.srt', srt(NORMAL), bom=True, crlf=True)
salvar('sem_numeros.srt', srt(NORMAL, numeros=False))
salvar('ms_curto.srt',
       '1\n00:00:01.5 --> 00:00:02.25\nPrimeira\n\n2\n0:03,7 --> 0:04,05\nSegunda\n')
salvar('cp1252.srt', srt([(1, 2, 'Atenção: não ligue.'), (2.5, 4, 'Ação imediata.')]), cod='windows-1252')
salvar('tags.srt', srt([
    (1, 2, '<i>Olá</i> <b>mundo</b>'),
    (2, 3, '<font color="#ff0000">Rock</font> &amp; Roll'),
    (3, 4, '{\\an8}No topo &#233; aqui\n<u>segunda linha</u>'),
    (4, 5, '<i></i>'),
]))
salvar('sobrepostas.srt', srt([
    (5.0, 7.0, 'Terceira fora de ordem'),
    (1.0, 3.5, 'Primeira longa'),
    (3.0, 4.0, 'Segunda'),
    (8.0, 7.5, 'Fim menor que início'),
    (9.0, 9.0, 'Fim igual ao início'),
    (20.0, 21.0, 'Última'),
]))
salvar('sem_linha_final.srt', srt(NORMAL, final=''))
salvar('vazio.srt', '')
salvar('nao_legenda.txt', 'Lista de compras:\nleite\npão\n')

salvar('normal.vtt', '''WEBVTT
Kind: captions
Language: pt

NOTE Isto é um comentário
que ocupa duas linhas

STYLE
::cue { color: yellow; }

REGION
id:fred width:40%

intro
00:01.000 --> 00:03.500 align:start position:0%
<v Ana>Olá, tudo bem?</v>

00:00:04.000 --> 00:00:06.000 line:90%
<c.yellow>Tudo ótimo.</c>
''')

# VTT automático do YouTube: tempos internos, <c> e rolagem.
salvar('youtube_auto.vtt', '''WEBVTT
Kind: captions
Language: en

00:00:00.400 --> 00:00:02.390 align:start position:0%
 
the<00:00:00.800><c> motor</c><00:00:01.200><c> starts</c><00:00:01.600><c> slowly</c>

00:00:02.390 --> 00:00:02.400 align:start position:0%
the motor starts slowly


00:00:02.400 --> 00:00:04.700 align:start position:0%
the motor starts slowly
and<00:00:02.900><c> then</c><00:00:03.300><c> speeds</c><00:00:03.700><c> up</c>

00:00:04.700 --> 00:00:04.710 align:start position:0%
and then speeds up


00:00:04.710 --> 00:00:07.000 align:start position:0%
and then speeds up
until<00:00:05.200><c> it</c><00:00:05.600><c> reaches</c><00:00:06.000><c> full</c><00:00:06.400><c> speed</c>
''')

# --- Automática estilo DownSub (5.4): contígua, ~2 s, frase acaba no meio da fala, >> e [clears throat]
PEDACOS = [
    'so today we are going to', 'talk about the old pump. it',
    'was installed many years', 'ago and nobody checked the', 'seals since then. >> really?',
    'nobody? >> yes, nobody at', 'all. [clears throat] the first',
    'thing you need to do is', 'turn off the power and', 'lock the panel. then you',
    'can open the cover. Mr. Smith', 'showed me this trick in the U.S. a', 'long time ago. after that',
    'check the bearings and the', 'shaft for any noise or',
]
auto = []
t = 10.0
for p in PEDACOS:
    auto.append((t, t + 2.0, p))
    t += 2.0
salvar('auto_downsub.srt', srt(auto))

# Tradução automática em português com cortes de 3 s (diferentes dos 2 s do inglês).
PT = [
    'então hoje vamos falar da bomba', 'antiga. ela foi instalada há muitos',
    'anos e ninguém verificou as vedações', 'desde então. sério? ninguém? sim,',
    'ninguém. a primeira coisa que você', 'precisa fazer é desligar a energia',
    'e bloquear o painel. depois você', 'pode abrir a tampa. o Sr. Smith',
    'me mostrou esse truque nos EUA há', 'muito tempo. depois disso confira',
]
trad = []
t = 10.0
for p in PT:
    trad.append((t, t + 3.0, p))
    t += 3.0
salvar('auto_downsub_pt.srt', srt(trad))

# Fala longa sem pontuação (para o limite de 15 s e 220 caracteres).
longa = []
t = 0.0
for i in range(12):
    longa.append((t, t + 2.0, f'and the machine keeps running number {i} without any stop'))
    t += 2.0
salvar('auto_sem_pontuacao.srt', srt(longa))

# --- Manual estilo TED (5.4): duas linhas, intervalos de 25 ms, (Laughter) inteira, [Nope!] no texto
ted = [
    (1.000, 3.400, 'When I started working\nwith machines,'),
    (3.425, 5.800, 'I thought every fault\nhad a single cause.'),
    (5.825, 7.000, '(Laughter)'),
    (7.025, 9.500, 'My boss just said: [Nope!]\nand walked away.'),
    (9.525, 11.000, '(Applause)'),
    (11.025, 13.400, 'So I learned to test\nbefore I guess.'),
]
salvar('ted_manual.srt', srt(ted))
print('ok')
