---
name: concord-permissions
description: Como funcionam os cargos e permissões do Concord (v2) — contrato e regra de cálculo compartilhados (can, channelPermissions, globalPermissions, highestPosition), dona da comunidade, @todos, regras por canal (allow/deny), hierarquia de cargos, eventos role:*/member:set-roles/channel:set-overrides/access:*, o que cada handler bloqueia e o que acontece quando o acesso muda. Use ao mexer em src/shared/types/permissions.ts, server/access.ts, server/modules/permissions.ts, server/repo/permissions.ts, server/db/schema/roles.ts, em qualquer handler que precise checar permissão, ou ao investigar canal que some, "Você não tem permissão", mensagem que não chega ou alguém saindo da voz sozinho.
---

# Cargos e permissões (v2: A4 servidor, B5 tela)

Modelo do Discord simplificado, para **uma única comunidade**. Cada conta tem o cargo implícito **@todos** mais os
cargos atribuídos; cada canal pode **liberar** ou **negar** permissões por cargo. A regra de cálculo é uma
**função pura compartilhada**: o servidor usa para bloquear e a tela para esconder botões, com o mesmo resultado.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/permissions.ts` | Contrato: permissões, `Role`, `ChannelOverride`, `MemberRoles`, `AccessState`, eventos, e as funções puras (`can`, `channelPermissions`, `globalPermissions`, `highestPosition`, `canGrantPermissions`, `displayColor`, `accessFor`). `PERMISSION_LABELS` em pt-BR. Decisões da revisão no topo do arquivo. |
| `server/access.ts` | Estado de acesso **em memória** (recarregado do banco a cada mudança) + `allowed()`, `visibleChannels()`, `emitToViewers()`, `accessSnapshot()`. Único jeito de os módulos consultarem permissão. |
| `server/modules/permissions.ts` | Eventos `access:get`, `role:create/update/delete/reorder`, `member:set-roles`, `channel:set-overrides`; validação, hierarquia e `applyAccessChange()`. É o **primeiro** módulo em `server/index.ts` (carrega o acesso no boot). |
| `server/repo/permissions.ts` | `ensureEveryoneRole`, `loadAccess` (dona = conta mais antiga), `insertRole`, `updateRole`, `deleteRole`, `setRolePositions`, `setMemberRoles`, `setChannelOverrides`. |
| `server/db/schema/roles.ts` | Tabelas `roles`, `member_roles`, `channel_overrides` (migration `0002_roles`); apagar conta, cargo ou canal apaga as ligações (cascade). |
| `server/modules/{channels,messages,presence,voice}.ts` | Aplicam as permissões (tabela "O que cada handler bloqueia"). |
| `src/renderer/src/lib/actions/channels.ts` | App: `channels:visible` troca a lista de canais e limpa o que era dos canais que saíram (`replaceChannels`). |

## Contrato

- **Globais:** `manageChannels` (criar/apagar canal, editar regras de canal; **sempre vê** todos os canais),
  `manageRoles` (cargos abaixo do seu), `manageMembers` (atribuir cargos abaixo do seu; silenciar/expulsar da voz na
  B6), `manageMessages` (apagar mensagem de outras pessoas, B6).
- **Por canal:** `view`, `send`, `attach`, `connect`, `speak`, `share`.
- **@todos:** id fixo `EVERYONE_ROLE_ID` (`00000000-…`), posição 0, sempre existe, não pode ser apagado nem
  renomeado (só mudam as permissões). Numa comunidade nova tem todas as permissões **de canal** e nenhuma global.
- **Dona:** a primeira conta criada (`accounts.created_at` mais antigo). Pode tudo, não pode ser rebaixada.
  Enquanto não há conta, `currentAccess()` recarrega a cada chamada, então quem se cadastra primeiro vira dona sem
  reiniciar o servidor. Não há transferência de posse.

| Evento (cliente → servidor) | Exige | Observações |
|---|---|---|
| `access:get` → `AccessState` | estar logado | o inicial já vem no `hello` (`state.access`); serve para recarregar |
| `role:create {name, color, permissions}` → `RoleResult` | `manageRoles` + ter um cargo | entra logo abaixo do seu cargo mais alto (a dona cria no topo); até 50 cargos; nome até 32 (não pode ser "@todos"); cor `#rrggbb` ou null |
| `role:update {id, name?, color?, permissions?}` → `RoleResult` | `manageRoles` + cargo abaixo do seu | @todos: só `permissions` (e só quem tem algum cargo) |
| `role:delete roleId` → `OkResult` | `manageRoles` + cargo abaixo do seu | @todos nunca |
| `role:reorder roleIds[]` → `OkResult` | `manageRoles` | a lista tem que ser **exatamente** os cargos que você pode mexer (sem @todos), do menos para o mais importante; reaproveita as mesmas posições |
| `member:set-roles {accountId, roleIds}` → `OkResult` | `manageMembers` | só dá/tira cargos abaixo do seu; não mexe em quem tem cargo igual ou acima, nem na dona |
| `channel:set-overrides {channelId, overrides[]}` → `OkResult` | `manageChannels` | **substitui** todas as regras do canal; um cargo por regra; a mesma permissão não pode estar em `allow` e `deny` |

