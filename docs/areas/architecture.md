# Arquitetura do Concord

## Peças

```
┌──────────── App Electron (um por usuário) ────────────┐        ┌──────── server/ ─────────────────┐
│ main (src/main)      janela, microfone, login Google  │        │ index.ts: http + Socket.IO       │
│ preload (src/preload) window.api                      │        │   (porta 3001) + lista de módulos│
│ renderer (React)                                      │  HTTP  │ modules/<dominio>.ts: handlers   │
│   components ──lê──> store/ (zustand, slices)         │  + WS  │ repo/<dominio>.ts: dados (async) │
│        └──chama──> lib/client.ts ──fetch/socket────────┼───────>│   └─> db/ (Drizzle → Postgres    │
│                                                       │        │        ou PGlite)                │
│                     └ lib/actions/<dominio>.ts         │        │ memória: users (context), voice  │
│                        └──> lib/voice.ts ──────────────┼─┐      │ livekit.ts: token + kick da sala │
└───────────────────────────────────────────────────────┘ │      └──────────────┬───────────────────┘
                                                          │ áudio (WebRTC)    │ API (Twirp)
                                                          └──────► LiveKit ◄───┘  (docker compose, SFU)
```

## Organização por domínio

Cada domínio (`account`, `channel`, `message`, `presence`, `voice`) aparece nas mesmas camadas:

| Camada | Onde | Registro (só linhas de registro) |
|---|---|---|
| Contrato | `src/shared/types/<dominio>.ts` (tipos + `<Dominio>ClientEvents`/`ServerEvents`) | `src/shared/types/index.ts` |
| Tabelas | `server/db/schema/<dominio>.ts` (Drizzle) + migration gerada em `server/db/migrations/` | `server/db/schema/index.ts` |
| Dados | `server/repo/<dominio>.ts` (async; único que importa `server/db/`) | — |
| Servidor | `server/modules/<dominio>.ts` (`ServerModule` com `socket?` e `http?`) | lista `modules` em `server/index.ts` |
| Ações | `src/renderer/src/lib/actions/<dominio>.ts` (`bind<Dominio>Events` + funções) | `connect()` e `export *` em `lib/client.ts` |
| Estado | `src/renderer/src/store/<dominio>.ts` (interface + `<dominio>Initial`) | `store/index.ts` |

`server/context.ts` guarda os tipos `AppServer`/`AppSocket`, o mapa `users` (online) e `guard()`. A voz guarda
seu próprio mapa dentro de `modules/voice.ts` e expõe `voiceStates()`, `emitVoice()` e `clearVoiceChannel()`.
No renderer, `lib/core.ts` guarda o socket atual, `set`/`get` e `notify`.

O processo main não fala com o servidor do Concord. Ele só abre o navegador para o login com Google e devolve o
código ao renderer (IPC `google-sign-in`), cuida do compartilhamento de tela (IPC `screen-*`), mostra as
notificações nativas e o selo do ícone (IPC `notify`/`badge`/`notification-click`, `docs/areas/notifications.md`)
a janela do overlay em jogos (IPC `overlay-*`, atalho global, segunda página do renderer; skill
`docs/areas/overlay.md`), a atualização automática (IPC `update-*`, `docs/areas/updates.md`) e o pressione para falar
(IPC `ptt-*`, gancho de teclado/mouse do sistema com `uiohook-napi`; `docs/areas/voice.md`) e o vidro do tema translúcido
(IPC `window-translucency`, `docs/areas/themes.md`). Toda a rede com o servidor acontece no renderer: **HTTP** para
cadastro/login (antes de existir socket) e **Socket.IO** para o resto. Detalhes das contas: `docs/areas/accounts.md`.

## Modelo de dados (`src/shared/types/`)

