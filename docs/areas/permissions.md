# Cargos e permissões (v2: A4 servidor, B5 tela)

Modelo do Discord simplificado, para **uma única comunidade**. Cada conta tem o cargo implícito **@todos** mais os
cargos atribuídos; cada canal pode **liberar** ou **negar** permissões por cargo. A regra de cálculo é uma
**função pura compartilhada**: o servidor usa para bloquear e a tela para esconder botões, com o mesmo resultado.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/permissions.ts` | Contrato: permissões, `Role`, `ChannelOverride`, `MemberRoles`, `AccessState`, eventos, e as funções puras (`can`, `channelPermissions`, `globalPermissions`, `hasFullAccess`, `highestPosition`, `canGrantPermissions`, `canManageRole`, `reorderableRoles`, `reorderedPositions`, `canChangeAnyMemberRoles`, `canChangeMemberRoles`, `canAssignRole`, `displayColor`, `accessFor`). `PERMISSION_LABELS` em pt-BR. Decisões da revisão no topo do arquivo. |
| `server/access.ts` | Estado de acesso **em memória** (recarregado do banco a cada mudança) + `allowed()`, `visibleChannels()`, `emitToViewers()`, `accessSnapshot()`. Único jeito de os módulos consultarem permissão. |
| `server/modules/permissions.ts` | Eventos `access:get`, `role:create/update/delete/reorder`, `member:set-roles`, `channel:set-overrides`; validação, mensagens de erro e `applyAccessChange()` (as regras vêm do contrato). É o **primeiro** módulo em `server/index.ts` (carrega o acesso no boot). |
| `server/repo/permissions.ts` | `ensureEveryoneRole`, `loadAccess` (dona = conta mais antiga), `insertRole`, `updateRole`, `deleteRole`, `setRolePositions`, `setMemberRoles`, `setChannelOverrides`. |
| `server/db/schema/roles.ts` | Tabelas `roles`, `member_roles`, `channel_overrides` (migration `0002_roles`); apagar conta, cargo ou canal apaga as ligações (cascade). |
| `server/modules/{channels,messages,presence,voice}.ts` | Aplicam as permissões (tabela "O que cada handler bloqueia"). |
| `src/renderer/src/lib/actions/channels.ts` | App: `channels:visible` troca a lista de canais e limpa o que era dos canais que saíram (`replaceChannels`). |
| `src/renderer/src/store/permissions.ts` | App: `access` (o `AccessState` do `hello`/`access:updated`; `null` antes de chegar). |
| `src/renderer/src/lib/actions/permissions.ts` | App: `bindPermissionsEvents` (`access:updated`) e as ações `reloadAccess`, `createRole`, `updateRole`, `deleteRole`, `reorderRoles`, `setMemberRoles`, `setChannelOverrides` (erro do servidor vira exceção com a mensagem dele). |
| `src/renderer/src/lib/permissions.ts` | App: `useCan`, `useCanAdminister`, `useNameColor` e helpers puros (`allows`, `isPrivateChannel`, `rolesByPosition`, `topRole`, `memberRoleIds`), todos sobre a `can()` compartilhada (o Administrador vale aqui sozinho). Hierarquia vem direto de `@shared/types` (`canManageRole`, `reorderableRoles`, `canChangeMemberRoles`, `canAssignRole`, `hasFullAccess`). |
| `src/renderer/src/components/settings/` | Tela de administração (B5): `CommunitySettingsDialog` (abas Cargos e Membros; arrastar/botões/Alt+setas para reordenar; aviso do Administrador), `ChannelPermissionsDialog` (Negar/Herdar/Liberar por cargo, "Canal privado"), `RoleDot`. |

## Contrato

- **Globais:** `administrator` ("Administrador": acesso total, seção própria abaixo), `manageChannels` (criar/apagar canal, editar regras de canal; **sempre vê** todos os canais),
  `manageRoles` (cargos abaixo do seu), `manageMembers` (atribuir cargos abaixo do seu; silenciar/expulsar da voz na
  B6), `manageMessages` (apagar mensagem de outras pessoas, B6), `mentionEveryone` (mencionar @todos, B19: sem ela o `<@todos>` vira texto comum), `moveMembers` (mover quem
  está abaixo para outra sala de voz, sem ganhar silenciar/expulsar; `manageMembers` também move),
  `assignRoles` (só dar/tirar cargos abaixo do seu, sem os poderes de moderação de `manageMembers`),
  `kickMembers` (expulsar da comunidade, A19), `banMembers` (banir, ver e tirar banimentos, A19; também abre a engrenagem
  da comunidade na aba Banidos) e `timeoutMembers` (castigo, A20). As três seguem a hierarquia do `canModerate`
  (`docs/areas/moderation.md`).
- **Por canal:** `view`, `send`, `attach`, `connect`, `speak`, `share`, `video` (câmera, B21; comunidades antigas
  ganharam `video` onde havia `share` pela migration `0010_camera_permission`).
- **@todos:** id fixo `EVERYONE_ROLE_ID` (`00000000-…`), posição 0, sempre existe, não pode ser apagado nem
  renomeado (só mudam as permissões). Numa comunidade nova tem todas as permissões **de canal** e nenhuma global.
- **Dona:** a primeira conta criada (`accounts.created_at` mais antigo). Pode tudo, não pode ser rebaixada.
  Enquanto não há conta, `currentAccess()` recarrega a cada chamada, então quem se cadastra primeiro vira dona sem
  reiniciar o servidor. Não há transferência de posse.

| Evento (cliente → servidor) | Exige | Observações |
|---|---|---|
| `access:get` → `AccessState` | estar logado | o inicial já vem no `hello` (`state.access`); serve para recarregar |
| `role:create {name, color, permissions}` → `RoleResult` | `manageRoles` + ter um cargo | entra logo abaixo do seu cargo mais alto (a dona cria no topo); até 50 cargos; nome até 32 (não pode ser "@todos"); cor `#rrggbb` ou null |
| `role:update {id, name?, color?, permissions?}` → `RoleResult` | `manageRoles` + `canManageRole` | @todos: só `permissions` (e só quem tem algum cargo). Cargo com Administrador: só dona/admin |
| `role:delete roleId` → `OkResult` | `manageRoles` + `canManageRole` | @todos nunca. Cargo com Administrador: só dona/admin |
| `role:reorder roleIds[]` → `OkResult` | `manageRoles` | `reorderedPositions`: a lista tem que ser **exatamente** os cargos que você pode mover (`reorderableRoles`, sem @todos), do menos para o mais importante; reaproveita as mesmas posições, gravadas numa transação (`setRolePositions`). `LIMITS.roleReorder` (10 seguidas, depois 1 a cada 2 s) |
| `member:set-roles {accountId, roleIds}` → `OkResult` | `assignRoles` ou `manageMembers` | `canChangeMemberRoles` no alvo (qualquer membro, inclusive no seu nível ou acima; só não a dona nem a si mesmo) e `canAssignRole` em cada cargo dado ou tirado (só abaixo do seu; @todos nunca; os cargos acima do seu que o alvo já tem ficam como estão). A dona pode tudo, inclusive em si |
| `channel:set-overrides {channelId, overrides[]}` → `OkResult` | `manageChannels` | **substitui** todas as regras do canal; um cargo por regra; a mesma permissão não pode estar em `allow` e `deny` |

