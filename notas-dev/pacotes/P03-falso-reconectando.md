# P03 — Falso "tentando reconectar" ao passar falas rápido
Status: pendente
Modelo sugerido: Opus
Depende de: P02

## Objetivo
O ícone de "tentando reconectar" não pode aparecer quando a internet está boa, mesmo passando as falas muito rápido por gestos.

## Itens do log (texto original do Heric)
- 5 (segundo item 4 do log): "Ao passar as legendas bem rapidamente por gestos, o ícone de tentando reconectar apareceu algumas vezes (falso gatilho) mesmo com internet wifi 100%, corrigir"

## Onde mexer (do MAPA)
- `js/app.js` — `atualizarAvisoRede`, `conferirRede`, `aoMudarRede`, `recuperarRede`, `recarregarPlayer`, `navegarAcao`, `irParaIndice`
- `index.html` / `css/app.css` — `#aviso-rede` (só para o log temporário)
- `MainActivity.java` — `vigiarInternet`, `conferirInternet`, `enviarInternet`, `CONFIRMAR_QUEDA_MS` (só ler; mexer só se a causa estiver ali)
- `sw.js` — `CACHE`

## O que fazer
Fase 1 — diagnóstico (log na tela, regra 6 do CLAUDE.md):
- Hipóteses em ordem de probabilidade:
  1. `conferirRede` vê o player em buffer logo depois de vários `irPara` seguidos e conclui "travado". Confirmar/descartar: logar cada decisão de `conferirRede` (estado do player, tempo parado, último seek).
  2. Erro ou estado transitório do iframe durante seeks seguidos dispara `recuperarRede`/`recarregarPlayer`. Confirmar: logar quem chamou.
  3. `ldRede` do app nativo manda "sem internet" por instabilidade momentânea. Confirmar: logar as mensagens `ldRede` com horário.
- Log temporário: lista das últimas ~30 linhas (horário, origem: ldRede | conferirRede | aoMudarRede | recuperarRede, motivo) visível por um botão discreto, com "Copiar". Roteiro para o Heric: abrir um vídeo com Wi-Fi bom, passar 15–20 falas o mais rápido possível, repetir até o ícone aparecer, copiar o log e colar na conversa.
- Commit + HANDOFF ao fim da Fase 1 (a correção pode ficar para a mesma sessão se o log já vier na conversa).

Fase 2 — corrigir só a causa confirmada (ex.: `conferirRede` ignora o buffer causado por seek recente e só acusa queda se o buffer passar de um limite sem nenhum seek novo, e/ou exige confirmação de rede). Remover o log temporário.

## Critérios de aceitação
- [ ] Com Wi-Fi bom, passar 30 falas o mais rápido possível 3 vezes seguidas: o ícone não aparece nenhuma vez.
- [ ] Com o Wi-Fi desligado durante o vídeo, o ícone continua aparecendo (no máximo em poucos segundos) e some ao religar.
- [ ] Log temporário removido no fim.

## Decisões já tomadas e suposições (não perguntar de novo)
- Nenhuma.

## Não mexer / regressões a vigiar
- O aviso real de queda (v14 já corrigiu um falso alarme; ler PLANO.md antes de mudar limites).
- `recarregarPlayer` precisa continuar voltando ao ponto certo.
- Se mexer em `MainActivity.java`: subir versionCode, versionName e VERSAO_APK.

## Testes
- Automático: `node --test`; `--check` dos JS mexidos.
- Roteiro manual (celular): os dois primeiros critérios acima, passo a passo.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. APK novo só se mexer em `android/`.