Servidor → cliente: `access:updated` (para cada conexão, o estado de `accessFor`) e `channels:visible` (lista de
canais que **aquela conexão** pode ver, só para quem mudou).

**O que cada um recebe (`accessFor`):** cargos e membros inteiros (a lista de membros precisa das cores), mas só as
regras dos canais que a pessoa vê; dona e quem tem `manageChannels` recebem tudo. Assim ninguém descobre que existe
um canal privado. Vale para `hello`, `access:get` e `access:updated`. Cor do nome: `displayColor` (cargo mais alto
com cor, ou null).

## Regra de cálculo (`channelPermissions`)

1. Dona → todas.
2. Base = permissões de canal do @todos + dos cargos da pessoa.
3. Regra do canal para o @todos: tira o `deny`, depois põe o `allow`.
4. Regras do canal para os cargos da pessoa: junta todos os `deny` e tira, junta todos os `allow` e põe
   (**liberar vence negar** entre cargos; regra de cargo vence a do @todos).
5. `manageChannels` sempre ganha `view` (admin não se tranca para fora).
6. Dependências: sem `view` → nada; sem `send` → sem `attach`; sem `connect` → sem `speak` e `share`.

Consequência que confunde: tornar um canal privado (`deny view` no @todos) também esconde o canal de moderadores
sem `manageChannels`, a menos que o cargo deles tenha `allow view` nesse canal.

**Hierarquia** (`highestPosition`): dona = infinito, sem cargo = 0. Só se gerencia cargo com posição **menor** que a
do seu cargo mais alto. **Ninguém dá permissão global que não tem** e **globais no @todos só a dona dá**
(`canGrantPermissions`, a mesma função no servidor e na tela); permissões de canal podem ser dadas.

## O que cada handler bloqueia

| Handler | Regra |
|---|---|
| `hello` | devolve só os canais com `view` e só o `voice:state` dessas salas |
| `channel:create` / `channel:delete` | `manageChannels`; `channel:created` só para quem pode ver o canal novo |
| `message:history` | sem `view` = lista vazia (igual canal inexistente) |
| `message:send` | `send`; com anexos, também `attach`; `message:new` só para quem tem `view` |
| `typing` | `send`; vai só para quem tem `view` (menos quem digita) |
| `voice:join` | sem `view` → "Canal de voz não encontrado" (não revela sala privada); sem `connect` → "Você não tem permissão para entrar nesta sala"; ok devolve `canSpeak`/`canShare` |
| `voice:update` | sem `speak` continua `muted: true` (não dá para se dessilenciar) |
| `voice:state` | cada conexão recebe só as salas que pode ver (`voiceStatesFor`) |

Para um handler novo: `await allowed(user.accountId, 'perm', channelId)` antes de agir e `emitToViewers(io,
channelId, evento, payload)` no lugar de `io.emit` quando o evento é de um canal. Nunca confie no que a tela escondeu.