Servidor → cliente: `access:updated` (para cada conexão, o estado de `accessFor`) e `channels:visible` (lista de
canais que **aquela conexão** pode ver, só para quem mudou).

**O que cada um recebe (`accessFor`):** cargos e membros inteiros (a lista de membros precisa das cores), mas só as
regras dos canais que a pessoa vê; dona e quem tem `manageChannels` recebem tudo. Assim ninguém descobre que existe
um canal privado. Vale para `hello`, `access:get` e `access:updated`. Cor do nome: `displayColor` (cargo mais alto
com cor, ou null).

## Regra de cálculo (`channelPermissions`)

1. Dona ou Administrador (`hasFullAccess`) → todas, sem olhar as regras do canal.
2. Base = permissões de canal do @todos + dos cargos da pessoa.
3. Regra do canal para o @todos: tira o `deny`, depois põe o `allow`.
4. Regras do canal para os cargos da pessoa: junta todos os `deny` e tira, junta todos os `allow` e põe
   (**liberar vence negar** entre cargos; regra de cargo vence a do @todos).
5. `manageChannels` sempre ganha `view` (admin não se tranca para fora).
6. Dependências: sem `view` → nada; sem `send` → sem `attach`; sem `connect` → sem `speak`, `share` e `video`.

**Conversas privadas (canal `dm`, v3) não seguem esta regra**: `server/access.ts` guarda os membros de cada DM
(`dmMembersOf`) e, nelas, só os dois membros veem (nem a dona, nem quem tem Administrador: `allowed()` resolve o DM
antes de chamar a `can()`); as outras permissões de canal também exigem que
ninguém tenha bloqueado. Regras por canal não se aplicam (`channel:set-overrides` responde "Canal não encontrado").
Detalhes na `docs/areas/dms.md`.

