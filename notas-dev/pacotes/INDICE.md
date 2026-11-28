# Pacotes
| Pnn | Título | Itens do log | Tamanho (pontos) | Modelo | Depende de | Status |
|---|---|---|---|---|---|---|
| P01 | Ajustes rápidos: folga, texto da sincronia e bloco de voz | 1, 3, 2a, 10 (log 9) | 4 | Sonnet | nada | pendente |
| P02 | Botão de tela cheia no vídeo e retomada sem pulo da barra | 9 (log 8), 12 (log 11) | 4 | Opus | P01 | pendente |
| P03 | Falso "tentando reconectar" ao passar falas rápido | 5 (2º item 4 do log) | 4 | Opus | P02 | pendente |
| P04 | Ícone de carregando e aviso de rede desde a abertura | 7 (log 6) | 4 | Opus | P03 | pendente |
| P05 | Download lento do modelo de tratamento do áudio (APK) | 2b | 4 | Opus | P01 | pendente |
| P06 | Chave do Tradutor com IA: campo, tutorial e estado (parte A) | 4a + pedido de 28/11 | 4 | Sonnet | P01 | pendente |
| P11 | Tradutor da palavra com IA: sentidos em ordem com exemplo (parte B) | 4a | 4 | Opus | P06 | pendente |
| P07 | Várias palavras juntas e segurar a legenda 1,5 s | 4b, 6 (log 5) | 4 | Opus | P11 | pendente |
| P08 | "Tempo assistido" em Meus vídeos | 8 (log 7) | 4 | Sonnet | P02 | pendente |
| P09 | Análise da qualidade do áudio — parte A, app (APK) | 11a (log 10) | 4 | Opus | P05 | pendente |
| P10 | Nota do áudio e "Aprimorar o áudio" na janela de idiomas — parte B | 11b (log 10) | 4 | Opus | P09, P06 | pendente |

## Lista normalizada (log de 28/11/2026)
1. Folga: opções 0,18 / 0,3 / 0,45, padrão 0,3 → P01
2. a) renomear o recurso "Modelo de separação de voz" (decisão: só renomear) → P01 (página) e P05 (textos nativos); b) download lento → P05
3. "Legenda estudada:" → "Legenda:" → P01
4. a) todos os sentidos em ordem + 1 exemplo cada (decisão: Gemini com chave grátis de cada usuário; sem chave, "Indisponível") → P06 (chave, tutorial, estado) e P11 (sentidos no cartão); b) várias palavras juntas (decisão: tocar a 1ª e a última, sem limite) → P07
5. Falso "tentando reconectar" ao passar falas rápido (2º item 4 do log) → P03
6. Segurar a legenda 1,5 s volta ao início da fala, sem loop (log 5) → P07
7. Carregando e aviso de rede desde a abertura (log 6) → P04
8. Tempo assistido (log 7) → P08
9. Botão de tela cheia no canto inferior esquerdo do vídeo (log 8) → P02
10. Reorganizar e renomear o bloco "Voz mais clara" (log 9) → P01
11. Análise prévia da qualidade (era pergunta; decisão: criar se não existir) → a) P09; b) P10
12. Barra de progresso vai ao fim e volta ao retomar (log 11) → P02

## Pedidos posteriores
- 28/11/2026: campo da chave da IA na janela de idiomas e nos Ajustes, organizado e coerente, com tutorial didático; chave salva; sem chave = "Indisponível" → P06.

Observação: a ordem de execução é a ordem das linhas desta tabela (o P11 vem logo depois do P06).
