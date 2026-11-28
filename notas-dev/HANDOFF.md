# HANDOFF
Pacote: nenhum — status: nenhum trabalho pendente no repositório

## Feito (com hash do commit)
- ba35d8e (26/11/2026) App v25: limpeza da voz separada (ruído com DeepFilterNet3, eco com WPE). Está na main, compilou e o APK foi publicado na release android-prototipo.

## Falta
- Nada pela metade no repositório: não há branch nem PR com trabalho não mesclado. As branches `voz-mais-clara` e `voz-limpeza` são antigas e o conteúdo delas já está na main (podem ser apagadas quando o Heric quiser).
- O Heric relatou (28/11/2026) que um trabalho de "tratamento completo do áudio" foi interrompido pelo fim da cota semanal. Se essa sessão mudou algo depois do v25, não chegou ao GitHub: será tratado como pacote novo na triagem (download lento do modelo + renomear o recurso).

## Arquivos tocados
- (nenhum em andamento)

## Descobertas e decisões tomadas
- `VERSAO_APK` em MainActivity está em 24 enquanto versionCode está em 25 (o v25 não precisou de função nova avisada à página).

## Próximo passo exato
- Nova conversa: "Use a skill triagem-ajustes-app. Minha lista:" + a lista de ajustes.