Consequência que confunde: tornar um canal privado (`deny view` no @todos) também esconde o canal de moderadores
sem `manageChannels`, a menos que o cargo deles tenha `allow view` nesse canal.

**Hierarquia** (`highestPosition`): dona = infinito, sem cargo = 0. Só se gerencia cargo com posição **menor** que a
do seu cargo mais alto (`canManageRole`; o @todos com qualquer cargo). **Ninguém dá permissão global que não tem** e
**globais no @todos só a dona dá** (`canGrantPermissions`, a mesma função no servidor e na tela); permissões de canal
podem ser dadas. Dona e Administrador ignoram a hierarquia (seção abaixo).

## Reordenar cargos

Regra pura no contrato, a mesma no servidor e na tela:

| Função | Regra |
|---|---|
| `reorderableRoles(access, quem)` | os cargos que `canManageRole` deixa mexer, sem o @todos, do menos para o mais importante. Com `manageRoles`: só os **abaixo** do seu cargo mais alto (nem o seu, nem os de cima). Dona e Administrador: todos. |
| `reorderedPositions(access, quem, ids)` | `null` se `ids` não é **exatamente** a lista de `reorderableRoles` (faltando, sobrando, repetido, id desconhecido, @todos, não é array); senão o mapa id → posição, reaproveitando as posições que esses cargos já ocupavam. |

Como as posições são as mesmas, ninguém consegue levar um cargo para cima do seu: o conjunto de posições não muda,
só quem fica em cada uma. O @todos fica sempre na posição 0. Servidor: id conhecido que você não pode mover →
"Você só pode mover cargos abaixo do seu"; lista malformada → "Lista de cargos inválida"; nada é gravado nos dois
casos. A gravação é uma transação (`setRolePositions`) e termina em `applyAccessChange` (`access:updated` para todos).

## Administrador

Permissão global `administrator` (rótulo "Administrador (acesso total: …)"). Decisão e riscos no ADR
`docs/decisions/0008-permissao-administrador.md`.

| O que muda | Regra |
|---|---|
| `hasFullAccess(access, conta)` | dona **ou** algum cargo da pessoa (inclusive @todos) com `administrator`. |
| `globalPermissions` / `channelPermissions` / `can` | `hasFullAccess` → todas, em todos os canais, mesmo com regra de canal que negaria. Vale para `allowed()`, `useCan`, `useCanAdminister` e `accessFor` (recebe todas as regras). |
| `canManageRole`, `reorderableRoles` | admin edita, apaga e reordena **qualquer** cargo, inclusive os acima do seu. |
| `canAssignRole` | admin dá e tira qualquer cargo (menos o @todos). |
| `canModerate` / `canMoveMember` | admin modera e move qualquer pessoa, inclusive acima dele e outros admins. |
| Cargo com `administrator` | quem **não** é dona/admin não edita, apaga, reordena, dá nem tira esse cargo, mesmo abaixo do seu ("Só a dona ou um administrador mexe em cargos com Administrador"). Ligar a permissão num cargo já é barrado por `canGrantPermissions` (ninguém dá o que não tem). |