- `Channel { id, name, type: 'text' | 'voice', createdAt }`
- `User { id, accountId, name, tag, color, avatarUrl }`: `id` é o `socket.id` (presença/voz); `accountId` identifica a conta. A pessoa aparece como `nome#tag`. A tag (1 a 5 letras/números) é **única entre todas as contas e imutável**: é o que diferencia pessoas com o mesmo nome. Exceção: conta criada pelo Google recebe tag provisória (`tagLocked: false`) e escolhe a definitiva uma única vez.
- `AccountInfo`: dados da própria conta (e-mail, `hasPassword`, `hasGoogle`, `tagLocked`), recebidos só pelo dono no `hello`.
- `Message { id, channelId, author: User, content, attachments, createdAt, kind?, tool?, editedAt?, replyTo? }` (`editedAt` = editada, A15; `replyTo` = resumo da mensagem respondida, B18; `reactions` = reações, A16; `mentions` = contas mencionadas com o nome atual, B19 (no texto: `<@id>`/`<@todos>`); `docs/areas/messages.md`) (`kind: 'tool'` = resultado de ferramenta da v4, com `tool` tipado; ausente = texto): o banco guarda `author_id` (conta) e o histórico junta com a conta, então mostra nome/foto **atuais**. Em `message:new`, `author.id` é o socket de quem enviou; no histórico é o id da conta. Identifique a pessoa sempre por `author.accountId`.
- Histórico paginado: `message:history { channelId, before? }` → `{ messages, hasMore }`, 50 por página (`HISTORY_PAGE_SIZE`), da mais antiga para a mais nova. A ordem vem da coluna `seq` (ordem de chegada). Sem limite de mensagens guardadas.

## Permissões (v2)

Contrato e regra de cálculo em `src/shared/types/permissions.ts` (`can`, `channelPermissions`, `globalPermissions`,
`highestPosition`), usados pelo servidor e pela tela. Cargos (`roles`), cargos de cada conta (`member_roles`) e regras
por canal (`channel_overrides`) ficam no banco; `server/access.ts` guarda o estado em memória e recarrega depois de
cada mudança. A **dona** (primeira conta) pode tudo; o `@todos` (id fixo `EVERYONE_ROLE_ID`) vale para todo mundo e
começa com as permissões de canal, sem as de administração (criar/apagar canal exige `manageChannels`).
`hello`, `voice:state`, `message:new`, `typing` e `channel:created` só chegam a quem pode ver o canal. O estado de
acesso vem no `hello` (`state.access`) e no `access:updated`, sempre por `accessFor` (cargos e membros inteiros; regras
só dos canais que a pessoa vê). Mudou o acesso → `access:updated`, `channels:visible` (para quem ganhou/perdeu canais) e
`applyVoiceAccess` (em `modules/voice.ts`): quem perdeu `connect` sai da voz. `voice:join` devolve `canSpeak`/`canShare`/`canVideo` (câmera, B21);
sem `speak` a pessoa aparece sempre silenciada. Ninguém concede permissão global que não tem (`canGrantPermissions`),
e globais no @todos só a dona. O token do LiveKit sai com microfone só se `speak`, tela só se `share` e câmera só se `video`, e
`applyVoiceAccess` atualiza isso ao vivo (`RoomService.UpdateParticipant`). Links de anexo são assinados por pessoa e o
download confere `view` (`server/files-signing.ts`). Pendente: transferência de posse da comunidade.

## Banco (`server/db/`)

Anexos: o app envia o arquivo por HTTP (`POST /uploads`, corpo = bytes, `Authorization: Bearer <token>`,
`X-File-Name`) e recebe um `Attachment` (`id`, `name`, `size`, `contentType`, `url`, `width`, `height`); depois
manda os ids no `message:send`. `GET /files/<id>/<nome>` serve só anexos já publicados: PNG/JPEG/GIF/WebP
confirmados pelos bytes vão inline, o resto como download `octet-stream` (HTML/SVG nunca rodam). Anexo solto
há mais de 1 h é apagado; apagar o canal apaga os arquivos. Permissão por canal no download entra na v2.

PostgreSQL via Drizzle. `client.ts` abre `DATABASE_URL` com `pg`; sem ela, abre o **PGlite** (Postgres em
WebAssembly) em `DATA_DIR/pgdata`. Mesmo schema e mesmas migrations nos dois, aplicadas no boot (`server/index.ts`
abre o banco antes do `listen` e roda o `init` dos módulos). Tabelas: `accounts`, `sessions`, `channels`,
`messages`, `attachments` (bytes no `FileStorage`, `DATA_DIR/uploads/<id>`), `server_mutes` (silêncio pelo servidor, B6; o módulo de voz carrega no `init`). O banco garante
unicidade (e-mail, `lower(tag)`, Google id, `type + lower(name)` do canal), tamanhos (`check`) e apaga em cascata
(canal → mensagens; conta → sessões; conta apagada deixa a mensagem com a cópia `author_*`). `seed.ts` cria os
canais padrão ou importa o `db.json` antigo quando o banco está vazio.
- `VoiceState { userId, channelId, muted, deafened }`: quem está em qual sala de voz.
- `ServerState { channels, users, voice }`: snapshot enviado no `hello`.

## Eventos

