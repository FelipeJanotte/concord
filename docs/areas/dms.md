# Conversas privadas (v3: A7 servidor; a lista de DMs e o chat são da B7, `docs/areas/home.md`)

## Ideia

**Um DM é um canal** do tipo `dm` com duas linhas em `channel_members`. Assim mensagens, anexos, histórico
paginado, "digitando" (e as chamadas da B8, sala LiveKit = id do canal; `docs/areas/calls.md`) usam o código de sempre
(`message:*`, `typing`, `POST /uploads`, `GET /files`). O que muda é **quem vê**: num DM, cargos e regras não valem;
só os dois membros veem — nem a dona.

`ChannelType = 'text' | 'voice'` continua sendo o tipo que dá para criar (`channel:create`); `ChannelKind` inclui `dm`
e é o tipo de `Channel.type`. Ninguém cria DM por `channel:create`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/dms.ts` | Contrato: `DmEntry { channel, other }`, `DmOpenResult`, eventos. |
| `src/shared/types/channel.ts` | `ChannelKind = ChannelType \| 'dm'`. |
| `server/modules/dms.ts` | `dm:list`, `dm:open` (regras abaixo), avisa `dm:created`. |
| `server/repo/dms.ts` | `dmName` (hash do par), `findDm`, `openDm` (transação; corrida resolvida pelo índice único), `listDms`, `listDmMembers`. |
| `server/access.ts` | Cache `dmMembers` (carregado em `initAccess`/`reloadDms`, atualizado por `rememberDm`); `allowed()` e `emitToViewers` usam os membros quando o canal é DM; `visibleChannels` nunca inclui DM. |
| `server/repo/friends.ts` | `blockedBetween(a, b)` e `findFriendAccount(id)`. |
| `server/repo/channels.ts` | `listChannels`/`countChannels` ignoram DMs; `deleteChannel` não apaga DM. |
| `server/db/schema/channels.ts` | Check do tipo com `dm` e a tabela `channel_members` (migration `0006_dms`). |

## Eventos

| Evento | Payload | Resposta | Regras |
|---|---|---|---|
| `dm:list` | — | `DmEntry[]` | minhas conversas, a mais recente primeiro |
| `dm:open` | `accountId` | `DmOpenResult` | conversa **nova** só entre amigos; uma que **já existe** continua abrindo (amizade desfeita não apaga o histórico); bloqueio de qualquer lado recusa com "Não foi possível abrir a conversa" (não diz quem bloqueou); limite `LIMITS.dm` (20 seguidas, depois 1/s) |
| `dm:created` (servidor → app) | `DmEntry` | — | só quando a conversa é criada: para todas as janelas da outra pessoa (com `other` = eu) e para as minhas outras janelas |

Mensagens no DM: o `message:send` aceita canal `text` ou `dm`; `message:new` e `typing` vão só para os dois membros
(`emitToViewers`). O link assinado do anexo só abre para membros (`GET /files` confere `allowed(..., 'view')`).

## Regras de acesso num DM (`allowedInDm`)

- `view`: ser membro.
- `send`, `attach`, `connect`, `speak`, `share`: ser membro **e** ninguém ter bloqueado (`blockedBetween`, consulta no banco).
- Permissões globais (`manage*`) com um DM: não se aplicam (`false`).
- Bloqueio não esconde o histórico: os dois continuam lendo; só não enviam nem reabrem. Desbloquear reabre a conversa existente.

## Unicidade

O nome do canal é `sha256(menor id | maior id)` (32 caracteres). O índice único `(type, lower(name))` garante no banco
uma conversa por par; se dois `dm:open` correm juntos, um recebe violação de unicidade e `openDm` devolve a existente.

## Pendente

- ~~Lista de DMs, não lidos e chat~~ ✅ B7 (`docs/areas/home.md`): `components/dm/DmList.tsx`, `ChatView` com
  `dm.channel.id` (o canal vem de `dms`, não de `channels`; `useCan` só libera ver/mandar/anexar) e
  `messageAccount(accountId)` (`dm:open` + abre o chat; item "Mensagem" do botão direito).
- Chamadas privadas (B8): a parte de **voz no servidor já existe**. O `voice:join` aceita o canal `dm` (sala
  LiveKit = id da conversa), só os dois membros entram e veem a sala no `voice:state`, e o bloqueio impede entrar
  ("Não foi possível entrar na chamada") e encerra a chamada em andamento (`leaveDmVoice`, chamado pelo
  `friend:block`). ✅ B8: tocar/atender/recusar/desligar (`call:*`), o cartão de chamada recebida e o painel da
  chamada na conversa: `docs/areas/calls.md`.
- O cache de membros fica todo em memória (um processo); com muitos DMs, trocar por consulta com cache LRU.

## Testes

| Arquivo | Cobre |
|---|---|
| `server/repo/dms.test.ts` | `dmName`, criar uma vez e corrida, membros, lista ordenada, DMs fora da lista/limite/`deleteChannel`, `blockedBetween`, `findFriendAccount`. |
| `server/tests/dms.test.ts` | Servidor real: abrir entre amigos e `dm:created` (inclusive outras janelas), corrida, sem amizade/pedido pendente não abre, amizade desfeita mantém, `dm:list`; só membros recebem/leem (nem a dona), de fora não envia nem "digita", anexo não abre para de fora, DM fora do `hello` e imune a `channel:delete`/`set-overrides`; bloqueio dos dois lados e desbloqueio; cache recarregado depois de reiniciar. |

## Depuração

- Mensagem de DM chegando para outra pessoa: o canal não está no cache `dmMembers` (ver `reloadDms` no boot e
  `rememberDm` no `dm:open`); sem ele o canal cai na regra de cargos, onde o @todos vê tudo.
- "Vocês precisam ser amigos para conversar": não há conversa e a relação não é `friend` (pedido pendente não basta).