Limites que continuam para o admin: não mexe nos cargos da dona nem a modera; **não mexe nos próprios cargos**
(`canChangeMemberRoles`, para não tirar o próprio Administrador por engano nem fugir da trava); não põe permissão
global no @todos (só a dona: senão tornaria todo mundo admin); conversas privadas continuam só dos dois membros.
Pode, porém, editar o próprio cargo pela aba Cargos (inclusive desmarcar Administrador) e mexer em outros admins.

**Alterar cargos de alguém** (funções puras, as mesmas no servidor e na tela):

| Função | Regra |
|---|---|
| `canChangeAnyMemberRoles(access, conta)` | tem `assignRoles` ou `manageMembers` (a dona e o Administrador têm as duas). Decide a engrenagem da comunidade junto com `manageRoles`. |
| `canChangeMemberRoles(access, quem, alvo)` | dona: sempre. Os demais: `canChangeAnyMemberRoles`, alvo não é a dona nem a própria pessoa. **Sem hierarquia no alvo**: vale para quem está abaixo, no mesmo nível ou acima (ADR `docs/decisions/0007-alterar-cargos-de-qualquer-membro.md`). |
| `canAssignRole(access, quem, cargo)` | nunca o @todos; dona e Administrador: qualquer outro; cargo com Administrador: só eles; os demais: `canChangeAnyMemberRoles` e posição do cargo menor que a do seu cargo mais alto. |

A hierarquia que vale para alterar cargos de alguém é a dos **cargos** (`canAssignRole`), não a do alvo: com a
permissão, dá para dar ou tirar de um admin acima de você os cargos abaixo do seu, mas não tirar dele o cargo que está
acima do seu. Risco aceito no ADR 0007. A moderação (`canModerate`/`canMoveMember`) continua exigindo o alvo abaixo (menos para o Administrador).

Mexer nos próprios cargos é recusado mesmo com cargo abaixo do seu: antes era permitido e deixava quem tinha
`manageMembers` se dar um cargo inferior com permissão global que não tinha (ex.: `manageChannels`).
`manageMembers` continua valendo para atribuir cargos (cargos existentes não quebram); `assignRoles` é a forma de
dar só isso, sem silenciar/expulsar da voz.

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
| `voice:preview-get` | sem `view` ou sem `connect` na sala de quem compartilha → "Prévia indisponível" (mesma resposta de conexão inexistente; não revela sala privada) |
| `voice:update` | sem `speak` continua `muted: true` (não dá para se dessilenciar) |
| `voice:state` | cada conexão recebe só as salas que pode ver (`voiceStatesFor`) |
| `moderation:voice-kick` / `moderation:voice-mute` | `canModerate`: `manageMembers` e cargo acima do alvo, ou Administrador em qualquer um (nunca a dona nem a si mesmo); sala que não vê = "não está numa sala" (`docs/areas/moderation.md`) |
| `moderation:voice-move` / `tools:move-teams` (mover outra pessoa) | `canMoveMember`: `moveMembers` **ou** `manageMembers`, com a mesma hierarquia do `canModerate` (Administrador sem hierarquia); a pessoa precisa de `view` + `connect` na sala de destino |
| `moderation:kick` / `moderation:ban` / `moderation:timeout` | `canKickMember` / `canBanMember` / `canTimeoutMember`: a permissão própria (`kickMembers`, `banMembers`, `timeoutMembers`) e cargo acima do alvo, ou Administrador (nunca a dona nem a si mesmo) |
| `moderation:unban` / `moderation:bans` | `banMembers` |
| `message:send` / `message:react` | castigo valendo → "Você está de castigo até HH:MM" (antes das outras regras de canal no envio) |
| `role:*` / `member:set-roles` | tabela de eventos acima; cargo com Administrador só a dona ou um admin |
| todos os de canal (`allowed()`) | Administrador passa como a dona; em DM, só os membros |
| `message:delete` | `view` + (autor ou `manageMessages`); em DM só o autor |