HTTP (antes do socket): `GET /auth/config`, `POST /auth/register`, `POST /auth/login`, `POST /auth/google`,
`POST /auth/logout`, `GET /avatars/<accountId>`. Os três de login devolvem `AuthResult` (`{ ok, token, account }`).

O socket conecta com `io(url, { auth: { token } })`; o middleware `io.use` recusa token inválido com
`unauthorized`.

Cliente → servidor (`ClientToServerEvents`):

| Evento | Payload | Ack | Efeito |
|---|---|---|---|
| `hello` | — | `{ self, account, state }` | registra a conexão da conta (vinda do token); broadcast `user:joined` |
| `account:update` | `ProfileUpdate { name, tag?, avatar? }` | `ProfileUpdateResult` | troca nome/foto (o id só se `tagLocked` for false); `user:updated` para todos |
| `channel:create` | `{ name, type }` | `CreateChannelResult` | normaliza o nome (texto: minúsculo e com hífens, até 32 caracteres), bloqueia duplicado e mais de 100 canais; `channel:created` para todos |
| `channel:delete` | `channelId` | — | apaga o canal e as mensagens, tira todo mundo da sala de voz; `channel:deleted` + `voice:state` |
| `message:history` | `{ channelId, before? }` | `{ messages, hasMore }` | página de 50 (sem `before` = mais recentes) |
| `message:send` (com anexos) | `{ channelId, content, attachmentIds? }` | — | até 10 anexos já enviados por `POST /uploads`, do próprio autor e não usados; tudo ou nada (senão a mensagem é ignorada); texto pode ser vazio se houver anexo |
| `sound:list` | — | `Sound[]` | coleção de efeitos sonoros (links assinados para quem pede) — `docs/areas/sounds.md` |
| `sound:play` | `{ channelId, soundId }` | `SoundResult` | exige estar na sala e `speak`; `sound:played` só para quem está nela; não toca por cima do próprio som anterior |
| `sound:delete` | `soundId` | `SoundResult` | o autor ou `manageMessages`; `sound:deleted` para todos |
| `preferences:get` | — | `Preferences` | tema ativo e temas salvos da conta (padrão se nada salvo) — `docs/areas/themes.md` |
| `preferences:update` | `{ theme?, savedThemes? }` | `PreferencesResult` | valida com `validateTheme`; `preferences:updated` para as outras janelas da mesma conta |
| `friend:list` / `friend:request` / `friend:accept` / `friend:decline` / `friend:remove` / `friend:block` / `friend:unblock` | `"nome#id"` ou `accountId` | `FriendEntry[]` / `FriendResult` | amizades (v3) — `docs/areas/friends.md` |
| `dm:list` / `dm:open` | — / `accountId` | `DmEntry[]` / `DmOpenResult` | conversas privadas (v3): abrir só entre amigos ou se já existe; mensagens usam os `message:*` de sempre — `docs/areas/dms.md` |
| `tools:teams` | `{ channelId, players, teamCount, lanes?, laneSet? }` | `ToolResult` | sorteio no servidor; posta mensagem `kind: 'tool'` (`message:new` para quem vê o canal) — `docs/areas/tools.md` |
| `tools:dice` / `tools:coin` / `tools:pick` | `{ channelId, sides, count }` / `{ channelId, count }` / `{ channelId, options }` | `ToolResult` | dado, moeda e sortear 1 nome; mesmo fluxo e limite do `tools:teams` — `docs/areas/tools.md` |
| `tools:move-teams` | `{ messageId, channelIds: (id \| null)[] }` | `MoveTeamsResult` (`moved`, `skipped`) | leva cada time de um sorteio postado para uma sala de voz: avisa cada conexão com `tools:moved` e o app troca de sala pelo `voice:join`; outros só com `canModerate` — `docs/areas/tools.md` |
| `tools:poll` / `poll:vote` / `poll:close` / `poll:mine` | `{ channelId, question, options, multiple? }` / `{ messageId, choices }` / `messageId` / `messageIds[]` | `ToolResult` / `PollVoteResult` / `PollCloseResult` / `Record<id, number[]>` | enquete (votos anônimos; votar exige `send`; encerrar: autor ou `manageMessages`) — `docs/areas/tools.md` |
| `message:send` | `{ channelId, content, replyToId? }` | — | valida (canal de texto, chat da sala de voz ou conversa privada `dm`, até 2000 caracteres); `message:new` só para quem vê o canal |
| `voice:join` | `{ channelId, muted, deafened }` | `JoinVoiceResult` (`url`, `token` do LiveKit, `canSpeak`/`canShare`/`canVideo`) | exige LiveKit configurado; sala de voz **ou conversa privada `dm`** (só os dois membros, sem bloqueio); sai da sala anterior (também no LiveKit), entra na nova; `voice:state` (sala de DM só para os membros) |
| `voice:leave` | — | — | tira da sala no LiveKit (`RemoveParticipant`) + `voice:state` |
| `voice:update` | `{ muted, deafened }` | — | `voice:state` |
| `voice:sharing` | `boolean` | — | liga/desliga o "ao vivo" (só para quem está numa sala); `voice:state` |
| `typing` | `channelId` | — | broadcast `typing` (o cliente limita a 1 envio a cada 2,5 s) |
| `moderation:voice-move` | `{ userId, channelId }` | `OkResult` | mesma regra do expulsar + sala de voz que quem move vê e em que a pessoa pode entrar; `moderation:moved` só para a conexão movida, que troca de sala pelo `voice:join` — `docs/areas/moderation.md` |
| `moderation:voice-kick` | `{ userId }` | `OkResult` | `manageMembers` + cargo acima (`canModerate`); `moderation:kicked` para a conexão expulsa, tira da sala (também no LiveKit) + `voice:state` — `docs/areas/moderation.md` |
| `moderation:voice-mute` | `{ accountId, muted }` | `OkResult` | silencia a conta para todos (sem microfone no LiveKit, `VoiceState.serverMuted`; guardado em `server_mutes`, sobrevive a reiniciar) + `voice:state` |
| `call:invite` | `channelId` (conversa) | `CallResult` | membro, sem bloqueio, um por conversa e por pessoa; `call:updated` (`ringing`) para as duas contas; `missed` depois de `CALL_RING_MS` — `docs/areas/calls.md` |
| `call:accept` / `call:decline` / `call:cancel` / `call:end` | `channelId` | `CallResult` / `OkResult` | atender (`active`), recusar, cancelar, desligar; o fim manda `call:ended` e tira os dois da sala da conversa |
| `call:list` | — | `CallInfo[]` | chamadas em andamento das minhas conversas (o app pede depois do `hello`) |
| `message:edit` | `{ messageId, content }` | `OkResult` | só o autor, só texto, ainda com `view`+`send`; `message:edited { channelId, messageId, content, editedAt }` para quem vê o canal (A15, `docs/areas/messages.md`) |
| `message:react` | `{ messageId, emoji, on }` | `OkResult` | liga/tira a minha reação (`view` + `send`, até 20 emojis diferentes, `LIMITS.reaction`); `message:reactions { channelId, messageId, reactions }` (lista inteira) para quem vê o canal (A16, `docs/areas/messages.md`) |
| `message:delete` | `{ messageId }` | `OkResult` | o autor ou `manageMessages` (em DM só o autor); apaga os anexos; `message:deleted` para quem vê o canal |

