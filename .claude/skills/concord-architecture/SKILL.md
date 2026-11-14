---
name: concord-architecture
description: Visão completa da arquitetura do Concord (clone do Discord em Electron) — processos, fluxo de dados, eventos Socket.IO, estado zustand e ciclo de conexão. Use antes de qualquer mudança não trivial ou quando precisar entender como uma parte do app funciona.
---

# Arquitetura do Concord

## Peças

```
┌──────────── App Electron (um por usuário) ────────────┐        ┌──────── server/index.ts ────────┐
│ main (src/main)      janela, microfone, login Google  │        │ http + Socket.IO (porta 3001)   │
│ preload (src/preload) window.api                      │        │ HTTP: /auth/*, /avatars/*       │
│ renderer (React)                                      │  HTTP  │ db.json: canais, mensagens,     │
│   components ──lê──> store.ts (zustand)               │  + WS  │   contas, sessões               │
│        └──chama──> lib/client.ts ──fetch/socket────────┼───────>│ memória: users, voice           │
│                        └──> lib/voice.ts (WebRTC) ◄────┼─ P2P ─►│ (áudio NÃO passa pelo servidor) │
└───────────────────────────────────────────────────────┘        └─────────────────────────────────┘
```

O processo main não fala com o servidor do Concord. Ele só abre o navegador para o login com Google e devolve o
código ao renderer (IPC `google-sign-in`). Toda a rede com o servidor acontece no renderer: **HTTP** para
cadastro/login (antes de existir socket) e **Socket.IO** para o resto. Detalhes das contas: skill `concord-accounts`.

## Modelo de dados (`src/shared/types.ts`)

- `Channel { id, name, type: 'text' | 'voice', createdAt }`
- `User { id, accountId, name, tag, color, avatarUrl }`: `id` é o `socket.id` (presença/voz); `accountId` identifica a conta. A pessoa aparece como `nome#tag`. A tag (1 a 5 letras/números) é **única entre todas as contas e imutável**: é o que diferencia pessoas com o mesmo nome. Exceção: conta criada pelo Google recebe tag provisória (`tagLocked: false`) e escolhe a definitiva uma única vez.
- `AccountInfo`: dados da própria conta (e-mail, `hasPassword`, `hasGoogle`, `tagLocked`), recebidos só pelo dono no `hello`.
- `Message { id, channelId, author: User, content, createdAt }`: o autor é uma cópia do usuário no momento do envio.
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
| `message:history` | `channelId` | `Message[]` | últimas 500 mensagens |
| `message:send` | `{ channelId, content }` | — | valida (canal de texto, até 2000 caracteres); `message:new` para todos |
| `voice:join` | `{ channelId, muted, deafened }` | `JoinVoiceResult` (`peers`) | sai da sala anterior, entra na nova, devolve quem já estava lá |
| `voice:leave` | — | — | `voice:peer-left` para a sala + `voice:state` |
| `voice:update` | `{ muted, deafened }` | — | `voice:state` |
| `voice:signal` | `{ to, data: SignalData }` | — | repassa só se os dois estiverem na mesma sala |
| `typing` | `channelId` | — | broadcast `typing` (o cliente limita a 1 envio a cada 2,5 s) |

Servidor → cliente (`ServerToClientEvents`): `channel:created`, `channel:deleted`, `user:joined`, `user:left`,
`user:updated` (por `accountId`), `message:new`, `voice:state` (sempre a **lista completa**), `voice:signal`, `voice:peer-left`, `typing`.

## Estado do renderer (`store.ts`)

`useApp` guarda só dados. Campos importantes:
- `status`: `disconnected | connecting | connected | reconnecting`. O `App` mostra o `LoginScreen` enquanto `self` for `null`.
- `account`: `AccountInfo` da própria conta. `restoring`: tentando entrar com o token salvo (o login mostra "Entrando...").
- `messages[channelId]`: `undefined` significa histórico ainda não carregado. `message:new` só adiciona a mensagem se o histórico daquele canal já estiver carregado.
- `unread[channelId]`: bolinha de não lido (mensagem chegou num canal que não está aberto).
- `view: { kind: 'text' | 'voice', channelId }`: o que aparece no painel central.
- `myVoiceChannelId`, `joiningVoice`, `muted`, `deafened`, `speaking[userId]`.
- `typing[channelId][userId] = { name, until }`: expira sozinho depois de 3,5 s.
- `notice`: toast (`notify()` em `client.ts`).

## Ciclo de conexão (`lib/client.ts`)

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
- Persistência num arquivo JSON, salvo com 500 ms de atraso. Para produção, trocar por SQLite ou Postgres.
- A voz em malha aguenta bem até umas 8 pessoas por sala (ver `concord-voice`).
