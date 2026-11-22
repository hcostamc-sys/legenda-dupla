"""Gera um modelo ONNX falso, com as mesmas entradas e saídas dos modelos de pontuação de verdade,
para os testes automáticos (o modelo de verdade tem 210 MB e fica no Hugging Face).
Regra do falso: peça de id par ganha vírgula; id múltiplo de 7 ganha ponto e fim de frase;
a 2ª posição de toda peça de id múltiplo de 3 vira maiúscula."""
import onnx
from onnx import TensorProto, helper as h

def c(nome, valor, tipo=TensorProto.INT64):
    return h.make_node('Constant', [], [nome], value=h.make_tensor(nome + '_v', tipo, [], [valor]))

nos = [
    c('dois', 2), c('sete', 7), c('tres', 3), c('zero', 0), c('um', 1), c('cinco', 5),
    h.make_node('Mod', ['input_ids', 'dois'], ['m2']),
    h.make_node('Mod', ['input_ids', 'sete'], ['m7']),
    h.make_node('Mod', ['input_ids', 'tres'], ['m3']),
    h.make_node('Equal', ['m2', 'zero'], ['par']),
    h.make_node('Equal', ['m7', 'zero'], ['seg_preds']),
    h.make_node('Equal', ['m3', 'zero'], ['cap1']),
    # post: 2 (".") se múltiplo de 7, senão 3 (",") se par, senão 0
    h.make_node('Where', ['par', 'tres', 'zero'], ['post_a']),
    h.make_node('Where', ['seg_preds', 'dois', 'post_a'], ['post_preds']),
    h.make_node('Mul', ['input_ids', 'zero'], ['pre_preds']),
    # cap: [1, T, 16]: só a posição 1 (1ª letra depois do "▁")
    h.make_node('Unsqueeze', ['cap1', 'eixo'], ['cap1u']),
    h.make_node('Constant', [], ['eixo'], value=h.make_tensor('eixo_v', TensorProto.INT64, [1], [2])),
    h.make_node('Constant', [], ['mascara'], value=h.make_tensor('masc_v', TensorProto.BOOL, [16], [i == 1 for i in range(16)])),
    h.make_node('And', ['cap1u', 'mascara'], ['cap_preds']),
]
# Unsqueeze usa "eixo", que precisa vir antes
nos.sort(key=lambda n: 0 if n.output[0] in ('eixo', 'mascara') else 1)
grafo = h.make_graph(
    nos, 'falso',
    [h.make_tensor_value_info('input_ids', TensorProto.INT64, ['b', 't'])],
    [h.make_tensor_value_info('pre_preds', TensorProto.INT64, ['b', 't']),
     h.make_tensor_value_info('post_preds', TensorProto.INT64, ['b', 't']),
     h.make_tensor_value_info('cap_preds', TensorProto.BOOL, ['b', 't', 16]),
     h.make_tensor_value_info('seg_preds', TensorProto.BOOL, ['b', 't'])])
m = helper_model = h.make_model(grafo, opset_imports=[h.make_opsetid('', 17)])
m.ir_version = 8
onnx.checker.check_model(m)
onnx.save(m, __file__.replace('gerar_modelo_falso.py', 'falso.onnx'))