Para um handler novo: `await allowed(user.accountId, 'perm', channelId)` antes de agir e `emitToViewers(io,
channelId, evento, payload)` no lugar de `io.emit` quando o evento é de um canal. Nunca confie no que a tela escondeu.

## Quando o acesso muda (`applyAccessChange`)

Depois de qualquer evento acima: recarrega o estado → `access:updated` (por `accessFor`) para cada conexão →
`channels:visible` para cada conexão cuja lista mudou → `applyVoiceAccess(io, access)` em `server/modules/voice.ts`:
quem perdeu `connect` na sala em que está **sai da voz** (e do LiveKit); quem continua e teve `speak`/`share`
alterado recebe as permissões novas no LiveKit na hora (`updateVoicePermissions`; sem `speak` fica silenciado, sem
`share` a tela para); no fim todos recebem o `voice:state` filtrado de novo. O token da entrada já sai com
microfone só se `speak`, tela só se `share` e câmera só se `video` (`publishSources` em `server/livekit.ts`). No app, `replaceChannels` limpa rascunho, histórico, não lidos e a
tela aberta dos canais que sumiram, e sai da voz se a sala sumiu. Apagar canal também recarrega o acesso (as regras
dele saem por cascade).

## No app (voz)

O `VoiceClient` usa o `canSpeak`/`canShare` do `voice:join` e o `ParticipantPermissionsChanged` do LiveKit
(detalhes na `docs/areas/voice.md`, seção "Permissões de voz no app"): sem `speak` entra só ouvindo e o botão de microfone
só avisa; sem `share` o botão de tela some; mudanças com a pessoa na sala tiram ou devolvem o microfone na hora.

## No app (tela de administração, B5)

O estado de acesso chega no `hello` (`state.access` → `useApp().access`) e é trocado inteiro a cada `access:updated`.
A tela usa a **mesma** `can()` do servidor por `lib/permissions.ts`; com `access === null` (antes do `hello`, ou em
testes antigos) nada é escondido, o servidor bloqueia de qualquer jeito.

