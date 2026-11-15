---
name: concord-permissions
description: Como funcionam os cargos e permissões do Concord (v2) — contrato e regra de cálculo compartilhados (can, channelPermissions, globalPermissions, highestPosition), dona da comunidade, @todos, regras por canal (allow/deny), hierarquia de cargos, eventos role:*/member:set-roles/channel:set-overrides/access:*, o que cada handler bloqueia e o que acontece quando o acesso muda. Use ao mexer em src/shared/types/permissions.ts, server/access.ts, server/modules/permissions.ts, server/repo/permissions.ts, server/db/schema/roles.ts, na tela de administração (components/settings/**, lib/permissions.ts, lib/actions/permissions.ts, store/permissions.ts), em qualquer handler que precise checar permissão, ou ao investigar canal que some, "Você não tem permissão", mensagem que não chega ou alguém saindo da voz sozinho.
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
| `src/renderer/src/store/permissions.ts` | App: `access` (o `AccessState` do `hello`/`access:updated`; `null` antes de chegar). |
| `src/renderer/src/lib/actions/permissions.ts` | App: `bindPermissionsEvents` (`access:updated`) e as ações `reloadAccess`, `createRole`, `updateRole`, `deleteRole`, `reorderRoles`, `setMemberRoles`, `setChannelOverrides` (erro do servidor vira exceção com a mensagem dele). |
| `src/renderer/src/lib/permissions.ts` | App: `useCan`, `useCanAdminister`, `useNameColor` e helpers puros (`allows`, `isPrivateChannel`, `rolesByPosition`, `topRole`, `memberRoleIds`, `canManageRole`, `canAssignRole`, `canEditMember`) espelhando a hierarquia do servidor. |
| `src/renderer/src/components/settings/` | Tela de administração (B5): `CommunitySettingsDialog` (abas Cargos e Membros), `ChannelPermissionsDialog` (Negar/Herdar/Liberar por cargo, "Canal privado"), `RoleDot`. |

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

**Conversas privadas (canal `dm`, v3) não seguem esta regra**: `server/access.ts` guarda os membros de cada DM
(`dmMembersOf`) e, nelas, só os dois membros veem (nem a dona); as outras permissões de canal também exigem que
ninguém tenha bloqueado. Regras por canal não se aplicam (`channel:set-overrides` responde "Canal não encontrado").
Detalhes na skill `concord-dms`.

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
| `message:history` | sem `view` = lista vazia (igual canal inexistente); links de anexo assinados para a conta |
| `GET /files/<id>` | link assinado para uma conta (`server/files-signing.ts`); confere de novo se ela vê o canal da mensagem — perdeu o acesso, o link para |
| `message:send` | `send`; com anexos, também `attach`; `message:new` só para quem tem `view` |
| `typing` | `send`; vai só para quem tem `view` (menos quem digita) |
| `voice:join` | sem `view` → "Canal de voz não encontrado" (não revela sala privada); sem `connect` → "Você não tem permissão para entrar nesta sala"; ok devolve `canSpeak`/`canShare` |
| `voice:update` | sem `speak` continua `muted: true` (não dá para se dessilenciar) |
| `voice:state` | cada conexão recebe só as salas que pode ver (`voiceStatesFor`) |
| `moderation:voice-kick` / `moderation:voice-mute` | `canModerate`: `manageMembers` e cargo acima do alvo (nunca a dona nem a si mesmo); sala que não vê = "não está numa sala" (skill `concord-moderation`) |
| `message:delete` | `view` + (autor ou `manageMessages`); em DM só o autor |

Para um handler novo: `await allowed(user.accountId, 'perm', channelId)` antes de agir e `emitToViewers(io,
channelId, evento, payload)` no lugar de `io.emit` quando o evento é de um canal. Nunca confie no que a tela escondeu.

## Quando o acesso muda (`applyAccessChange`)

Depois de qualquer evento acima: recarrega o estado → `access:updated` (por `accessFor`) para cada conexão →
`channels:visible` para cada conexão cuja lista mudou → `applyVoiceAccess(io, access)` em `server/modules/voice.ts`:
quem perdeu `connect` na sala em que está **sai da voz** (e do LiveKit); quem continua e teve `speak`/`share`
alterado recebe as permissões novas no LiveKit na hora (`updateVoicePermissions`; sem `speak` fica silenciado, sem
`share` a tela para); no fim todos recebem o `voice:state` filtrado de novo. O token da entrada já sai com
microfone só se `speak` e tela só se `share` (`publishSources` em `server/livekit.ts`). No app, `replaceChannels` limpa rascunho, histórico, não lidos e a
tela aberta dos canais que sumiram, e sai da voz se a sala sumiu. Apagar canal também recarrega o acesso (as regras
dele saem por cascade).

## No app (voz)

O `VoiceClient` usa o `canSpeak`/`canShare` do `voice:join` e o `ParticipantPermissionsChanged` do LiveKit
(detalhes na `concord-voice`, seção "Permissões de voz no app"): sem `speak` entra só ouvindo e o botão de microfone
só avisa; sem `share` o botão de tela some; mudanças com a pessoa na sala tiram ou devolvem o microfone na hora.

## No app (tela de administração, B5)

O estado de acesso chega no `hello` (`state.access` → `useApp().access`) e é trocado inteiro a cada `access:updated`.
A tela usa a **mesma** `can()` do servidor por `lib/permissions.ts`; com `access === null` (antes do `hello`, ou em
testes antigos) nada é escondido, o servidor bloqueia de qualquer jeito.

| Onde | O que aparece / some |
|---|---|
| Cabeçalho da barra lateral | Engrenagem "Configurações da comunidade" só com `manageRoles` ou `manageMembers` (dona sempre). |
| Seções de canais | Botão **+** só com `manageChannels`. Em cada canal, engrenagem "Permissões do canal" e lixeira também só com `manageChannels`. Cadeado quando o @todos tem `view` negado (canal privado). |
| Aba **Cargos** | Lista do mais para o menos importante (@todos por último). Criar (`manageRoles`; nasce "novo cargo" sem permissões, logo abaixo do seu). Setas subir/descer só nos cargos que posso mexer (manda `role:reorder` com só esses, do menos para o mais importante). Editor: nome (até 32), cor (ou "Sem cor"), permissões de administração e de canal. Cargo no meu nível ou acima fica só leitura; permissão global que não tenho fica travada (`canGrantPermissions`), mas posso desmarcar a que já está. @todos: só permissões. |
| Aba **Membros** | Quem está **online** (uma linha por conta), com um checkbox por cargo. Travado para a dona, para quem está no meu nível ou acima e para cargos que não estão abaixo do meu. |
| Permissões do canal | Lista de cargos (@todos primeiro) e, para o cargo escolhido, cada permissão do tipo do canal (texto: ver/enviar/anexar; voz: ver/entrar/falar/tela) em Negar / Herdar / Liberar. "Canal privado" = negar `view` ao @todos. Salvar manda todas as regras (`channel:set-overrides`), sem as vazias. O rascunho é lido só ao abrir. |
| Lista de membros | Agrupada pelo cargo mais alto de cada pessoa (seções na ordem dos cargos; quem não tem cargo em "Online") e nome na cor de `displayColor` (senão a cor da conta). |
| Botão direito numa pessoa | Submenu **Cargos** com checkbox por cargo atribuível, só se `canEditMember`; erro vira toast. |
| Campo de mensagem | Sem `send`: aviso "Você não tem permissão para enviar mensagens neste canal." no lugar do campo. Sem `attach`: some o clipe, colar arquivo e arrastar para o chat não fazem nada. |

## Pendências conhecidas

- Sem transferência de posse da comunidade.
- A aba Membros só lista quem está online (o app não recebe a lista de contas offline); os cargos de quem está offline continuam valendo.
- Canal de voz sem `connect` continua aparecendo e clicável; o servidor recusa com "Você não tem permissão para entrar nesta sala".

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/types/permissions.test.ts` | Regra de cálculo pura: globais, canal privado, liberar vence negar, regra de cargo × @todos, dependências, `manageChannels` sempre vê, dona, hierarquia, `canGrantPermissions`, `displayColor`, `accessFor`, textos pt-BR. |
| `server/repo/permissions.test.ts` | @todos criado no boot, dona = conta mais antiga, gravar cargos/membros/regras e cascades. |
| `server/tests/permissions.test.ts` | Servidor real: estado de acesso, canal privado (não aparece no `hello`, não recebe `message:new`/`typing`/`voice:state`, não entra na voz), regras de enviar/anexar/entrar (inclusive no @todos), hierarquia (criar abaixo do seu, não dar permissão que não tem, reordenar só a lista exata) e validação de nome, cor, permissões e regras; saída da voz ao perder o acesso; estado no `hello` e `access:updated` filtrados por pessoa; escalada no @todos; `canSpeak`/`canShare`. |
| `src/renderer/src/lib/actions/access.test.ts` | App: `channels:visible` (limpa o que saiu, sai da voz) e `voice:state` sem a própria pessoa. |
| `src/renderer/src/lib/actions/permissions.test.ts` | App: `access:updated`/`reloadAccess` na store e o payload de cada ação (nome sem espaços, regras vazias não vão, erro vira exceção). |
| `src/renderer/src/lib/permissions.test.ts` | Helpers da tela: `allows` (null não esconde), canal privado, ordem e cargo mais alto, `canManageRole`/`canAssignRole`/`canEditMember`. |
| `src/renderer/src/components/settings/settings.test.tsx` | Tela (jsdom): o que some na barra lateral sem permissão, cadeado, criar/editar/reordenar cargo, @todos só permissões, travas de hierarquia, Membros, Permissões do canal (privado, Herdar remove), composer sem enviar/anexar, grupos e cores da lista de membros, submenu Cargos. |

À mão (tela): conta A (dona) abre a engrenagem ao lado de "Concord", cria "Mod" com cor, marca "Gerenciar membros"; na engrenagem de um canal marca "Canal privado" e libera "Ver o canal" para "Mod"; dá "Mod" para B pelo botão direito → o nome de B fica colorido e o canal aparece para B.

À mão (servidor): conta A (dona) cria cargo "Mod" e um canal privado liberado só para "Mod"; conta B sem cargo não vê o canal
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
| Clicar no diálogo de permissões abre o canal / entra na sala | Eventos de portal do Radix sobem pela árvore do **React** até o item do canal (que tem `onClick`/`onKeyDown`). O `ChannelActions` embrulha o diálogo num `<span className="contents">` que para `click` e `keydown`; mantenha isso ao mover o diálogo. Teste: "clicar e digitar dentro das permissões de uma sala" em `settings.test.tsx`. |
| Dona errada | A dona é a conta mais antiga do banco (`accounts.created_at`). Importar um `db.json` antigo pode mudar quem é. |
