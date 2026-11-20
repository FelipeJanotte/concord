# 0016 — Ordem dos canais: posição global e a ordem inteira a cada arraste

- **Data:** 2026-11-19
- **Situação:** aceita

## Contexto
Canais ganharam categorias e ordem livre (arrastar na barra lateral). Era preciso escolher como guardar a ordem e
o que o app manda ao servidor depois de um arraste, com dois gerentes podendo arrastar ao mesmo tempo e sem vazar
canal privado no aviso.

## Decisão
`channels.position` é um inteiro **global** entre os canais da comunidade (a categoria é só `category_id`) e o app
manda **a ordem inteira** (`channel:layout { categories, channels: { id, categoryId }[] }`); o servidor exige cada
canal e categoria exatamente uma vez, grava tudo numa transação e o último a mandar vence. O aviso
`channels:layout` sai por conexão, filtrado por `visibleChannels`.

## Alternativas descartadas
| Opção | Por que não |
|---|---|
| Evento de movimento (`channel:move { id, categoryId, beforeId }`) | Duas mudanças simultâneas exigem regra de conflito no servidor; a ordem inteira é idempotente e fácil de validar. |
| Posição por categoria | Mover entre categorias renumera dois grupos; global com agrupamento na tela é uma lista só. |
| Posição fracionária / rank em texto (LexoRank) | Evita renumerar, mas com no máximo 100 canais regravar tudo numa transação é barato e mais simples. |
| Mesclar canais escondidos de quem arrasta | Desnecessário: `manageChannels` sempre vê todos os canais (`can()`, regra 5). |

## Consequências
- Validação simples (`parseLayout`, pura e testada) e sem estado intermediário inconsistente.
- Canal criado enquanto alguém arrasta faz o layout ser recusado ("A lista de canais mudou"); o app volta a ordem
  e a pessoa arrasta de novo.
- Se um dia `manageChannels` deixar de ver tudo, o servidor precisa mesclar os canais que a pessoa não vê.
