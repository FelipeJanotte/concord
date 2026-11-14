---
name: concord-architecture
description: Visão completa da arquitetura do Concord (clone do Discord em Electron) — processos, fluxo de dados, eventos Socket.IO, estado zustand e ciclo de conexão. Use antes de qualquer mudança não trivial ou quando precisar entender como uma parte do app funciona.
---

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
código ao renderer (IPC `google-sign-in`). Toda a rede com o servidor acontece no renderer: **HTTP** para
cadastro/login (antes de existir socket) e **Socket.IO** para o resto. Detalhes das contas: skill `concord-accounts`.

## Modelo de dados (`src/shared/types/`)

- `Channel { id, name, type: 'text' | 'voice', createdAt }`
- `User { id, accountId, name, tag, color, avatarUrl }`: `id` é o `socket.id` (presença/voz); `accountId` identifica a conta. A pessoa aparece como `nome#tag`. A tag (1 a 5 letras/números) é **única entre todas as contas e imutável**: é o que diferencia pessoas com o mesmo nome. Exceção: conta criada pelo Google recebe tag provisória (`tagLocked: false`) e escolhe a definitiva uma única vez.
- `AccountInfo`: dados da própria conta (e-mail, `hasPassword`, `hasGoogle`, `tagLocked`), recebidos só pelo dono no `hello`.
- `Message { id, channelId, author: User, content, createdAt }`: o banco guarda `author_id` (conta) e o histórico junta com a conta, então mostra nome/foto **atuais**. Em `message:new`, `author.id` é o socket de quem enviou; no histórico é o id da conta. Identifique a pessoa sempre por `author.accountId`.
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
`applyVoiceAccess` (em `modules/voice.ts`): quem perdeu `connect` sai da voz. `voice:join` devolve `canSpeak`/`canShare`;
sem `speak` a pessoa aparece sempre silenciada. Ninguém concede permissão global que não tem (`canGrantPermissions`),
e globais no @todos só a dona. O token do LiveKit sai com microfone só se `speak` e tela só se `share`, e
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
`messages`, `attachments` (bytes no `FileStorage`, `DATA_DIR/uploads/<id>`). O banco garante
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
| `sound:list` | — | `Sound[]` | coleção de efeitos sonoros (links assinados para quem pede) — skill `concord-sounds` |
| `sound:play` | `{ channelId, soundId }` | `SoundResult` | exige estar na sala e `speak`; `sound:played` só para quem está nela; não toca por cima do próprio som anterior |
| `sound:delete` | `soundId` | `SoundResult` | o autor ou `manageMessages`; `sound:deleted` para todos |
| `message:send` | `{ channelId, content }` | — | valida (canal de texto, até 2000 caracteres); `message:new` para todos |
| `voice:join` | `{ channelId, muted, deafened }` | `JoinVoiceResult` (`url`, `token` do LiveKit) | exige LiveKit configurado; sai da sala anterior (também no LiveKit), entra na nova; `voice:state` |
| `voice:leave` | — | — | tira da sala no LiveKit (`RemoveParticipant`) + `voice:state` |
| `voice:update` | `{ muted, deafened }` | — | `voice:state` |
| `voice:sharing` | `boolean` | — | liga/desliga o "ao vivo" (só para quem está numa sala); `voice:state` |
| `typing` | `channelId` | — | broadcast `typing` (o cliente limita a 1 envio a cada 2,5 s) |

Servidor → cliente (`ServerToClientEvents`): `channel:created`, `channel:deleted`, `user:joined`, `user:left`,
`user:updated` (por `accountId`), `message:new`, `voice:state` (sempre a **lista completa** das salas que a pessoa
vê), `typing`, `rate:limited`, `access:updated` e `channels:visible` (v2), `sound:created`, `sound:deleted` e
`sound:played` (soundboard; o último só para a sala).

## Estado do renderer (`store/`)

`useApp` guarda só dados. Campos importantes:
- `status`: `disconnected | connecting | connected | reconnecting`. O `App` mostra o `LoginScreen` enquanto `self` for `null`.
- `account`: `AccountInfo` da própria conta. `restoring`: tentando entrar com o token salvo (o login mostra "Entrando...").
- `messages[channelId]`: `undefined` significa histórico ainda não carregado. `message:new` só adiciona a mensagem se o histórico daquele canal já estiver carregado.
- `unread[channelId]`: bolinha de não lido (mensagem chegou num canal que não está aberto).
- `view: { kind: 'text' | 'voice', channelId }`: o que aparece no painel central.
- `myVoiceChannelId`, `joiningVoice`, `muted`, `deafened`, `speaking[userId]`, `sharing`, `screens`, `screenPickerOpen`.
- `audioInputId`, `audioOutputId`, `userVolumes[accountId]`, `userMuted[accountId]`, `voiceSoundsEnabled`, `voiceSoundsVolume`, `deviceSettingsOpen` (`store/devices.ts`; preferência da máquina, salva em `concord:audio` no `localStorage`).
- `typing[channelId][userId] = { name, until }`: expira sozinho depois de 3,5 s.
- `notice`: toast (`notify()` em `client.ts`).

## Ciclo de conexão (`lib/client.ts`; listeners em `lib/actions/*`)

0. `register` / `login` / `loginWithGoogle` chamam o HTTP e, com sucesso, salvam `concord:server` e `concord:token` no `localStorage`. Ao abrir o app, `restoreSession()` usa o token salvo.
1. `connect(url, token)`: chama `disconnect()` para limpar (preservando `restoring`), cria o socket (só websocket, `auth: { token }`) e o registra no `voice`.
2. A cada `connect` (inclusive em reconexões), envia `hello`. O ack substitui todo o estado e mantém a `view` se o canal ainda existir.
3. Ao cair a conexão: `voice.teardown()` e `status = 'reconnecting'`, que mostra uma faixa vermelha no topo. O Socket.IO tenta reconectar sozinho. Se a reconexão voltar `unauthorized`, apaga o token e volta ao login.
4. `logout()` (botão "Sair da conta" no `ProfileDialog`): revoga o token no servidor, apaga do `localStorage` e chama `disconnect()`, que remove os listeners e volta ao `initialState`.

## Layout (`App.tsx`)

`ServerRail` (72px) | `ChannelSidebar` (240px: seções texto/voz, `VoiceStatusPanel`, `UserPanel`) |
`main` (`ChatView` ou `VoiceView`, com `key` = id do canal) | `MemberList` (240px, aparece só a partir de `lg`).

## Limitações conhecidas (de propósito, nesta versão)

- Contas com e-mail+senha ou Google, mas sem papéis: qualquer pessoa logada exclui qualquer canal. Sem recuperação de senha.
- Um único "servidor/comunidade" (a barra da esquerda é decorativa).
- Limites de requisição ficam em memória (reiniciar zera; com vários processos do servidor, cada um teria os seus).
- A voz depende do LiveKit rodando (`docker compose up -d`); sem ele, `voice:join` falha (ver `concord-voice`).
