# AGENTS.md — guia do projeto para assistentes de IA

**Concord** é um app desktop estilo Discord: canais de **texto** e de **voz** em que cada usuário entra e sai.
Stack: **Electron + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix)**, estado com
**zustand**, tempo real com **Socket.IO** e voz com **LiveKit** (SFU self-hosted; o servidor do Concord emite o token de acesso).
Gerenciador de pacotes: **npm** (não use pnpm/yarn; o projeto foi revertido do pnpm de propósito).

## Mapa rápido

| Caminho | O que é |
|---|---|
| `server/index.ts` | Bootstrap do servidor Node: HTTP + Socket.IO, middleware que exige token de sessão e a **lista de módulos**. Sem lógica de domínio. |
| `server/modules/` | Um arquivo por domínio (`accounts`, `channels`, `messages`, `voice`, `presence`), cada um exporta um `ServerModule` (`http?` e `socket?`). |
| `server/livekit.ts` | Configuração do LiveKit (`LIVEKIT_*`), token de acesso por sala (`createVoiceCredentials`) e remoção da sala (`kickFromRoom`, `closeRoom`). |
| `server/context.ts` | Tipos `AppServer`/`AppSocket`/`ServerModule`, mapa `users` (online) e `guard()` para handlers async. `socket.data.user` existe depois do `hello`. |
| `server/repo/` | **Único acesso a dados** (funções async que devolvem cópias): `accounts`, `sessions`, `channels`, `messages`. Hoje sobre o JSON; na v1 vira Postgres. |
| `server/auth.ts` | Contas: cadastro e-mail+senha (scrypt), login, sessões por token (30 dias), login com Google, perfil `nome#id` e foto. O id é único e imutável (o nome pode mudar). |
| `server/db.ts` | Armazenamento JSON em `server/data/db.json`, usado **só** por `server/repo/`; fotos em `server/data/avatars/`. |
| `src/shared/types/` | **Contrato** entre app e servidor: um arquivo por domínio (tipos + `<Dominio>ClientEvents`/`<Dominio>ServerEvents`); `index.ts` compõe `ServerToClientEvents` / `ClientToServerEvents`. Importe sempre de `@shared/types`. |
| `src/main/index.ts` | Processo principal do Electron: janela, permissão de microfone e IPC `google-sign-in`. |
| `src/main/google-auth.ts` | Login com Google: navegador do sistema + loopback 127.0.0.1 + PKCE; devolve o código para o servidor trocar. |
| `src/preload/` | Ponte `contextBridge` (`window.api.platform` e `window.api.googleSignIn`). |
| `src/renderer/src/store/` | Estado global zustand (`useApp`), um slice por domínio composto em `index.ts`. Só dados, sem ações. |
| `src/renderer/src/lib/client.ts` | Login/sessão e conexão Socket.IO; chama os `bind<Dominio>Events` e **reexporta todas as ações**. Componentes importam ações daqui. |
| `src/renderer/src/lib/actions/` | Ações e listeners por domínio (`account`, `channels`, `messages`, `presence`, `voice`). |
| `src/renderer/src/lib/core.ts` | Socket atual (`getSocket`/`requireSocket`), `set`/`get` da store e `notify`. Usado pelas ações. |
| `src/renderer/src/lib/voice.ts` | `VoiceClient` sobre `livekit-client`: conecta na sala com o token do servidor, mute/deafen, quem está falando (`ActiveSpeakersChanged`). |
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
npm run typecheck   # checagem de tipos (main/preload/server, renderer e testes)
npm test            # todos os testes automatizados (vitest)
npm run test:watch  # testes em modo watch
npm run build       # typecheck + build em out/
npm run dist        # instalador Windows em dist/
```

## Regras do projeto

1. **Todo evento novo começa em `src/shared/types/<dominio>.ts`.** Depois `server/modules/`, depois `lib/actions/`, depois UI.
2. Componentes **leem** estado com `useApp(selector)` e **agem** chamando funções de `@/lib/client`. Não use o socket direto em componentes.
3. **Arquivos de registro** (`shared/types/index.ts`, `server/index.ts`, `lib/client.ts`, `store/index.ts`) só recebem linhas de registro de um domínio novo, nunca lógica. Isso evita conflito entre os dois devs (ver `docs/ROADMAP.md`).
4. Módulos do servidor **não importam `server/db.ts`**: leem e gravam pelo `server/repo/`.
5. **Toda tarefa vem com testes automatizados** (vitest, `*.test.ts` ao lado do código). Uma tarefa só está completa quando `npm test` **e** `npm run typecheck` passam por completo. Testes de integração do servidor ficam em `server/tests/<dominio>.test.ts` e sobem o servidor de verdade (`server/tests/helpers.ts`); ações do app são testadas com o socket falso (`src/renderer/src/test/fake-socket.ts`).
6. Handlers async do servidor rodam dentro de `guard('evento', async () => { ... })` (erro não derruba o processo).
7. Seletores que retornam arrays/objetos novos (ex.: `filter`) usam `useShallow` de `zustand/react/shallow`.
8. O servidor **valida tudo** que chega (tipo, tamanho, existência do canal); nunca confie no cliente.
9. Visual: use os tokens de cor do tema (`bg-sidebar`, `bg-rail`, `bg-panel`, `bg-composer`, `text-muted-foreground`, `text-success`...) definidos em `src/renderer/src/assets/globals.css`. Não use cores hex soltas nos componentes.
10. Novos componentes shadcn: `npx shadcn@latest add <nome>` (o `components.json` já aponta para os aliases certos).
11. Textos da interface em **português do Brasil**.
12. Aliases: `@/` → `src/renderer/src/`, `@shared/` → `src/shared/` (o servidor importa por caminho relativo `../src/shared/types`).

## Skills detalhadas

Leia a skill certa antes de mexer em cada área (ficam em `.claude/skills/<nome>/SKILL.md`):

- `concord-architecture` — visão completa: fluxo de dados, todos os eventos, estado, ciclo de conexão.
- `concord-add-feature` — passo a passo para adicionar uma funcionalidade de ponta a ponta, com exemplo.
- `concord-accounts` — contas: cadastro/login com e-mail e senha, sessões, login com Google, perfil `nome#id` e foto, regra do id único e imutável.
- `concord-voice` — como a voz funciona (LiveKit no servidor, token por sala), limites e depuração.
- `concord-dev-workflow` — rodar, testar com vários usuários, build e solução de problemas conhecidos.
