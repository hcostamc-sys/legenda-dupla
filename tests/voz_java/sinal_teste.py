"""Sinal de teste da "voz mais clara" (usado no GitHub Actions, voz-ci.yml).

    python3 sinal_teste.py gerar FALA_22K.wav FALA.wav MISTURA.wav
        FALA_22K.wav: fala sintetizada pelo espeak-ng (mono). Gera FALA.wav (a fala sozinha, 44,1 kHz estéreo)
        e MISTURA.wav (a fala com música sintetizada mais alta que ela, 5 dB acima).
    python3 sinal_teste.py avaliar FALA.wav MISTURA.wav VOZ.wav MIX.wav [LIMPA.wav]
        Mede quanto a voz separada se parece com a fala (SDR) e quanto a fala ficou acima do fundo no áudio final.
        Sai com erro se a melhora for pequena demais. LIMPA.wav (voz depois da limpeza): só informa.
    python3 sinal_teste.py sujar FALA.wav SUJO.wav ALVO.wav
        Fala numa sala com eco (RT60 0,6 s, sintética) + ruído rosa + zumbido de 60 Hz, 5 dB abaixo da fala.
        ALVO.wav: a fala com só os primeiros 50 ms da sala (o que se quer depois da limpeza).
    python3 sinal_teste.py avaliar_limpeza ALVO.wav SUJO.wav LIMPO.wav [OUTRO.wav ...]
        SI-SDR em relação ao alvo, ruído que sobra nos silêncios e cauda do eco nas pausas da fala.
        Sai com erro se LIMPO.wav melhorar pouco.
"""
import os
import sys
import wave

import numpy as np

TAXA = 44100


def ler(caminho):
    with wave.open(caminho, 'rb') as w:
        n, canais, taxa, larg = w.getnframes(), w.getnchannels(), w.getframerate(), w.getsampwidth()
        assert larg == 2, 'WAV precisa ser 16 bits'
        x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
    return x.reshape(-1, canais).T, taxa


def escrever(caminho, x):
    y = np.clip(np.round(x.T * 32767), -32768, 32767).astype('<i2')
    with wave.open(caminho, 'wb') as w:
        w.setnchannels(x.shape[0])
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes(y.tobytes())


def rms_db(x):
    return 10 * np.log10(np.mean(x ** 2) + 1e-20)