## Quando o acesso muda (`applyAccessChange`)

Depois de qualquer evento acima: recarrega o estado → `access:updated` (por `accessFor`) para cada conexão →
`channels:visible` para cada conexão cuja lista mudou → `applyVoiceAccess(io, access)` em `server/modules/voice.ts`:
quem perdeu `connect` na sala em que está **sai da voz** e todos recebem o `voice:state` filtrado de novo. Com o
LiveKit (B1), é dentro de `applyVoiceAccess` que entra a atualização de `speak`/`share` de quem continua na sala. No app, `replaceChannels` limpa rascunho, histórico, não lidos e a
tela aberta dos canais que sumiram, e sai da voz se a sala sumiu. Apagar canal também recarrega o acesso (as regras
dele saem por cascade).

## Pendências conhecidas

- **Token do LiveKit ainda não usa `speak`/`share`** (depende do #9): combinado no PR #8 — `canPublishSources` =
  microfone se `speak`, tela + áudio da tela se `share`, `canPublish` = um ou outro; e atualizar no LiveKit
  (`RoomService.updateParticipant`) dentro de `applyVoiceAccess` quando mudar com a pessoa na sala (Dev B).
- **Modo "só ouvir" quando `canSpeak` é false** no `VoiceClient` (B2).
- **Download de anexo (`GET /files`) não checa `view`** do canal da mensagem (vale só o id aleatório; ver a parte de
  anexos em `concord-architecture`).
- Sem transferência de posse da comunidade.
- A tela de administração (B5) e o tratamento de `access:updated`/`state.access` no app ainda não existem.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/types/permissions.test.ts` | Regra de cálculo pura: globais, canal privado, liberar vence negar, regra de cargo × @todos, dependências, `manageChannels` sempre vê, dona, hierarquia, `canGrantPermissions`, `displayColor`, `accessFor`, textos pt-BR. |
| `server/repo/permissions.test.ts` | @todos criado no boot, dona = conta mais antiga, gravar cargos/membros/regras e cascades. |
| `server/tests/permissions.test.ts` | Servidor real: estado de acesso, canal privado (não aparece no `hello`, não recebe `message:new`/`typing`/`voice:state`, não entra na voz), regras de enviar/anexar/entrar (inclusive no @todos), hierarquia (criar abaixo do seu, não dar permissão que não tem, reordenar só a lista exata) e validação de nome, cor, permissões e regras; saída da voz ao perder o acesso; estado no `hello` e `access:updated` filtrados por pessoa; escalada no @todos; `canSpeak`/`canShare`. |
| `src/renderer/src/lib/actions/access.test.ts` | App: `channels:visible` (limpa o que saiu, sai da voz) e `voice:state` sem a própria pessoa. |

À mão: conta A (dona) cria cargo "Mod" e um canal privado liberado só para "Mod"; conta B sem cargo não vê o canal
(DevTools → WS: nenhum `message:new` dele); A dá "Mod" para B → o canal aparece para B na hora; A tira → some, e B
sai da voz se estava na sala.

## Depuração

| Sintoma | Causa e solução |
|---|---|
| Ninguém consegue criar canal | Esperado na v2: exige `manageChannels`. A dona cria, ou dê a permissão a um cargo (ou ao @todos). |
| "Você não pode dar permissões que não tem" | Quem edita o cargo não tem aquela permissão global. Só a dona ou quem já tem pode dar. |
| "Você só pode alterar cargos abaixo do seu" | Hierarquia: reordene (`role:reorder`) ou peça para alguém acima. |
| Canal sumiu para alguém | Perdeu `view` (regra do canal ou cargo removido): veio `channels:visible`. Confira as regras do canal para o @todos e para os cargos dela. |
| Mensagem não chega para alguém | `emitToViewers` só manda para quem tem `view` no canal. |
| Alguém saiu da voz sozinho | Perdeu `connect` naquela sala depois de uma mudança de cargo/regra. |
| Dona errada | A dona é a conta mais antiga do banco (`accounts.created_at`). Importar um `db.json` antigo pode mudar quem é. |