Servidor → cliente (`ServerToClientEvents`): `channel:created`, `channel:deleted`, `user:joined`, `user:left`,
`user:updated` (por `accountId`), `message:new`, `voice:state` (sempre a **lista completa** das salas que a pessoa
vê), `typing`, `rate:limited`, `access:updated` e `channels:visible` (v2), `sound:created`, `sound:deleted` e
`sound:played` (soundboard; o último só para a sala) `preferences:updated` (outras janelas da mesma conta), `friend:updated`, `friend:removed` e `friend:presence` (amizades; online só para amigos), `poll:updated` (enquete: contagens novas, para quem vê o canal), `tools:moved` (só para a conexão levada à sala do time), `dm:created` (conversa nova, para a outra pessoa e as minhas outras janelas), `message:deleted` (para quem vê o canal) , `moderation:kicked` (só para a conexão expulsa da voz) e `moderation:moved` (só para a conexão movida para outra sala), `call:updated` e `call:ended` (chamadas privadas, para as duas contas; o fim chega antes do `voice:state`).

## Estado do renderer (`store/`)

`useApp` guarda só dados. Campos importantes:
- `status`: `disconnected | connecting | connected | reconnecting`. O `App` mostra o `LoginScreen` enquanto `self` for `null`.
- `account`: `AccountInfo` da própria conta. `restoring`: tentando entrar com o token salvo (o login mostra "Entrando...").
- `messages[channelId]`: `undefined` significa histórico ainda não carregado. `message:new` só adiciona a mensagem se o histórico daquele canal já estiver carregado.
- `unread[channelId]`: bolinha de não lido (mensagem chegou num canal ou conversa que não está na tela; `isChatOnScreen`).
- `view: { kind: 'text' | 'voice', channelId }`: a tela da comunidade (canal ou sala aberta).
- `calls[channelId]` (`store/calls.ts`, B8): chamada tocando ou em andamento em cada conversa; o toque segue esse estado (`syncRinger`).
- `section`, `homeView`, `toolId` (`store/navigation.ts`, B7): qual parte está na frente (comunidade, Home com "Amigos"
  ou uma conversa, ou uma ferramenta). Trocar de seção não perde `view`. `docs/areas/home.md`.
