# Regras deste repositório
1. Pedido "Próximo pacote":
   a) marque como "concluído" os pacotes em "testar" (o pedido confirma que o teste passou);
   b) se notas-dev/HANDOFF.md tiver trabalho em andamento, continue dele;
   c) senão, pegue no notas-dev/pacotes/INDICE.md o primeiro pacote "pendente" cujas dependências estejam "concluído" e execute o arquivo dele;
   d) se nada estiver pronto (só "aguardando decisão"), diga o que falta decidir e pare.
2. Pedido começando com "Falhou:": reabra o pacote em "testar", corrija só o que falhou e volte-o para "testar".
3. Antes de abrir código, leia notas-dev/MAPA.md. Abra só os arquivos indicados pelo pacote ou pelo MAPA. Se um arquivo ou símbolo citado mudou por causa de um pacote anterior, ajuste sozinho. Se a solução exigir mexer em outra parte do app, pare e explique o que achou e o que sugere.
4. Não refatore, não renomeie, não formate arquivos inteiros, não atualize dependências sem pedido.
5. Testes: só a checagem rápida/build e os testes da lógica alterada. Tela, gesto e rede = roteiro manual para o Heric testar no celular.
6. Diagnóstico que precise de log: mostre o log no próprio app (texto na tela com botão de copiar), porque o Heric testa só no celular, sem computador. Remova depois.
7. Textos da interface e notas em português com todos os acentos.
8. Em tarefas com várias etapas: ao fim de cada etapa, commit + HANDOFF atualizado (a sessão pode acabar a qualquer momento).
9. Ao terminar um pacote: commit "Pnn: ..."; atualize no MAPA só as linhas afetadas; status "testar" no pacote e no INDICE; limpe o HANDOFF; leve a mudança à branch principal pelo caminho descrito no MAPA (push direto na main).
10. Mensagem final, sempre nesta ordem e sem jargão:
    - o que mudou (1 a 3 linhas);
    - o que o Heric precisa fazer para a mudança chegar à principal (ou "nada, já está");
    - como baixar e instalar o APK novo (só se mexeu em android/; senão: "só fechar e abrir o app");
    - roteiro de teste no celular (passo → resultado esperado);
    - qual modelo escolher na próxima conversa.
11. Checagem rápida: `node --test` e `node --input-type=module --check < js/ARQUIVO.js`. Mudou arquivo do site: troque `CACHE` em sw.js. Mudou android/: suba versionCode, versionName e VERSAO_APK. Build do APK: Actions (android.yml, push na main com mudança em android/**).