| Onde | O que aparece / some |
|---|---|
| Cabeçalho da barra lateral | Engrenagem "Configurações da comunidade" só com `manageRoles`, `assignRoles` ou `manageMembers` (dona sempre). |
| Seções de canais | Botão **+** só com `manageChannels`. Em cada canal, engrenagem "Permissões do canal" e lixeira também só com `manageChannels`. Cadeado quando o @todos tem `view` negado (canal privado). |
| Aba **Cargos** | Lista do mais para o menos importante (@todos por último). Criar (`manageRoles`; nasce "novo cargo" sem permissões, logo abaixo do seu). Reordenar só os cargos de `reorderableRoles`: **arrastar** o cargo e soltar sobre outro (HTML5 drag and drop, como o `ScreenStage`), botões "Mover <cargo> para cima/para baixo" ou **Alt + seta** com o foco no cargo; manda `role:reorder` com só esses, do menos para o mais importante. Os outros (o meu, os de cima, o @todos, cargo de admin para quem não é admin) mostram um cadeado "<cargo>: você não pode mover este cargo" e não arrastam. Editor: nome (até 32), cor (ou "Sem cor"), permissões de administração (Administrador primeiro, com aviso em vermelho de acesso total) e de canal. Cargo no meu nível ou acima fica só leitura ("Só a dona ou um administrador mexe em cargos com Administrador." se for cargo de admin); permissão global que não tenho fica travada (`canGrantPermissions`), mas posso desmarcar a que já está. @todos: só permissões. |
| Aba **Membros** | Quem está **online** (uma linha por conta), com um checkbox por cargo (todos aparecem, para ver os cargos da pessoa). Travado quando `canChangeMemberRoles` é falso (a dona, eu mesmo) e nos cargos em que `canAssignRole` é falso (os do meu nível ou acima), inclusive em quem está acima de mim. |
| Permissões do canal | Lista de cargos (@todos primeiro) e, para o cargo escolhido, cada permissão do tipo do canal (texto: ver/enviar/anexar; voz: ver/entrar/falar/tela) em Negar / Herdar / Liberar. "Canal privado" = negar `view` ao @todos. Salvar manda todas as regras (`channel:set-overrides`), sem as vazias. O rascunho é lido só ao abrir. |
| Lista de membros | Agrupada pelo cargo mais alto de cada pessoa (seções na ordem dos cargos; quem não tem cargo em "Online") e nome na cor de `displayColor` (senão a cor da conta). |
| Botão direito numa pessoa | Submenu **Cargos** só com os cargos em que `canAssignRole`, e só se `canChangeMemberRoles`; erro vira toast. |
| Campo de mensagem | Sem `send`: aviso "Você não tem permissão para enviar mensagens neste canal." no lugar do campo. Sem `attach`: some o clipe, colar arquivo e arrastar para o chat não fazem nada. |

## Pendências conhecidas

- Sem transferência de posse da comunidade.
- A aba Membros só lista quem está online (o app não recebe a lista de contas offline); os cargos de quem está offline continuam valendo.
- Canal de voz sem `connect` continua aparecendo e clicável; o servidor recusa com "Você não tem permissão para entrar nesta sala".

## Testes

