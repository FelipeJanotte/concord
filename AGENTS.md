# AGENTS.md — guia do projeto para assistentes de IA

**Concord** é um app desktop estilo Discord: canais de **texto** e de **voz** em que cada usuário entra e sai.
Stack: **Electron + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix)**, estado com
**zustand**, tempo real com **Socket.IO** e voz com **WebRTC** (malha peer-to-peer).
Gerenciador de pacotes: **npm** (não use pnpm/yarn; o projeto foi revertido do pnpm de propósito).

## Mapa rápido

| Caminho | O que é |
|---|---|
| `server/index.ts` | Servidor Node: rotas HTTP de conta (`/auth/*`, `/avatars/*`) + Socket.IO (canais, mensagens, presença, voz, sinalização WebRTC). O socket só conecta com token de sessão. |
| `server/auth.ts` | Contas: cadastro e-mail+senha (scrypt), login, sessões por token (30 dias), login com Google, perfil `nome#id` e foto. O id é único e imutável (o nome pode mudar). |
| `server/db.ts` | Persistência em `server/data/db.json` (canais, mensagens, contas, sessões); fotos em `server/data/avatars/`. |
| `src/shared/types.ts` | **Contrato único** entre app e servidor: tipos de domínio + mapas de eventos `ServerToClientEvents` / `ClientToServerEvents`. |
| `src/main/index.ts` | Processo principal do Electron: janela, permissão de microfone e IPC `google-sign-in`. |
| `src/main/google-auth.ts` | Login com Google: navegador do sistema + loopback 127.0.0.1 + PKCE; devolve o código para o servidor trocar. |
| `src/preload/` | Ponte `contextBridge` (`window.api.platform` e `window.api.googleSignIn`). |
| `src/renderer/src/store.ts` | Estado global zustand (`useApp`). Só dados, sem ações. |
| `src/renderer/src/lib/client.ts` | Conexão Socket.IO e **todas as ações** do app (conectar, enviar mensagem, criar canal, entrar na voz...). |
| `src/renderer/src/lib/voice.ts` | `VoiceClient`: WebRTC em malha, mute/deafen e detecção de quem está falando. |
| `src/renderer/src/components/ui/` | Componentes shadcn/ui (estilo new-york, importando de `radix-ui`). |
| `docker-compose.yml`, `livekit.yaml` | Infra local: PostgreSQL 17 e LiveKit (SFU). Credenciais de dev espelhadas em `server/.env.example`. |
| `vitest.config.ts` | Testes `*.test.ts(x)` ao lado do código (`npm test`). |
| `src/renderer/src/components/` | Telas: `LoginScreen`, `ChannelSidebar`, `ChatView`, `VoiceView`, `MemberList`, `UserPanel`, `CreateChannelDialog`, `Toast`. |

## Comandos

```bash
npm install
npm run dev:all     # servidor (porta 3001) + app Electron juntos
npm run server      # só o servidor (tsx watch)
npm run dev         # só o app
docker compose up -d  # Postgres + LiveKit locais (ver concord-dev-workflow)
npm test            # vitest
npm run typecheck   # checagem de tipos (main/preload/server e renderer)
npm run build       # typecheck + build em out/
npm run dist        # instalador Windows em dist/
```

## Regras do projeto

1. **Todo evento novo começa em `src/shared/types.ts`.** Depois servidor, depois `lib/client.ts`, depois UI.
2. Componentes **leem** estado com `useApp(selector)` e **agem** chamando funções de `lib/client.ts`. Não use o socket direto em componentes.
3. Seletores que retornam arrays/objetos novos (ex.: `filter`) usam `useShallow` de `zustand/react/shallow`.
4. O servidor **valida tudo** que chega (tipo, tamanho, existência do canal); nunca confie no cliente.
5. Visual: use os tokens de cor do tema (`bg-sidebar`, `bg-rail`, `bg-panel`, `bg-composer`, `text-muted-foreground`, `text-success`...) definidos em `src/renderer/src/assets/globals.css`. Não use cores hex soltas nos componentes.
6. Novos componentes shadcn: `npx shadcn@latest add <nome>` (o `components.json` já aponta para os aliases certos).
7. Textos da interface em **português do Brasil**.
8. Aliases: `@/` → `src/renderer/src/`, `@shared/` → `src/shared/` (o servidor importa por caminho relativo `../src/shared/types`).

## Skills detalhadas

Leia a skill certa antes de mexer em cada área (ficam em `.claude/skills/<nome>/SKILL.md`):

- `concord-architecture` — visão completa: fluxo de dados, todos os eventos, estado, ciclo de conexão.
- `concord-add-feature` — passo a passo para adicionar uma funcionalidade de ponta a ponta, com exemplo.
- `concord-accounts` — contas: cadastro/login com e-mail e senha, sessões, login com Google, perfil `nome#id` e foto, regra do id único e imutável.
- `concord-voice` — como a voz WebRTC funciona, limites e depuração.
- `concord-dev-workflow` — rodar, testar com vários usuários, build e solução de problemas conhecidos.
