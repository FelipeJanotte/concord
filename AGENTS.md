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
| `server/repo/` | **Único acesso a dados** (funções async sobre o Drizzle): `accounts`, `sessions`, `channels`, `messages`. Ids inválidos viram "não existe" (`isUuid`); valor repetido recusado pelo banco vira `DuplicateError`. |
| `server/db/` | PostgreSQL + Drizzle: `client.ts` (conexão: `DATABASE_URL` → Postgres; sem ela → PGlite em `DATA_DIR/pgdata`), `schema/<dominio>.ts`, `migrations/` (geradas, aplicadas no boot) e `seed.ts` (canais padrão / importa o `db.json` antigo). |
| `server/config.ts` | `DATA_DIR`, pastas das fotos (`avatars/`), dos anexos (`uploads/`), do PGlite e do `db.json` antigo; prazos da limpeza de anexos. |
| `server/modules/uploads.ts` | Anexos: `POST /uploads` (até 25 MB, `Authorization: Bearer`), `GET /files/<id>/<nome>` (só publicados; só imagem confirmada é inline) e limpeza de anexos soltos. |
| `server/middleware/rate-limit.ts` | Limite de requisições (balde de fichas) por conta/IP: mensagens, uploads, canais, perfil, "digitando", cadastro e login. Regras em `LIMITS`. |
| `server/db/backup.ts`, `server/modules/backup.ts` | Backup automático do PGlite (`DATA_DIR/backups`, diário, mantém 7) e `npm run db:restore`. Com Postgres: serviço `pg-backup` do compose. |
| `server/storage/` | `FileStorage` (disco hoje; S3/R2 depois) e `sniff.ts` (tipo e dimensões da imagem pelos bytes). |
| `server/auth.ts` | Contas: cadastro e-mail+senha (scrypt), login, sessões por token (30 dias), login com Google, perfil `nome#id` e foto. O id é único e imutável (o nome pode mudar). |
| `src/shared/types/` | **Contrato** entre app e servidor: um arquivo por domínio (tipos + `<Dominio>ClientEvents`/`<Dominio>ServerEvents`); `index.ts` compõe `ServerToClientEvents` / `ClientToServerEvents`. Importe sempre de `@shared/types`. |
| `src/main/index.ts` | Processo principal do Electron: janela, permissão de microfone e IPC `google-sign-in`. |
| `src/main/screen-share.ts` | Compartilhar tela: IPC `screen-sources`/`screen-select` e `setDisplayMediaRequestHandler` (entrega a fonte escolhida no seletor). |
| `src/main/google-auth.ts` | Login com Google: navegador do sistema + loopback 127.0.0.1 + PKCE; devolve o código para o servidor trocar. |
| `src/preload/` | Ponte `contextBridge` (`window.api.platform`, `window.api.googleSignIn` e `window.api.screen`; tipos da tela em `src/shared/screen.ts`). |
| `src/renderer/src/store/` | Estado global zustand (`useApp`), um slice por domínio composto em `index.ts`. Só dados, sem ações. |
| `src/renderer/src/lib/client.ts` | Login/sessão e conexão Socket.IO; chama os `bind<Dominio>Events` e **reexporta todas as ações**. Componentes importam ações daqui. |
| `src/renderer/src/lib/actions/` | Ações e listeners por domínio (`account`, `channels`, `devices`, `messages`, `presence`, `uploads`, `voice`). `voice-sounds.ts`: sons de entrar/sair da sala. `devices.ts`: microfone, saída, volume e silenciar por pessoa (preferências em `concord:audio`). `uploads.ts`: rascunho de anexos por canal, envio com progresso (`transport.send`, XHR). |
| `src/renderer/src/components/chat/` | `Composer` (texto + clipe/colar), `AttachmentPreview`, `MessageAttachments` (imagem no chat / cartão de arquivo), `ImageLightbox`. Arrastar e soltar fica no `ChatView`. |
| `src/renderer/src/lib/core.ts` | Socket atual (`getSocket`/`requireSocket`), `set`/`get` da store e `notify`. Usado pelas ações. |
| `src/renderer/src/lib/voice.ts` | `VoiceClient` sobre `livekit-client`: conecta na sala com o token do servidor, mute/deafen, quem está falando (`ActiveSpeakersChanged`). |
| `src/renderer/src/lib/sounds/` | Sons da interface gerados pela Web Audio (`ChimePlayer`) e `roomChanges` (quem entrou/saiu da minha sala). Ligados em `lib/actions/voice-sounds.ts`. |
| `src/renderer/src/lib/noise/` | Supressão de ruído automática: `NoiseDecider` (quando ligar o filtro forte), `AutoNoiseProcessor` (processador do microfone no LiveKit) e o motor RNNoise (WASM empacotado). |
| `src/renderer/src/components/ui/` | Componentes shadcn/ui (estilo new-york, importando de `radix-ui`). |
| `docker-compose.yml`, `livekit.yaml` | Infra local: PostgreSQL 17 e LiveKit (SFU). Credenciais de dev espelhadas em `server/.env.example`. |
| `vitest.config.ts` | Testes `*.test.ts(x)` ao lado do código (`npm test`). |
| `src/renderer/src/components/` | Telas: `LoginScreen`, `ChannelSidebar`, `ChatView`, `VoiceView`, `MemberList`, `UserPanel`, `CreateChannelDialog`, `Toast`; `voice/` tem `VoiceGrid`, `ScreenTile` e `ScreenPicker` (tela compartilhada) e `DeviceSettings` (microfone e saída) e `MemberContextMenu` (botão direito numa pessoa: volume, silenciar, ver perfil); `UserProfileDialog` é o cartão de perfil. |

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
npm run db:generate # gera a migration depois de mudar server/db/schema (ver concord-dev-workflow)
npm run db:import-json [arquivo]  # importa um db.json antigo para o banco
npm run db:restore [arquivo]      # restaura um backup do PGlite (servidor parado)
npm run build       # typecheck + build em out/
npm run dist        # instalador Windows em dist/
```

## Regras do projeto

1. **Todo evento novo começa em `src/shared/types/<dominio>.ts`.** Depois `server/modules/`, depois `lib/actions/`, depois UI.
2. Componentes **leem** estado com `useApp(selector)` e **agem** chamando funções de `@/lib/client`. Não use o socket direto em componentes.
3. **Arquivos de registro** (`shared/types/index.ts`, `server/index.ts`, `lib/client.ts`, `store/index.ts`) só recebem linhas de registro de um domínio novo, nunca lógica. Isso evita conflito entre os dois devs (ver `docs/ROADMAP.md`).
4. Módulos do servidor **não importam `server/db/`**: leem e gravam pelo `server/repo/`. Mudou o schema → `npm run db:generate` (só depois do rebase na `main`) e nunca edite uma migration já mergeada.
5. **Toda tarefa vem com testes automatizados** (vitest, `*.test.ts` ao lado do código). Uma tarefa só está completa quando `npm test` **e** `npm run typecheck` passam por completo. Testes de integração do servidor ficam em `server/tests/<dominio>.test.ts` e sobem o servidor de verdade (`server/tests/helpers.ts`); ações do app são testadas com o socket falso (`src/renderer/src/test/fake-socket.ts`); componentes com `// @vitest-environment jsdom` + Testing Library (veja `components/chat/chat.test.tsx`).
6. Handlers async do servidor rodam dentro de `guard('evento', async () => { ... })` (erro não derruba o processo).
7. Seletores que retornam arrays/objetos novos (ex.: `filter`) usam `useShallow` de `zustand/react/shallow`.
8. O servidor **valida tudo** que chega (tipo, tamanho, existência do canal); nunca confie no cliente. Ação nova que pode ser abusada (cria coisa, manda para todos) ganha uma regra em `LIMITS` (`server/middleware/rate-limit.ts`).
9. Visual: use os tokens de cor do tema (`bg-sidebar`, `bg-rail`, `bg-panel`, `bg-composer`, `text-muted-foreground`, `text-success`...) definidos em `src/renderer/src/assets/globals.css`. Não use cores hex soltas nos componentes.
10. Novos componentes shadcn: `npx shadcn@latest add <nome>` (o `components.json` já aponta para os aliases certos).
11. Textos da interface em **português do Brasil**.
12. Aliases: `@/` → `src/renderer/src/`, `@shared/` → `src/shared/` (o servidor importa por caminho relativo `../src/shared/types`).
13. **Toda tarefa, todo módulo novo e toda alteração vêm com a skill correspondente** em `.claude/skills/`. Sem isso a tarefa **não está finalizada**, mesmo com testes e typecheck passando. Ver "Definição de pronto" abaixo.

