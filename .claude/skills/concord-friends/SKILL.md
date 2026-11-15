---
name: concord-friends
description: Como funcionam as amizades do Concord (v3, A6) — pedido por nome#id, aceitar/recusar/cancelar/desfazer, bloquear e desbloquear (cada lado da relação tem o seu estado), online/offline visível só para amigos e os eventos friend:*. Use ao mexer em server/modules/friends.ts, server/repo/friends.ts, server/db/schema/friends.ts, src/shared/types/friends.ts, na presença (server/modules/presence.ts) ou na tela "Amigos" (B7), ou ao investigar pedido que não chega, "Ninguém com esse nome#id" ou amigo que não aparece online.
---

# Amizades (v3: A6 servidor; a tela "Amigos" é da B7, skill `concord-home`)

## Modelo

Uma linha por **lado** da relação (`friendships`: `account_id` vê `other_id` como `status`):

| Situação | Meu lado | Lado da outra pessoa |
|---|---|---|
| eu pedi | `outgoing` | `incoming` |
| amigos | `friend` | `friend` |
| eu bloqueei | `blocked` | (some — ela não vê nada nem sabe do bloqueio) |
| os dois bloquearam | `blocked` | `blocked` |

Operações que mexem nos dois lados rodam numa transação (`server/repo/friends.ts`). O banco impede relação consigo
mesmo e status desconhecido (`check`); apagar uma conta apaga as relações (cascade).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/friends.ts` | Contrato: `FriendStatus`, `FriendAccount`, `FriendEntry`, `FriendResult`, `FRIEND_PENDING_MAX`, `parseFriendTarget` (pura), eventos. |
| `server/modules/friends.ts` | Eventos `friend:*`, `isOnline`, `announcePresence` (chamado pela presença), avisos para as duas contas (`notifyPair`). |
| `server/repo/friends.ts` | `getRelation`, `listRelations`, `friendIds`, `countOutgoing`, `sendRequest`, `makeFriends`, `deletePair`, `block`, `unblock`, `findAccountByTag`. |
| `server/db/schema/friends.ts` | Tabela `friendships` (migration `0005_friends`). |
| `server/modules/presence.ts` | Na **primeira** janela da conta (`hello`) e quando a **última** fecha, chama `announcePresence`. |

## Eventos

| Evento | Payload | Resposta | Regras |
|---|---|---|---|
| `friend:list` | — | `FriendEntry[]` | todas as minhas relações; `online` só é true para amigos conectados |
| `friend:request` | `"nome#id"` | `FriendResult` | nome **e** id precisam bater (sem diferenciar maiúsculas); se a pessoa já tinha me pedido, vira amizade na hora; até `FRIEND_PENDING_MAX` (50) pedidos pendentes; limite `LIMITS.friend` (10 seguidos, depois 1 a cada 10 s) |
| `friend:accept` | `accountId` | `FriendResult` | só pedido recebido |
| `friend:decline` | `accountId` | `FriendResult` | recusa recebido **ou** cancela enviado |
| `friend:remove` | `accountId` | `FriendResult` | só amigos |
| `friend:block` / `friend:unblock` | `accountId` | `FriendResult` | bloquear apaga o lado da outra pessoa; desbloquear apaga o meu (a relação some) |
| `friend:updated` (servidor → app) | `FriendEntry` | — | o estado novo, para **todas** as conexões de cada conta envolvida |
| `friend:removed` (servidor → app) | `accountId` | — | a relação deixou de existir |
| `friend:presence` (servidor → app) | `{ accountId, online }` | — | só para amigos; uma vez por conta (não por janela) |

Mensagens de erro pensadas para não vazar informação: quem foi bloqueado recebe "Não foi possível enviar o pedido"
(não sabe do bloqueio); id inexistente ou nome errado dão o mesmo "Ninguém com esse nome#id".

## Pendente

- ~~Tela "Amigos"~~ ✅ B7: `components/friends/FriendsView.tsx` (abas Online, Todos, Pendentes, Bloqueados e
  "Adicionar amigo") sobre `store/friends.ts`, as ações de `lib/actions/friends.ts` e `friendGroups`/`incomingCount`
  (`lib/friends.ts`). Selo no Início e "Adicionar amigo" no botão direito: skill `concord-home`.
- A7 (DMs, skill `concord-dms`): conversa nova só entre amigos; bloqueio (`blockedBetween`) fecha a conversa.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/types/friends.test.ts` | `parseFriendTarget` (nome com espaços e `#`, recusas). |
| `server/repo/friends.test.ts` | Dois lados de cada operação, bloqueio dos dois lados, busca por id, `check` do banco. |
| `server/tests/friends.test.ts` | Servidor real: pedido e avisos, nome/id e erros, pedir de volta aceita, aceitar/recusar/cancelar/desfazer, bloquear (sem vazar) e desbloquear, online só para amigos (primeira janela/última janela), lista. |
| `src/renderer/src/lib/actions/friends.test.ts` | App (FakeSocket): carga das listas, avisos `friend:*`/`dm:created`, conversa sobe com `message:new`, ações e erros. |
| `src/renderer/src/lib/friends.test.ts` | Abas (`friendGroups`) e `incomingCount`. |
| `src/renderer/src/lib/client-friends.test.ts` | `connect()` pede `friend:list` e `dm:list` logo depois do `hello`. |
