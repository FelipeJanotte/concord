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
| `server/access.ts` | Cache do estado de acesso (cargos/membros/regras) e as verificações: `allowed(accountId, perm, channelId?)`, `visibleChannels`, `emitToViewers` (emite só para quem vê o canal). Regra de cálculo: `can()` em `src/shared/types/permissions.ts`. |
| `server/modules/sounds.ts` | Efeitos sonoros (A10): `POST /sounds` (até 512 KB e 5 s), `GET /sounds/<id>` assinado, `sound:list/play/delete`; bytes em `DATA_DIR/sounds`. Tipo e duração em `server/storage/audio.ts`; dados em `server/repo/sounds.ts`. |
| `server/modules/friends.ts` | Amizades (v3, A6): pedido por `nome#id`, aceitar/recusar/desfazer, bloquear (cada lado com seu estado) e online só para amigos (`friend:*`). Dados em `server/repo/friends.ts`. |
| `server/modules/dms.ts` | Conversas privadas (v3, A7): `dm:list`, `dm:open` (só amigos ou conversa existente; bloqueio fecha), `dm:created`. Um DM é um canal `dm` com 2 linhas em `channel_members`; o acesso (só membros) fica em `server/access.ts`. Dados em `server/repo/dms.ts`. |
| `server/modules/tools.ts`, `server/tools/` | Ferramentas do grupo (v4): `tools:teams` (A8), `tools:dice`, `tools:coin`, `tools:pick` e `tools:poll` postam mensagem `kind: 'tool'` (sorteio no servidor com `crypto.randomInt`). `tools:move-teams` leva os times sorteados para salas de voz (puras em `server/tools/move.ts`; avisa cada conexão com `tools:moved`). Votar e encerrar enquete: `server/modules/polls.ts` (dados em `server/repo/polls.ts`, tabela `poll_votes`). Registro `TOOLS` + fluxo único `runTool`; funções puras em `server/tools/teams.ts` e `server/tools/random.ts`; contrato em `src/shared/types/tools.ts`. |
| `server/modules/reactions.ts` | Reações em mensagens (A16): `message:react` → `message:reactions` (lista inteira) para quem vê o canal. Dados em `server/repo/reactions.ts` (tabela `message_reactions`); contrato em `src/shared/types/reactions.ts`. |
| `server/modules/preferences.ts` | Preferências da conta (v5): tema ativo e até 10 temas salvos (`preferences:get/update`, sincroniza as janelas da mesma conta). Contrato do tema e funções puras em `src/shared/types/theme.ts`. |
| `src/renderer/src/components/settings/appearance/` | Janela "Aparência" (v5, B12, botão de paleta no `UserPanel`): temas prontos, meus temas, editor ao vivo e compartilhar por código. |
| `src/renderer/src/lib/theme/` | Motor de temas (v5, B11): `deriveTokens` (tokens de cor a partir do `ThemeConfig`, contraste AA garantido), `THEME_PRESETS`, `applyTheme` e o tema guardado na máquina. Sincronia com a conta em `lib/actions/preferences.ts`. |
| `server/files-signing.ts` | Links de download de anexo assinados por pessoa (HMAC, validade 24 h); o download confere se a conta ainda vê o canal. |
| `server/modules/calls.ts` | Chamadas privadas (B8): `call:invite/accept/decline/cancel/end/list`, tempo de toque, fim quando a sala da conversa esvazia (`onVoiceRoomsChange` de `voice.ts`) e `endCall` (bloqueio). Contrato em `src/shared/types/calls.ts`. |
| `server/modules/moderation.ts` | Moderação (B6): `moderation:voice-kick`, `moderation:voice-mute` (silêncio pelo servidor, em `voice.ts`, guardado no banco: tabela `server_mutes` em `server/db/schema/moderation.ts`, dados em `server/repo/moderation.ts`) e `message:delete`. Regras `canModerate`/`canDeleteMessage` em `src/shared/types/moderation.ts`. |
| `server/modules/permissions.ts` | Eventos de cargos (`access:get`, `role:*`, `member:set-roles`, `channel:set-overrides`), hierarquia e `applyAccessChange` (avisa `access:updated`/`channels:visible` e tira da voz quem perdeu `connect`). |
| `server/tests/` | Testes de integração e helpers: `helpers.ts` (`TestServer` com a dona: `asOwner()`, `createChannel()`), `database.ts` (banco de teste), `fake-livekit.ts` (LiveKit falso: `FakeLiveKit`, `liveKitEnv`). |
| `server/middleware/rate-limit.ts` | Limite de requisições (balde de fichas) por conta/IP: mensagens, uploads, canais, perfil, "digitando", cadastro e login. Regras em `LIMITS`. |
| `server/db/backup.ts`, `server/modules/backup.ts` | Backup automático do PGlite (`DATA_DIR/backups`, diário, mantém 7) e `npm run db:restore`. Com Postgres: serviço `pg-backup` do compose. |
| `server/storage/` | `FileStorage` (disco hoje; S3/R2 depois) e `sniff.ts` (tipo e dimensões da imagem pelos bytes). |
| `server/auth.ts` | Contas: cadastro e-mail+senha (scrypt), login, sessões por token (30 dias), login com Google, perfil `nome#id` e foto. O id é único e imutável (o nome pode mudar). |
| `src/shared/types/` | **Contrato** entre app e servidor: um arquivo por domínio (tipos + `<Dominio>ClientEvents`/`<Dominio>ServerEvents`); `index.ts` compõe `ServerToClientEvents` / `ClientToServerEvents`. Importe sempre de `@shared/types`. |
| `src/main/index.ts` | Processo principal do Electron: janela, permissão de microfone e IPC `google-sign-in`. |
| `src/main/screen-share.ts` | Compartilhar tela: IPC `screen-sources`/`screen-select` e `setDisplayMediaRequestHandler` (entrega a fonte escolhida no seletor). |
| `src/main/notifications.ts`, `src/shared/notifications.ts` | Notificações (B9): IPC `notify`/`badge`, notificação nativa com clique que abre a conversa/Amigos e selo no ícone (overlay + piscar no Windows). Regras no renderer em `lib/notifications.ts` e `lib/actions/notifications.ts`; "Notificar mensagens de canal" (todas/só menções/nenhuma) em `components/settings/NotificationSettings.tsx` e `store/notifications.ts`. |
| `src/main/overlay.ts`, `src/shared/overlay.ts` | Sobreposição em jogos (B15): janela transparente sempre no topo que não recebe cliques, com quem está na minha sala e quem fala; IPC `overlay-config`/`overlay-room`/`overlay-update`/`overlay-toggled` e atalho global Shift + crase. Página própria: `src/renderer/overlay.html` + `src/renderer/src/overlay/` (2ª entrada no `electron.vite.config.ts`); lado do app em `lib/actions/overlay.ts` e `store/overlay.ts`. |
| `src/main/updater.ts`, `src/shared/updater.ts` | Atualização automática (A13): electron-updater nos GitHub Releases (ao abrir e a cada 4 h), IPC `update-get`/`update-install`/`update-status`; faixa `components/UpdateBanner.tsx`, `lib/actions/updates.ts`, `store/updates.ts`. Publicar: tag `vX.Y.Z` → `.github/workflows/release.yml`. |
| `src/main/push-to-talk.ts`, `src/shared/push-to-talk.ts` | Pressione para falar (B20): gancho de teclado/mouse do sistema com `uiohook-napi` (só roda com o modo ligado), IPC `ptt-config`/`ptt-capture` e avisos `ptt-change`/`ptt-unavailable`. Lado do app em `lib/actions/push-to-talk.ts` e `store/push-to-talk.ts`; portão do microfone em `voice.setMicGate`; tela em `components/voice/PushToTalk.tsx`. |
| `src/main/google-auth.ts` | Login com Google: navegador do sistema + loopback 127.0.0.1 + PKCE; devolve o código para o servidor trocar. |
| `src/preload/` | Ponte `contextBridge` (`window.api.platform`, `window.api.googleSignIn`, `window.api.screen`, `window.api.notifications` (B9), `window.api.overlay`/`overlayView` (B15) `window.api.updater` (A13) e `window.api.pushToTalk` (B20); tipos da tela em `src/shared/screen.ts`). |
| `src/renderer/src/store/` | Estado global zustand (`useApp`), um slice por domínio composto em `index.ts`. Só dados, sem ações. |
| `src/renderer/src/lib/client.ts` | Login/sessão e conexão Socket.IO; chama os `bind<Dominio>Events` e **reexporta todas as ações**. Componentes importam ações daqui. |
| `src/renderer/src/lib/actions/` | Ações e listeners por domínio (`account`, `channels`, `devices`, `friends` (amizades + DMs, v3), `tools` (sorteador, v4), `messages`, `moderation` (B6), `calls` (B8: ligar, atender, toque), `navigation` (B7: seção da barra de úteis, Home, abrir conversa), `permissions`, `presence`, `uploads`, `voice`, `sounds` (soundboard, B17), `push-to-talk` (pressione para falar, B20)). `voice-sounds.ts`: sons de entrar/sair da sala. `devices.ts`: microfone, saída, volume e silenciar por pessoa (preferências em `concord:audio`). `uploads.ts`: rascunho de anexos por canal, envio com progresso (`transport.send`, XHR). |
| `src/renderer/src/lib/permissions.ts` | Permissões na tela: `useCan`, `useCanAdminister`, `useNameColor` e helpers da hierarquia (mesma `can()` do servidor). |
| `src/renderer/src/components/rail/`, `home/`, `friends/`, `dm/`, `tools/` | Navegação (B7): `UtilityRail` (barra de úteis), `HomeSidebar`, `FriendsView` (abas e adicionar), `DmList`, registro de ferramentas (`tools/registry.ts`) e `ToolView`. Em `tools/` também os painéis e cartões no chat das ferramentas (B10: `*Panel.tsx`, `ToolResultCard`, `TeamResultCard` com "Mover para as salas", `PollCard`, `shared.tsx`, `people.tsx`). Estado em `store/navigation.ts`; helpers em `lib/dms.ts` e `lib/home.ts`. |
| `src/renderer/src/components/call/` | Chamadas (B8): `CallButton` (ligar), `CallPanel` (chamando/tocando/em andamento no topo da conversa, com os efeitos sonoros) e `IncomingCall` (cartão no canto). Toque em `lib/sounds/ringtone.ts`; estado em `store/calls.ts`. |
| `src/renderer/src/components/settings/` | Administração (B5): `CommunitySettingsDialog` (cargos e membros), `ChannelPermissionsDialog` (regras do canal), `RoleDot`. |
| `src/renderer/src/components/chat/` | `Composer` (texto + clipe/colar), `AttachmentPreview`, `MessageAttachments` (imagem no chat / cartão de arquivo), `ImageLightbox`, `MessageActions` (responder, editar e apagar), `MessageEditor` (editar no lugar, A15), `ReplyPreview` (citação e faixa "Respondendo a", B18) e `Reactions` (chips e seletor de emoji, A16; reusa o `EmojiPicker` de `voice/`), `MessageText` e `MentionMenu` (menções @nome, B19; puras em `lib/mentions.ts`, contrato em `src/shared/types/mentions.ts`). Arrastar e soltar fica no `ChatView`. |
| `src/renderer/src/lib/core.ts` | Socket atual (`getSocket`/`requireSocket`), `set`/`get` da store e `notify`. Usado pelas ações. |
| `src/renderer/src/lib/voice.ts` | `VoiceClient` sobre `livekit-client`: conecta na sala com o token do servidor, mute/deafen, quem está falando (`ActiveSpeakersChanged`). |
| `src/renderer/src/lib/voice-permissions.ts` | `permissionsFrom`: o que o LiveKit deixa esta conexão publicar (microfone com `speak`, tela com `share`), usado quando as permissões mudam com a pessoa na sala. |
| `src/renderer/src/lib/sounds/` | Sons da interface gerados pela Web Audio (`ChimePlayer`) e `roomChanges` (quem entrou/saiu da minha sala). Ligados em `lib/actions/voice-sounds.ts`. `Ringer` (`ringtone.ts`): toque das chamadas (B8). |
| `src/renderer/src/lib/noise/` | Supressão de ruído automática: `NoiseDecider` (quando ligar o filtro forte), `AutoNoiseProcessor` (processador do microfone no LiveKit) e o motor RNNoise (WASM empacotado). |
| `src/renderer/src/components/ui/` | Componentes shadcn/ui (estilo new-york, importando de `radix-ui`). |
| `docker-compose.yml`, `livekit.yaml` | Infra local: PostgreSQL 17 e LiveKit (SFU). Credenciais de dev espelhadas em `server/.env.example`. |
| `.github/workflows/ci.yml` | CI (A12): typecheck + testes em todo PR e push na `main` (Ubuntu, Node 22, PGlite, sem Docker). |
| `Dockerfile`, `docker-compose.prod.yml`, `deploy/` | Hospedagem pela internet (A14): imagem do servidor, compose de produção (servidor + Postgres com backup + LiveKit com TURN + Caddy/HTTPS), `deploy/.env.example` e o guia `deploy/README.md`. |
| `vitest.config.ts` | Testes `*.test.ts(x)` ao lado do código (`npm test`). |
| `src/renderer/src/components/` | Telas: `LoginScreen`, `ChannelSidebar`, `ChatView`, `VoiceView`, `MemberList`, `UserPanel`, `CreateChannelDialog`, `Toast`; `voice/` tem `VoiceGrid`, `ScreenTile` e `ScreenPicker` (tela compartilhada) e `DeviceSettings` (microfone e saída) e `CameraTile` (câmera de cada um na grade, B21) e `Soundboard`/`SoundUploadForm`/`EmojiPicker` (efeitos sonoros, B17; ações em `lib/actions/sounds.ts`, estado em `store/sounds.ts`) e `MemberContextMenu` (botão direito numa pessoa: volume, silenciar, cargos, moderação, "Mensagem"/"Adicionar amigo" (B7), ver perfil) com `ModerationMenu` (silenciar para todos e expulsar da voz, B6); `UserProfileDialog` é o cartão de perfil. |

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
npm run dist        # instalador Windows em dist/ (sem publicar)
npm run release     # instalador + publica no GitHub Releases (usado pelo workflow da tag vX.Y.Z)
```

## Regras do projeto

1. **Todo evento novo começa em `src/shared/types/<dominio>.ts`.** Depois `server/modules/`, depois `lib/actions/`, depois UI.
2. Componentes **leem** estado com `useApp(selector)` e **agem** chamando funções de `@/lib/client`. Não use o socket direto em componentes.
3. **Arquivos de registro** (`shared/types/index.ts`, `server/index.ts`, `lib/client.ts`, `store/index.ts`) só recebem linhas de registro de um domínio novo, nunca lógica. Isso evita conflito entre os dois devs (ver `docs/ROADMAP.md`).
4. Módulos do servidor **não importam `server/db/`**: leem e gravam pelo `server/repo/`. Mudou o schema → `npm run db:generate` (só depois do rebase na `main`) e nunca edite uma migration já mergeada.
5. **Toda tarefa vem com testes automatizados** (vitest, `*.test.ts` ao lado do código). Uma tarefa só está completa quando `npm test` **e** `npm run typecheck` passam por completo. Testes de integração do servidor ficam em `server/tests/<dominio>.test.ts` e sobem o servidor de verdade (`server/tests/helpers.ts`); ações do app são testadas com o socket falso (`src/renderer/src/test/fake-socket.ts`); componentes com `// @vitest-environment jsdom` + Testing Library (veja `components/chat/chat.test.tsx`).
6. Handlers async do servidor rodam dentro de `guard('evento', async () => { ... })` (erro não derruba o processo).
7. Seletores que retornam arrays/objetos novos (ex.: `filter`) usam `useShallow` de `zustand/react/shallow`.
8. **Permissões (v2):** handler que lê ou muda algo de um canal confere `await allowed(accountId, 'view' | 'send' | ..., channelId)`; evento de canal vai por `emitToViewers` (nunca `io.emit`, que vazaria canal privado). A dona (primeira conta) pode tudo. Skill `concord-permissions`.
9. O servidor **valida tudo** que chega (tipo, tamanho, existência do canal); nunca confie no cliente. Ação nova que pode ser abusada (cria coisa, manda para todos) ganha uma regra em `LIMITS` (`server/middleware/rate-limit.ts`).
10. Visual: use os tokens de cor do tema (`bg-sidebar`, `bg-rail`, `bg-panel`, `bg-composer`, `text-muted-foreground`, `text-success`...) definidos em `src/renderer/src/assets/globals.css`. Não use cores hex soltas nos componentes.
11. Novos componentes shadcn: `npx shadcn@latest add <nome>` (o `components.json` já aponta para os aliases certos).
12. Textos da interface em **português do Brasil**.
13. Aliases: `@/` → `src/renderer/src/`, `@shared/` → `src/shared/` (o servidor importa por caminho relativo `../src/shared/types`).
14. **Toda tarefa, todo módulo novo e toda alteração vêm com a skill correspondente** em `.claude/skills/`. Sem isso a tarefa **não está finalizada**, mesmo com testes e typecheck passando. Ver "Definição de pronto" abaixo.

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
- `concord-messages` — mensagens: envio, histórico, editar (A15), responder citando (B18), reações (A16) e menções @nome (B19).
- `concord-permissions` — cargos e permissões (v2): regra de cálculo compartilhada, @todos, dona, regras por canal, hierarquia, eventos `role:*` e o que cada handler bloqueia.
- `concord-friends` — amizades (v3): pedidos por `nome#id`, bloqueio, online só para amigos e os eventos `friend:*`.
- `concord-dms` — conversas privadas (v3): canal `dm` com dois membros, quem pode abrir, acesso só dos membros, bloqueio e os eventos `dm:*`.
- `concord-tools` — ferramentas do grupo (v4): sorteio no servidor, mensagem `kind: 'tool'`, sorteador de times (`tools:teams`, lanes e preferências), dado, moeda, sortear 1 nome e como criar uma ferramenta nova.
- `concord-themes` — temas personalizáveis (v5): `ThemeConfig`, `validateTheme`, código de compartilhamento e preferências da conta no servidor.
- `concord-sounds` — efeitos sonoros (soundboard): envio por `POST /sounds`, tipo e duração pelos bytes, tocar só para a sala, sobreposição e quem apaga.
- `concord-calls` — chamadas privadas (B8): ligar, tocar, atender, desligar, tempos limite e os eventos `call:*`.
- `concord-home` — navegação (B7): barra de úteis, Home (Amigos e conversas), `section`/`homeView`, "Mensagem" no botão direito e o registro de ferramentas.
- `concord-moderation` — moderação (B6): expulsar da voz, silenciar pelo servidor e apagar mensagem, com a hierarquia e os eventos `moderation:*`/`message:delete`.
- `concord-attachments` — anexos: envio por `POST /uploads`, download por `GET /files`, tipo pelos bytes, storage, limpeza e a interface (clipe, colar, arrastar, prévia).
- `concord-voice` — como a voz funciona (LiveKit no servidor, token por sala), compartilhamento de tela, dispositivos e volume por pessoa, pressione para falar (B20), limites e depuração.
- `concord-notifications` — notificações (B9): quando avisar (conversa, chamada, pedido de amizade, só fora de foco), clique e selo no ícone.
- `concord-overlay` — sobreposição em jogos (B15): janela transparente com quem fala, atalho global, canto/tamanho e o limite da tela cheia exclusiva.
- `concord-updates` — atualização automática (A13): electron-updater, faixa "Reiniciar para atualizar" e como publicar uma versão (tag vX.Y.Z).
- `concord-deploy` — hospedar pela internet (A14): imagem, compose de produção, LiveKit com TURN, Caddy, variáveis e guia.
- `concord-dev-workflow` — rodar, testar com vários usuários, build e solução de problemas conhecidos.