- `myVoiceChannelId`, `joiningVoice`, `muted`, `deafened`, `speaking[userId]`, `sharing`, `screens`, `screenPickerOpen`.
- `access` (`store/permissions.ts`): `AccessState` do `hello`/`access:updated`, `null` antes de chegar; a tela lê com `useCan`/`useNameColor` de `lib/permissions.ts` (`docs/areas/permissions.md`).
- `theme`, `savedThemes`, `preferencesLoaded` (`store/preferences.ts`, v5): tema da conta, carregado depois do `hello` e aplicado como variáveis CSS (`lib/theme`, `docs/areas/themes.md`); antes do login vale o último tema da máquina.
- `audioInputId`, `audioOutputId`, `userVolumes[accountId]`, `userMuted[accountId]`, `voiceSoundsEnabled`, `voiceSoundsVolume`, `noiseSuppression`, `noiseMode` (`store/devices.ts`; preferência da máquina, salva em `concord:audio` no `localStorage`).
- `friends`, `dms`, `friendsLoaded` (`store/friends.ts`, v3): carregados por `loadFriendsAndDms` logo depois do `hello`; `friend:*`, `dm:created` e `message:new` (a conversa sobe para o topo) mantêm em dia. Abas da tela "Amigos" com `friendGroups` (`lib/friends.ts`).
- `typing[channelId][userId] = { name, until }`: expira sozinho depois de 3,5 s.
- `notice`: toast (`notify()` em `client.ts`).

## Ciclo de conexão (`lib/client.ts`; listeners em `lib/actions/*`)

0. `register` / `login` / `loginWithGoogle` chamam o HTTP e, com sucesso, salvam `concord:server` e `concord:token` no `localStorage`. Ao abrir o app, `restoreSession()` usa o token salvo.
1. `connect(url, token)`: chama `disconnect()` para limpar (preservando `restoring`), cria o socket (só websocket, `auth: { token }`) e o registra no `voice`.
2. A cada `connect` (inclusive em reconexões), envia `hello`. O ack substitui todo o estado e mantém a `view` se o canal ainda existir. Em seguida pede `friend:list` e `dm:list` (`loadFriendsAndDms`).
3. Ao cair a conexão: `voice.teardown()` e `status = 'reconnecting'`, que mostra uma faixa vermelha no topo. O Socket.IO tenta reconectar sozinho. Se a reconexão voltar `unauthorized`, apaga o token e volta ao login.
4. `logout()` (botão "Sair da conta" em Configurações → "Minha conta"): revoga o token no servidor, apaga do `localStorage` e chama `disconnect()`, que remove os listeners e volta ao `initialState`.

## Layout (`App.tsx`)

`UtilityRail` (72px) | `ChannelSidebar`/`HomeSidebar` (240px por padrão, redimensionável: seções texto/voz, `VoiceStatusPanel` com câmera/tela/efeitos sonoros fora da sala, `UserPanel` com `UserSettingsDialog` (Configurações: conta, voz e vídeo, aparência, notificações)/`ScreenPicker`/`Soundboard` montados) |
`main` (`ChatView` ou `VoiceView`, com `key` = id do canal) | `MemberList` (240px por padrão, redimensionável, aparece só a partir de `lg`). Larguras: `ResizableSide` + `lib/side-width.ts` (`docs/areas/home.md`, "Barras laterais redimensionáveis").

## Limitações conhecidas (de propósito, nesta versão)

- Contas com e-mail+senha ou Google, mas sem papéis: qualquer pessoa logada exclui qualquer canal. Sem recuperação de senha.
- Um único "servidor/comunidade" (a barra da esquerda é decorativa).
- Limites de requisição ficam em memória (reiniciar zera; com vários processos do servidor, cada um teria os seus).
- A voz depende do LiveKit rodando (`docker compose up -d`); sem ele, `voice:join` falha (ver `docs/areas/voice.md`).