def musica(n, rng):
    t = np.arange(n) / TAXA
    acordes = [(220.0, 277.18, 329.63), (196.0, 246.94, 293.66), (174.61, 220.0, 261.63), (196.0, 246.94, 329.63)]
    e = np.zeros(n)
    d = np.zeros(n)
    dur = int(2.0 * TAXA)
    for k in range(0, n, dur):
        fim = min(n, k + dur)
        tt = t[k:fim] - t[k]
        env = np.minimum(1, tt / 0.05) * np.exp(-tt * 0.6)
        for j, f in enumerate(acordes[(k // dur) % 4]):
            nota = sum(np.sin(2 * np.pi * f * h * tt + j) / h for h in range(1, 8))  # timbre rico (dente de serra)
            pan = 0.35 + 0.15 * j
            e[k:fim] += env * nota * (1 - pan)
            d[k:fim] += env * nota * pan
        baixo = np.sin(2 * np.pi * acordes[(k // dur) % 4][0] / 2 * tt) * env
        e[k:fim] += 0.8 * baixo
        d[k:fim] += 0.8 * baixo
    batida = int(0.5 * TAXA)
    for k in range(0, n, batida):
        fim = min(n, k + int(0.15 * TAXA))
        tt = t[k:fim] - t[k]
        bumbo = np.sin(2 * np.pi * (60 + 80 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 18)
        e[k:fim] += 1.5 * bumbo
        d[k:fim] += 1.5 * bumbo
        meio = k + batida // 2
        fim2 = min(n, meio + int(0.05 * TAXA))
        if meio < n:
            ch = rng.standard_normal(fim2 - meio) * np.exp(-np.arange(fim2 - meio) / TAXA * 60)
            e[meio:fim2] += 0.3 * ch
            d[meio:fim2] += 0.3 * ch
    return np.vstack([e, d])


def gerar(fala22, saida_fala, saida_mistura):
    x, taxa = ler(fala22)
    mono = x[0]
    n = int(len(mono) * TAXA / taxa)
    fala = np.interp(np.arange(n) * taxa / TAXA, np.arange(len(mono)), mono)
    # 3 s só de música antes e depois da fala (ali o fundo não pode mudar)
    fala = np.concatenate([np.zeros(3 * TAXA), fala, np.zeros(3 * TAXA)])
    fala = np.vstack([fala, fala])
    m = musica(fala.shape[1], np.random.default_rng(1))
    alvo_fala = -24.0
    fala *= 10 ** ((alvo_fala - rms_db(fala[:, fala[0] ** 2 > 1e-6])) / 20)
    ativo = np.abs(fala[0]) > 0
    m *= 10 ** ((alvo_fala + 5 - rms_db(m[:, ativo])) / 20)  # música 5 dB mais alta que a fala
    mistura = fala + m
    pico = np.max(np.abs(mistura))
    if pico > 0.95:
        fala *= 0.95 / pico
        mistura *= 0.95 / pico
    escrever(saida_fala, fala)
    escrever(saida_mistura, mistura)
    print(f'fala {fala.shape[1] / TAXA:.1f} s; fala {rms_db(fala):.1f} dB, música {rms_db(m):.1f} dB')


def sdr(ref, est):
    return 10 * np.log10(np.sum(ref ** 2) / (np.sum((ref - est) ** 2) + 1e-20))


def avaliar(caminho_fala, caminho_mistura, caminho_voz, caminho_mix, caminho_limpa=None):
    fala, _ = ler(caminho_fala)
    mistura, _ = ler(caminho_mistura)
    voz, _ = ler(caminho_voz)
    mix, _ = ler(caminho_mix)
    n = min(fala.shape[1], voz.shape[1], mix.shape[1])
    fala, mistura, voz, mix = fala[:, :n], mistura[:, :n], voz[:, :n], mix[:, :n]
    sdr_entrada = sdr(fala, mistura)
    sdr_voz = sdr(fala, voz)
    # Onde há fala: quanto a fala fica acima de todo o resto, antes e depois
    env = np.convolve(np.abs(fala[0]), np.ones(2205) / 2205, mode='same')
    ativo = env > 0.1 * np.max(env)
    sbr_antes = rms_db(fala[:, ativo]) - rms_db((mistura - fala)[:, ativo])
    sbr_depois = rms_db(fala[:, ativo]) - rms_db((mix - fala)[:, ativo])
    # Longe da fala (mais de 1,5 s de qualquer fala), o fundo tem de continuar como era
    falando = np.flatnonzero(env > 1e-4 * np.max(env))
    idx = np.arange(n)
    calado = (idx < falando[0] - int(1.5 * TAXA)) | (idx > falando[-1] + int(1.5 * TAXA))
    fundo_antes = rms_db(mistura[:, calado])
    fundo_depois = rms_db(mix[:, calado])
    print(f'SDR da voz separada: {sdr_voz:.1f} dB (a mistura tinha {sdr_entrada:.1f} dB): melhora de {sdr_voz - sdr_entrada:.1f} dB')
    if caminho_limpa:
        limpa, _ = ler(caminho_limpa)
        limpa = limpa[:, :n]
        print(f'SDR da voz depois da limpeza: {sdr(fala, limpa):.1f} dB (só informativo)')
    print(f'fala acima do resto, onde há fala: antes {sbr_antes:.1f} dB, depois {sbr_depois:.1f} dB')
    print(f'fundo onde não há fala: antes {fundo_antes:.1f} dB, depois {fundo_depois:.1f} dB')
    ok = True
    if sdr_voz - sdr_entrada < 6:
        print('FALHOU: a separação melhorou menos de 6 dB')
        ok = False
    if sbr_depois - sbr_antes < 4:
        print('FALHOU: a fala não ficou pelo menos 4 dB mais destacada')
        ok = False
    if abs(fundo_depois - fundo_antes) > 1.5:
        print('FALHOU: o fundo mudou onde não há fala')
        ok = False
    sys.exit(0 if ok else 1)


def sala(rng):
    """Resposta de sala sintética a 44,1 kHz: som direto, reflexões nos primeiros 50 ms e cauda com RT60 0,6 s."""
    n = int(0.9 * TAXA)
    t = np.arange(n) / TAXA
    r = rng.standard_normal(n) * 10 ** (-3 * t / 0.6) * 0.12
    r[: int(0.003 * TAXA)] = 0
    r[0] = 1.0
    for atraso, g in [(0.007, 0.5), (0.013, -0.4), (0.021, 0.35), (0.034, 0.3), (0.046, -0.25)]:
        r[int(atraso * TAXA)] += g
    cedo = r.copy()
    cedo[int(0.05 * TAXA):] = 0
    return r, cedo


def convolver(x, h):
    n = len(x) + len(h) - 1
    m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(h, m), m)[: len(x)]


def sujar(caminho_fala, caminho_sujo, caminho_alvo):
    fala, _ = ler(caminho_fala)
    rng = np.random.default_rng(7)
    r, cedo = sala(rng)
    mono = fala[0]
    com_eco = convolver(mono, r)
    alvo = convolver(mono, cedo)
    n = len(mono)
    # ruído rosa (−3 dB por oitava, acima de 50 Hz), feito no espectro
    m = 1 << (n - 1).bit_length()
    espectro = np.fft.rfft(rng.standard_normal(m))
    f = np.fft.rfftfreq(m, 1 / TAXA)
    espectro /= np.sqrt(np.maximum(f, 50.0))
    rosa = np.fft.irfft(espectro, m)[:n]
    t = np.arange(n) / TAXA
    zumbido = sum(np.sin(2 * np.pi * 60 * h * t) / h for h in (1, 2, 3, 5))
    ruido = rosa / np.std(rosa) + 0.3 * zumbido
    ativo = np.abs(mono) > 0
    ruido *= np.sqrt(np.mean(com_eco[ativo] ** 2) / np.mean(ruido[ativo] ** 2)) / 10 ** (5 / 20)
    sujo = com_eco + ruido
    esc = 0.9 / np.max(np.abs(sujo))
    escrever(caminho_sujo, np.vstack([sujo, sujo]) * esc)
    escrever(caminho_alvo, np.vstack([alvo, alvo]) * esc)
    print(f'sujo: eco RT60 0,6 s, ruído 5 dB abaixo da fala; {n / TAXA:.1f} s')


def si_sdr(ref, est):
    a = np.dot(est, ref) / np.dot(ref, ref)
    s = a * ref
    return 10 * np.log10(np.sum(s ** 2) / (np.sum((est - s) ** 2) + 1e-20))


def avaliar_limpeza(caminho_alvo, caminho_sujo, *caminhos):
    alvo = ler(caminho_alvo)[0][0]
    env = np.convolve(alvo ** 2, np.ones(441) / 441, mode='same')
    fala = env > 1e-3 * np.max(env)
    recente = np.convolve(fala.astype(float), np.ones(int(0.4 * TAXA)), mode='full')[: len(alvo)] > 0
    pausa = (~fala) & recente  # sem fala agora, com fala nos últimos 400 ms: ali só soa a cauda do eco (e ruído)
    falando = np.flatnonzero(fala)
    idx = np.arange(len(alvo))
    silencio = (idx < falando[0] - int(0.5 * TAXA)) | (idx > falando[-1] + int(1.0 * TAXA))
    nivel = lambda y, m: 10 * np.log10(np.mean(y[m] ** 2) + 1e-20)
    res = []
    for nome, c in [('sujo', caminho_sujo)] + [(os.path.basename(c), c) for c in caminhos]:
        y = ler(c)[0][0][: len(alvo)]
        r = (si_sdr(alvo, y), nivel(y, pausa) - nivel(y, fala), nivel(y, silencio) - nivel(y, fala))
        res.append(r)
        print(f'{nome:22s} SI-SDR {r[0]:6.1f} dB | cauda nas pausas {r[1]:6.1f} dB | ruído no silêncio {r[2]:6.1f} dB')
    (s0, c0, r0), (s1, c1, r1) = res[0], res[1]
    ok = True
    # Limites com folga; medido com fala gravada (assets do DeepFilterNet): +4,1 dB, −32 dB e −14,6 dB
    if s1 - s0 < 2:
        print('FALHOU: a limpeza melhorou o SI-SDR menos de 2 dB')
        ok = False
    if r0 - r1 < 15:
        print('FALHOU: o ruído no silêncio caiu menos de 15 dB')
        ok = False
    if c0 - c1 < 6:
        print('FALHOU: a cauda do eco nas pausas caiu menos de 6 dB')
        ok = False
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    if sys.argv[1] == 'gerar':
        gerar(*sys.argv[2:5])
    elif sys.argv[1] == 'avaliar':
        avaliar(*sys.argv[2:7])
    elif sys.argv[1] == 'sujar':
        sujar(*sys.argv[2:5])
    elif sys.argv[1] == 'avaliar_limpeza':
        avaliar_limpeza(*sys.argv[2:])