| Arquivo | Cobre |
|---|---|
| `src/shared/types/permissions.test.ts` | Regra de cálculo pura: globais, canal privado, liberar vence negar, regra de cargo × @todos, dependências, `manageChannels` sempre vê, dona, hierarquia, `canGrantPermissions`, alterar cargos dos membros (`canChangeMemberRoles`/`canAssignRole`), `canManageRole`, reordenar (`reorderableRoles`/`reorderedPositions`: permitido, o seu e os de cima, @todos, lista incompleta/repetida, posições não contíguas), Administrador (passa em tudo, ignora hierarquia, não mexe na dona nem em si, só dona/admin concede ou mexe em cargo de admin, nada no @todos), `displayColor`, `accessFor`, textos pt-BR. `moderation.test.ts`: admin modera e move qualquer um menos a dona e a si. |
| `server/repo/permissions.test.ts` | @todos criado no boot, dona = conta mais antiga, gravar cargos/membros/regras e cascades. |
| `server/tests/permissions.test.ts` | Servidor real: estado de acesso, canal privado (não aparece no `hello`, não recebe `message:new`/`typing`/`voice:state`, não entra na voz), regras de enviar/anexar/entrar (inclusive no @todos), hierarquia (criar abaixo do seu, não dar permissão que não tem, reordenar só a lista exata), `assignRoles` (dá cargo abaixo a quem está abaixo, no mesmo nível ou acima sem tocar nos cargos altos dele; recusa sem a permissão, cargo igual/acima, dona e a si mesmo) e `manageMembers` não se dá cargo inferior e validação de nome, cor, permissões e regras; saída da voz ao perder o acesso; estado no `hello` e `access:updated` filtrados por pessoa; escalada no @todos; `canSpeak`/`canShare`; reordenar (gerente troca os de baixo e todos recebem `access:updated`; o seu, os de cima e @todos recusados; lista inválida recusada sem gravar; dona move tudo); Administrador (usa canal com regra que nega, edita/dá/reordena/apaga cargo acima, expulsa da voz quem está acima, não mexe na dona nem em si, só dona/admin cria/liga/dá/edita cargo de admin). `server/tests/limits.test.ts`: `role:reorder` 10 seguidos, o 11º recusado. |
| `src/renderer/src/lib/actions/access.test.ts` | App: `channels:visible` (limpa o que saiu, sai da voz) e `voice:state` sem a própria pessoa. |
| `src/renderer/src/lib/actions/permissions.test.ts` | App: `access:updated`/`reloadAccess` na store e o payload de cada ação (nome sem espaços, regras vazias não vão, erro vira exceção). |
| `src/renderer/src/lib/permissions.test.ts` | Helpers da tela: `allows` (null não esconde; Administrador passa em tudo), canal privado, ordem e cargo mais alto. |
| `src/renderer/src/components/settings/settings.test.tsx` | Tela (jsdom): o que some na barra lateral sem permissão, cadeado, criar/editar/reordenar cargo, @todos só permissões, travas de hierarquia, Membros, Permissões do canal (privado, Herdar remove), composer sem enviar/anexar, grupos e cores da lista de membros, submenu Cargos, `assignRoles` (engrenagem, permissão na tela de cargos, Membros sem mexer em si, submenu só com cargos abaixo, também em quem está acima); Membros dá cargo a quem está acima com o cargo alto dele travado; reordenar (arrastar e soltar, Alt + seta, "Mover … para cima/baixo", cargos travados com cadeado que não arrastam), Administrador (move e edita cargos acima, a dona liga com o aviso, sem admin a opção fica travada e o cargo de admin só leitura). |

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
| "Você não tem permissão para alterar cargos dos membros" | Falta `assignRoles` (ou `manageMembers`) em algum cargo da pessoa. |
| "Você não pode alterar os próprios cargos" | Só a dona mexe nos próprios cargos; peça para alguém acima. |
| "Você não pode alterar os cargos da dona da comunidade" | Só a dona mexe nos cargos dela (ela já tem todas as permissões). |
| "Você só pode dar ou tirar cargos abaixo do seu" | O cargo marcado/desmarcado está no seu nível ou acima. Vale para qualquer alvo, inclusive quem está acima de você (ADR 0007). |
| "Você só pode mover cargos abaixo do seu" | `role:reorder` com o seu cargo, um acima ou o @todos. Só a dona ou um admin move esses. |
| "Lista de cargos inválida" | `role:reorder` sem todos os cargos que você pode mover, com repetido ou id que não existe (a tela estava desatualizada: recarregue). |
| "Muitas alterações seguidas" (reordenar) | `LIMITS.roleReorder`: 10 seguidas, depois 1 a cada 2 s. |
| "Só a dona ou um administrador mexe em cargos com Administrador" | Editar, apagar, dar ou tirar um cargo que tem Administrador sem ser dona/admin, mesmo que o cargo esteja abaixo do seu. |
| Admin não consegue mudar os próprios cargos | Esperado: a trava de si mesmo vale para o admin (ADR 0008). Peça para a dona ou outro admin. |
| Canal sumiu para alguém | Perdeu `view` (regra do canal ou cargo removido): veio `channels:visible`. Confira as regras do canal para o @todos e para os cargos dela. |
| Mensagem não chega para alguém | `emitToViewers` só manda para quem tem `view` no canal. |
| Alguém saiu da voz sozinho | Perdeu `connect` naquela sala depois de uma mudança de cargo/regra. |
| Clicar no diálogo de permissões abre o canal / entra na sala | Eventos de portal do Radix sobem pela árvore do **React** até o item do canal (que tem `onClick`/`onKeyDown`). O `ChannelActions` embrulha o diálogo num `<span className="contents">` que para `click` e `keydown`; mantenha isso ao mover o diálogo. Teste: "clicar e digitar dentro das permissões de uma sala" em `settings.test.tsx`. |
| Dona errada | A dona é a conta mais antiga do banco (`accounts.created_at`). Importar um `db.json` antigo pode mudar quem é. |