## Definição de pronto

Uma tarefa (task do roadmap, correção, refatoração ou mudança de comportamento) só está **finalizada** quando:

1. `npm run typecheck` **e** `npm test` passam por completo, com testes novos cobrindo a mudança (regra 5).
2. **A skill está em dia com o código entregue:**
   - **Área nova** (domínio, módulo do servidor, processo do Electron, conjunto de telas): crie
     `.claude/skills/concord-<area>/SKILL.md`, com frontmatter `name` e `description` (a `description` diz
     **quando** usar a skill, citando arquivos e eventos), e acrescente-a na lista "Skills detalhadas" abaixo.
     Se a área for pequena e pertencer a uma skill que já existe, uma **seção nova** nessa skill basta.
   - **Alteração** em algo que já tem skill: atualize as seções afetadas no mesmo PR. Nada de skill descrevendo
     comportamento antigo (evento removido, arquivo renomeado, regra que mudou).
   - O conteúdo mínimo de cada skill ou seção: o que faz e por quê, arquivos envolvidos, eventos e contratos
     (`shared/types`), fluxo principal, regras e limites, como testar e problemas conhecidos/depuração.
3. Eventos novos ou alterados aparecem na tabela de eventos da `concord-architecture`.
4. Arquivo ou pasta nova aparece no "Mapa rápido" deste arquivo.
5. O PR diz quais skills foram criadas ou atualizadas. Revisor: PR sem skill atualizada volta.

## Skills detalhadas

Leia a skill certa antes de mexer em cada área (ficam em `.claude/skills/<nome>/SKILL.md`):

- `concord-architecture` — visão completa: fluxo de dados, todos os eventos, estado, ciclo de conexão.
- `concord-add-feature` — passo a passo para adicionar uma funcionalidade de ponta a ponta, com exemplo.
- `concord-accounts` — contas: cadastro/login com e-mail e senha, sessões, login com Google, perfil `nome#id` e foto, regra do id único e imutável.
- `concord-attachments` — anexos: envio por `POST /uploads`, download por `GET /files`, tipo pelos bytes, storage, limpeza e a interface (clipe, colar, arrastar, prévia).
- `concord-voice` — como a voz funciona (LiveKit no servidor, token por sala), compartilhamento de tela, dispositivos e volume por pessoa, limites e depuração.
- `concord-dev-workflow` — rodar, testar com vários usuários, build e solução de problemas conhecidos.
