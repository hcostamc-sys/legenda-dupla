"""Roda no GitHub Actions (o ambiente do Claude não acessa o Hugging Face).
Baixa os dois modelos de pontuação, mostra como são por dentro e gera as saídas de referência
(biblioteca oficial punctuators) que o código JavaScript do app precisa reproduzir.
Saída: pasta indicada no 1º argumento."""
import json, os, shutil, sys, time
import numpy as np
import onnx
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from sentencepiece import SentencePieceProcessor
from sentencepiece import sentencepiece_model_pb2 as spm_pb2
from punctuators.models import PunctCapSegModelONNX
from punctuators.models.punc_cap_seg_model import PunctCapSegConfigONNX

SAIDA = sys.argv[1]
os.makedirs(SAIDA, exist_ok=True)
MODELOS = {
    'en': dict(repo='1-800-BAD-CODE/punctuation_fullstop_truecase_english', onnx='punct_cap_seg_en.onnx', sp='spe_32k_lc_en.model'),
    'romance': dict(repo='1-800-BAD-CODE/punctuation_fullstop_truecase_romance', onnx='model.onnx', sp='sp.model'),
}
TEXTOS = {
    'en': [
        "so what we're going to do today is talk about the maya civilization they built huge cities in the jungle and nobody really knows why they abandoned them",
        "do you know where the nearest station is i think it's about two miles from here but i'm not sure",
        "hello my name is john and i live in new york city i work for nasa as an engineer",
        "it was 1997 the u s economy was growing fast and dr smith said that's incredible",
    ],
    'romance': [
        "bonjour je m'appelle marie et j'habite à paris je travaille comme ingénieure depuis dix ans",
        "est-ce que tu sais où est la gare je pense qu'elle est à deux kilomètres d'ici mais je ne suis pas sûr",
        "hola cómo estás yo estoy bien gracias y tú",
        "olá meu nome é joão eu moro em são paulo e trabalho como eletricista industrial",
    ],
}
relato = []


def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s)
    relato.append(s)


for nome, m in MODELOS.items():
    log(f'===== {nome} ({m["repo"]})')
    caminhos = {k: hf_hub_download(m['repo'], m[k]) for k in ('onnx', 'sp')}
    cfg_path = hf_hub_download(m['repo'], 'config.yaml')
    log('tamanho onnx (bytes):', os.path.getsize(caminhos['onnx']))
    log('config.yaml:\n' + open(cfg_path, encoding='utf-8').read())
    shutil.copy(caminhos['sp'], os.path.join(SAIDA, f'{nome}.spmodel'))
    shutil.copy(cfg_path, os.path.join(SAIDA, f'{nome}.config.yaml'))
    proto = spm_pb2.ModelProto()
    proto.ParseFromString(open(caminhos['sp'], 'rb').read())
    log('trainer_spec:', str(proto.trainer_spec).replace('\n', ' | '))
    ns = proto.normalizer_spec
    log('normalizer:', ns.name, 'add_dummy_prefix', ns.add_dummy_prefix, 'remove_extra_ws', ns.remove_extra_whitespaces,
        'escape_ws', ns.escape_whitespaces, 'charsmap bytes', len(ns.precompiled_charsmap))
    sess = ort.InferenceSession(caminhos['onnx'], providers=['CPUExecutionProvider'])
    for i in sess.get_inputs():
        log('entrada:', i.name, i.type, i.shape)
    for o in sess.get_outputs():
        log('saída:', o.name, o.type, o.shape)
    grafo = onnx.load(caminhos['onnx'], load_external_data=False)
    log('opset:', [(x.domain, x.version) for x in grafo.opset_import])
    log('operadores:', sorted({n.op_type for n in grafo.graph.node}))
    del grafo
    sp = SentencePieceProcessor(caminhos['sp'])
    log('bos', sp.bos_id(), 'eos', sp.eos_id(), 'pad', sp.pad_id(), 'unk', sp.unk_id(), 'vocab', sp.get_piece_size())
    modelo = PunctCapSegModelONNX(PunctCapSegConfigONNX(directory=os.path.dirname(caminhos['onnx']),
                                                         spe_filename=m['sp'], model_filename=m['onnx']))
    casos = []
    for t in TEXTOS[nome]:
        ids = sp.EncodeAsIds(t)
        x = np.array([[sp.bos_id()] + ids + [sp.eos_id()]], dtype=np.int64)
        t0 = time.time()
        saidas = sess.run(None, {sess.get_inputs()[0].name: x})
        dt = time.time() - t0
        casos.append({
            'texto': t, 'ids': ids, 'pecas': [sp.IdToPiece(i) for i in ids],
            'saidas': {o.name: np.asarray(v).tolist() for o, v in zip(sess.get_outputs(), saidas)},
            'formas': {o.name: list(np.asarray(v).shape) for o, v in zip(sess.get_outputs(), saidas)},
            'tipos': {o.name: str(np.asarray(v).dtype) for o, v in zip(sess.get_outputs(), saidas)},
            'oficial': modelo.infer([t])[0],
            'segundos': dt,
        })
        log('texto:', t)
        log('  oficial:', casos[-1]['oficial'])
        log('  formas:', casos[-1]['formas'], casos[-1]['tipos'], f'{dt:.3f} s')
    # Texto longo (várias janelas) para conferir a junção das janelas
    longo = ' '.join(TEXTOS[nome] * 40)
    t0 = time.time()
    casos.append({'texto': longo, 'ids': sp.EncodeAsIds(longo), 'oficial': modelo.infer([longo])[0], 'longo': True})
    log('texto longo:', len(casos[-1]['ids']), 'peças,', f'{time.time() - t0:.2f} s')
    # Tokenização de casos difíceis (para testar o tokenizador em JavaScript)
    dificeis = ["it's   don't  ok", "café naïve über ½ ﬁ", "123 4,5 u.s.a. e-mail", "l'été à côté",
                "ｆｕｌｌ　ｗｉｄｔｈ", "emoji 😀 ok", "x y", "ça va très bien n'est-ce pas"]
    tok = [{'texto': d, 'ids': sp.EncodeAsIds(d), 'pecas': sp.EncodeAsPieces(d)} for d in dificeis]
    json.dump({'casos': casos, 'tokenizacao': tok, 'bos': sp.bos_id(), 'eos': sp.eos_id(), 'pad': sp.pad_id()},
              open(os.path.join(SAIDA, f'{nome}.referencia.json'), 'w', encoding='utf-8'), ensure_ascii=False)

open(os.path.join(SAIDA, 'relato.txt'), 'w', encoding='utf-8').write('\n'.join(relato) + '\n')
