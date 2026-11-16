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
| `src/renderer/src/components/settings/appearance/` | Seção "Aparência" das Configurações (v5, B12): temas prontos, meus temas, editor ao vivo e compartilhar por código. |
| `src/main/translucency.ts`, `src/shared/translucency.ts` | Tema translúcido (vidro): `supportsTranslucency` (Windows 11 22H2+ e macOS) e o IPC `window-translucency`, que liga o material da janela (acrílico/vibrancy); `window.api.translucency` no preload. |
| `src/renderer/src/lib/theme/` | Motor de temas (v5, B11): `deriveTokens` (tokens de cor a partir do `ThemeConfig`, contraste AA garantido), `THEME_PRESETS`, `applyTheme` e o tema guardado na máquina. Sincronia com a conta em `lib/actions/preferences.ts`. |
| `server/files-signing.ts` | Links de download de anexo assinados por pessoa (HMAC, validade 24 h); o download confere se a conta ainda vê o canal. |
| `server/modules/calls.ts` | Chamadas privadas (B8): `call:invite/accept/decline/cancel/end/list`, tempo de toque, fim quando a sala da conversa esvazia (`onVoiceRoomsChange` de `voice.ts`) e `endCall` (bloqueio). Contrato em `src/shared/types/calls.ts`. |
| `server/modules/moderation.ts` | Moderação (B6): `moderation:voice-kick`, `moderation:voice-move` (mover para outra sala: botão direito "Mover para" ou arrastar na barra lateral; quem é movido recebe `moderation:moved`), `moderation:voice-mute` (silêncio pelo servidor, em `voice.ts`, guardado no banco: tabela `server_mutes` em `server/db/schema/moderation.ts`, dados em `server/repo/moderation.ts`) e `message:delete`. Regras `canModerate`/`canMoveMember` (mover: `moveMembers` ou `manageMembers`)/`canDeleteMessage` em `src/shared/types/moderation.ts`. |
| `server/modules/permissions.ts` | Eventos de cargos (`access:get`, `role:*`, `member:set-roles`, `channel:set-overrides`), hierarquia e `applyAccessChange` (avisa `access:updated`/`channels:visible` e tira da voz quem perdeu `connect`). |
| `server/tests/` | Testes de integração e helpers: `helpers.ts` (`TestServer` com a dona: `asOwner()`, `createChannel()`), `database.ts` (banco de teste), `fake-livekit.ts` (LiveKit falso: `FakeLiveKit`, `liveKitEnv`). |
| `server/middleware/rate-limit.ts` | Limite de requisições (balde de fichas) por conta/IP: mensagens, uploads, canais, perfil, "digitando", cadastro e login. Regras em `LIMITS`. |
| `server/db/backup.ts`, `server/modules/backup.ts` | Backup automático do PGlite (`DATA_DIR/backups`, diário, mantém 7) e `npm run db:restore`. Com Postgres: serviço `pg-backup` do compose. |
| `server/storage/` | `FileStorage` (disco hoje; S3/R2 depois) e `sniff.ts` (tipo e dimensões da imagem pelos bytes). |
| `server/auth.ts` | Contas: cadastro e-mail+senha (scrypt), login, sessões por token (30 dias), login com Google, perfil `nome#id` e foto. O id é único e imutável (o nome pode mudar). |
| `src/shared/types/` | **Contrato** entre app e servidor: um arquivo por domínio (tipos + `<Dominio>ClientEvents`/`<Dominio>ServerEvents`); `index.ts` compõe `ServerToClientEvents` / `ClientToServerEvents`. Importe sempre de `@shared/types`. |
| `src/main/permissions.ts` | Permissões que a página pode pedir ao Electron (`allowPermission`): microfone/câmera, notificações e tela cheia; o resto é negado. |
| `src/main/index.ts` | Processo principal do Electron: janela, permissões (`./permissions`), IPC `google-sign-in` e links externos (só http/https vão para o navegador; `will-navigate` bloqueado). |
| `src/shared/links.ts` | Links nas mensagens (puras): `splitLinks` (acha `http(s)://` e `www.`, sem a pontuação da frase) e `externalUrl` (só http/https). Usado pelo `MessageText` e pelo processo principal. |
| `src/main/screen-share.ts` | Compartilhar tela: IPC `screen-sources`/`screen-select` e `setDisplayMediaRequestHandler` (entrega a fonte escolhida no seletor). |
| `src/main/notifications.ts`, `src/shared/notifications.ts` | Notificações (B9): IPC `notify`/`badge`, notificação nativa com clique que abre a conversa/Amigos e selo no ícone (overlay + piscar no Windows). Regras no renderer em `lib/notifications.ts` e `lib/actions/notifications.ts`; "Notificar mensagens de canal" (todas/só menções/nenhuma) em `components/settings/NotificationSettings.tsx` e `store/notifications.ts`. |
| `src/main/overlay.ts`, `src/shared/overlay.ts` | Sobreposição em jogos (B15): janela transparente sempre no topo que não recebe cliques, só com quem está falando na minha sala e escondida enquanto o Concord está em foco; IPC `overlay-config`/`overlay-room`/`overlay-update`/`overlay-toggled`/`overlay-edit`/`overlay-editing`/`overlay-moved`, atalho global Shift + crase (liga/desliga) e Ctrl + Shift + crase (modo de mover: arrastar como no Discord, posição salva). Página própria: `src/renderer/overlay.html` + `src/renderer/src/overlay/` (2ª entrada no `electron.vite.config.ts`); lado do app em `lib/actions/overlay.ts` e `store/overlay.ts`. |
| `src/main/updater.ts`, `src/shared/updater.ts` | Atualização automática (A13): electron-updater nos GitHub Releases (ao abrir, a cada 30 min e no botão "Procurar atualizações" no fim da barra de úteis), IPC `update-get`/`update-check`/`update-install`/`update-status`; faixa `components/UpdateBanner.tsx`, botão acima do Início na barra de úteis (`components/rail/UpdateButton.tsx`), `lib/actions/updates.ts`, `store/updates.ts`. Publicar: tag `vX.Y.Z` → `.github/workflows/release.yml`. |
| `src/main/push-to-talk.ts`, `src/shared/push-to-talk.ts` | Pressione para falar (B20): gancho de teclado/mouse do sistema com `uiohook-napi` (só roda com o modo ligado), IPC `ptt-config`/`ptt-capture` e avisos `ptt-change`/`ptt-unavailable`. Lado do app em `lib/actions/push-to-talk.ts` e `store/push-to-talk.ts`; portão do microfone em `voice.setMicGate`; tela em `components/voice/PushToTalk.tsx`. |
| `src/main/google-auth.ts` | Login com Google: navegador do sistema + loopback 127.0.0.1 + PKCE; devolve o código para o servidor trocar. |
| `src/preload/` | Ponte `contextBridge` (`window.api.platform`, `window.api.googleSignIn`, `window.api.screen`, `window.api.notifications` (B9), `window.api.overlay`/`overlayView` (B15) `window.api.updater` (A13) e `window.api.pushToTalk` (B20); tipos da tela em `src/shared/screen.ts`). |
| `src/renderer/src/store/` | Estado global zustand (`useApp`), um slice por domínio composto em `index.ts`. Só dados, sem ações. |
| `src/renderer/src/lib/client.ts` | Login/sessão e conexão Socket.IO; chama os `bind<Dominio>Events` e **reexporta todas as ações**. Componentes importam ações daqui. |
| `src/renderer/src/lib/actions/` | Ações e listeners por domínio (`account`, `channels`, `devices`, `friends` (amizades + DMs, v3), `tools` (sorteador, v4), `messages`, `moderation` (B6), `calls` (B8: ligar, atender, toque), `navigation` (B7: seção da barra de úteis, Home, abrir conversa), `permissions`, `presence`, `uploads`, `voice`, `sounds` (soundboard, B17), `push-to-talk` (pressione para falar, B20)). `voice-sounds.ts`: sons de entrar/sair da sala. `devices.ts`: microfone, saída, volume e silenciar por pessoa (preferências em `concord:audio`). `uploads.ts`: rascunho de anexos por canal, envio com progresso (`transport.send`, XHR). |
| `src/renderer/src/lib/permissions.ts` | Permissões na tela: `useCan`, `useCanAdminister`, `useNameColor` e helpers da hierarquia (mesma `can()` do servidor). |
| `src/renderer/src/components/rail/`, `home/`, `friends/`, `dm/`, `tools/` | Navegação (B7): `UtilityRail` (barra de úteis), `HomeSidebar`, `FriendsView` (abas e adicionar), `DmList`, registro de ferramentas (`tools/registry.ts`) e `ToolView`. Em `tools/` também os painéis e cartões no chat das ferramentas (B10: `*Panel.tsx`, `ToolResultCard`, `TeamResultCard` com "Mover para as salas", `PollCard`, `shared.tsx`, `people.tsx`). Estado em `store/navigation.ts`; helpers em `lib/dms.ts` e `lib/home.ts`. |
| `src/renderer/src/components/call/` | Chamadas (B8): `CallButton` (ligar), `CallPanel` (chamando/tocando/em andamento no topo da conversa, com os efeitos sonoros) e `IncomingCall` (cartão no canto). Toque em `lib/sounds/ringtone.ts`; estado em `store/calls.ts`. |
| `src/renderer/src/components/settings/` | Configurações do usuário: `UserSettingsDialog` (janela única com menu: `AccountSettings` "Minha conta", `VoiceSettings` "Voz e vídeo", `appearance/AppearanceSettings` "Aparência", `NotificationSettings` "Notificações"; estado em `store/settings.ts`, ações em `lib/actions/settings.ts`). Administração (B5): `CommunitySettingsDialog` (cargos e membros), `ChannelPermissionsDialog` (regras do canal), `RoleDot`. |
| `src/renderer/src/components/chat/` | `Composer` (texto + clipe/colar), `AttachmentPreview`, `MessageAttachments` (imagem no chat / cartão de arquivo), `ImageLightbox`, `MessageActions` (responder, editar e apagar), `MessageEditor` (editar no lugar, A15), `ReplyPreview` (citação e faixa "Respondendo a", B18) e `Reactions` (chips e seletor de emoji, A16; reusa o `EmojiPicker` de `voice/`), `MessageText` (menções e links clicáveis) e `MentionMenu` (menções @nome, B19; puras em `lib/mentions.ts`, contrato em `src/shared/types/mentions.ts`). Arrastar e soltar fica no `ChatView`. |
| `src/renderer/src/lib/core.ts` | Socket atual (`getSocket`/`requireSocket`), `set`/`get` da store e `notify`. Usado pelas ações. |
| `src/renderer/src/lib/voice.ts` | `VoiceClient` sobre `livekit-client`: conecta na sala com o token do servidor, mute/deafen, quem está falando (`ActiveSpeakersChanged`). |
| `src/renderer/src/components/ResizableSide.tsx`, `src/renderer/src/lib/side-width.ts` | Barras laterais redimensionáveis (canais/Home, membros, chat da sala de voz): alça de arrastar, duplo clique volta ao padrão, limites e largura guardada na máquina em `SIDE_PANELS`. Doc em `docs/areas/home.md`. |
| `src/renderer/src/lib/tile-layout.ts` | Grade da sala de voz centralizada com tamanho automático: `bestTileLayout` (colunas e largura do quadro 16:9 pelo espaço) e `useElementSize` (mede com `ResizeObserver`). Usado pelo `TileGrid` da `VoiceGrid`. |
| `src/renderer/src/lib/featured-screens.ts` | Telas em destaque na sala de voz (várias ao mesmo tempo): `featuredScreens` (quais e em que ordem), `toggleFeatured` (pôr/tirar) e `moveScreen` (arrastar para reordenar). Usado pela `VoiceGrid`/`ScreenStage`. |
| `src/renderer/src/lib/mic-gain.ts` | Volume do microfone (0–200%) e de saída (0–100%): limites e `MicGainProcessor` (ganho no microfone com a supressão de ruído desligada). Aplicado em `voice.setMicGain`/`setOutputVolume`; preferências em `lib/actions/devices.ts`. |
| `src/renderer/src/lib/voice-permissions.ts` | `permissionsFrom`: o que o LiveKit deixa esta conexão publicar (microfone com `speak`, tela com `share`), usado quando as permissões mudam com a pessoa na sala. |
| `src/renderer/src/lib/sounds/` | Sons da interface gerados pela Web Audio (`ChimePlayer`) e `roomChanges` (quem entrou/saiu da minha sala). Ligados em `lib/actions/voice-sounds.ts`. `Ringer` (`ringtone.ts`): toque das chamadas (B8). |
| `src/renderer/src/lib/noise/` | Supressão de ruído automática: `NoiseDecider` (quando ligar o filtro forte), `AutoNoiseProcessor` (processador do microfone no LiveKit) e o motor RNNoise (WASM empacotado). |
| `src/renderer/src/components/ui/` | Componentes shadcn/ui (estilo new-york, importando de `radix-ui`). |
| `vercel.json`, `src/renderer/src/lib/default-server.ts`, `src/renderer/src/env.d.ts` | Versão web opcional (`docs/areas/deploy.md`): a Vercel publica só `out/renderer`; `VITE_DEFAULT_SERVER` no build define o servidor padrão da tela de login (também no instalador). |
| `docker-compose.yml`, `livekit.yaml`, `.env.example` | Infra local: PostgreSQL 17 e LiveKit (SFU). Credenciais de dev espelhadas em `server/.env.example`; `.env` na raiz (modelo `.env.example`) é do compose: `LIVEKIT_NODE_IP` para a voz de quem vem de outra máquina. |
| `.github/workflows/ci.yml` | CI (A12): typecheck + testes em todo PR e push na `main` (Ubuntu, Node 22, PGlite, sem Docker). |
| `.github/workflows/pr-version.yml`, `.github/workflows/auto-release.yml`, `.github/workflows/release.yml`, `.github/scripts/next-version.mjs` | Versão e release automáticas: o PR recebe o commit da versão no `package.json` (patch; labels `release: minor`/`release: major`/`sem release`; secret `RELEASE_TOKEN`); no merge, tag `vX.Y.Z` e instalador no GitHub Releases (`docs/areas/updates.md`). |
| `Dockerfile`, `docker-compose.prod.yml`, `deploy/` | Hospedagem pela internet (A14): imagem do servidor, compose de produção (servidor + Postgres com backup + LiveKit com TURN + Caddy/HTTPS), `deploy/.env.example` e o guia `deploy/README.md`. |
| `docs/` | Documentação, organizada por gênero em pastas: `areas/` (referência por área, apontada pelas skills `concord-*`), `decisions/` (ADRs) e `ROADMAP.md` (plano das tasks). As regras e o índice das pastas estão em `docs/AGENTS.md`. |
| `vitest.config.ts` | Testes `*.test.ts(x)` ao lado do código (`npm test`). |
| `src/renderer/src/components/` | Telas: `LoginScreen`, `ChannelSidebar`, `ChatView` (também `embedded` no chat da sala de voz), `VoiceView` (com o botão e o painel "Chat" da sala), `MemberList`, `UserPanel` (com o `VoiceStatusPanel` "Voz conectada": câmera, tela e efeitos sonoros fora da sala; monta `DeviceSettings` e `ScreenPicker` uma vez só), `CreateChannelDialog`, `Toast`; `voice/` tem `VoiceGrid`, `ScreenTile` (miniatura e `ScreenStage`: uma ou mais telas em destaque, lado a lado ou empilhadas e reordenáveis arrastando, com "Assistindo", seletor das telas ao vivo (pôr/tirar do destaque), "Ver grade" e tela cheia via `lib/fullscreen.ts`) e `ScreenPicker` (tela compartilhada) e `CameraTile` (câmera de cada um na grade, B21) e `Soundboard` (`SoundboardPopover`: popup sem modal ancorado no botão)/`SoundUploadForm`/`EmojiPicker` (efeitos sonoros, B17; ações em `lib/actions/sounds.ts`, estado em `store/sounds.ts`) e `MemberContextMenu` (botão direito numa pessoa: volume, silenciar, cargos, moderação, "Mensagem"/"Adicionar amigo" (B7), ver perfil) com `ModerationMenu` (mover para outra sala, silenciar para todos e expulsar da voz, B6); `UserProfileDialog` é o cartão de perfil. |

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

## Princípios de código (P0–P8: valem por cima de qualquer regra de domínio)

**P0 — TDD.** O teste que falha vem **antes** da implementação. Teste honesto, que quebraria de verdade se o
comportamento quebrasse: teste que afirma que um mock foi chamado prova que o mock funciona. Antes de dizer que
algo está coberto, quebre a implementação e veja o teste morrer.

**P1 — Clean Code e Clean Architecture** (Uncle Bob), até o fim: a dependência aponta para o domínio, nunca o
contrário. No Concord isso é literal — `server/modules/` não importa `server/db/` (R4) e componente não usa socket
direto (R2).

**P2 — Zero comentários.** Nenhum. Nem `TODO`, `FIXME` ou similar. Código que precisa de comentário para ser
entendido é código ruim: arrume o **nome** da função, da variável, do tipo. O que precisa ser documentado vai para
`docs/`, nunca ao lado do código — comentário apodrece longe do que descreve.

**P3 — Código desacoplado.** Escreva pensando primeiro em quem vai manter. Meça acoplamento por "o que quebra se
eu mudar isto": se não dá para mudar A sem abrir B para ver o que ele assumia, estão acoplados.

**P4 — KISS, YAGNI, DRY** na frente de tudo. DRY vale para **conhecimento**, não para caracteres: duas linhas
iguais que mudam por motivos diferentes continuam duas.

**P5 — Pense e defina antes de escrever.** Decisão de forma (onde mora, quem depende de quem, qual contrato) é
tomada antes do primeiro arquivo, não descoberta no meio do diff.

**P6 — Simplicidade primeiro.** O mínimo de código que resolve o problema pedido. Nada especulativo:

- nenhuma funcionalidade além da pedida;
- abstração só quando você **sabe** que vai expandir — se não sabe, **pergunte**;
- nenhuma "flexibilidade" ou configuração que ninguém pediu (flag com um valor só, wrapper com um chamador);
- nenhum tratamento de erro para cenário impossível.

A pergunta de controle: *o que um sênior de 20+ anos faria aqui para o código ficar mais limpo e mais fácil de
manter?*

**P7 — Execução guiada por objetivo.** Defina o critério de sucesso e repita até verificar. Transforme a tarefa
num objetivo verificável:

- "adicionar validação" → "escrever os testes de entrada inválida e fazê-los passar";
- "corrigir o bug" → "escrever o teste que reproduz o sintoma e fazê-lo passar";
- "refatorar X" → "garantir que os testes passam antes e depois".

Tarefa de vários passos ganha um plano curto, cada passo com a sua verificação:

```
1. Passo → verifica: comando/checagem
2. Passo → verifica: comando/checagem
```

Critério forte deixa quem executa fechar o laço sozinho; "faz funcionar" obriga a perguntar a cada passo.

**P8 — Evidência antes de "pronto".** "Funciona", "passou", "corrigido" são afirmações sobre um comando que você
**acabou de rodar e cujo resultado leu**. Se não rodou, diga o estado real.

## Regras do projeto

Regras deste projeto (R1–R14); os princípios acima (P0–P8) valem por cima delas.

1. **Todo evento novo começa em `src/shared/types/<dominio>.ts`.** Depois `server/modules/`, depois `lib/actions/`, depois UI.
2. Componentes **leem** estado com `useApp(selector)` e **agem** chamando funções de `@/lib/client`. Não use o socket direto em componentes.
3. **Arquivos de registro** (`shared/types/index.ts`, `server/index.ts`, `lib/client.ts`, `store/index.ts`) só recebem linhas de registro de um domínio novo, nunca lógica. Isso evita conflito entre os dois devs (ver `docs/ROADMAP.md`).
4. Módulos do servidor **não importam `server/db/`**: leem e gravam pelo `server/repo/`. Mudou o schema → `npm run db:generate` (só depois do rebase na `main`) e nunca edite uma migration já mergeada.
5. **Toda tarefa vem com testes automatizados** (vitest, `*.test.ts` ao lado do código). Uma tarefa só está completa quando `npm test` **e** `npm run typecheck` passam por completo. Testes de integração do servidor ficam em `server/tests/<dominio>.test.ts` e sobem o servidor de verdade (`server/tests/helpers.ts`); ações do app são testadas com o socket falso (`src/renderer/src/test/fake-socket.ts`); componentes com `// @vitest-environment jsdom` + Testing Library (veja `components/chat/chat.test.tsx`).
6. Handlers async do servidor rodam dentro de `guard('evento', async () => { ... })` (erro não derruba o processo).
7. Seletores que retornam arrays/objetos novos (ex.: `filter`) usam `useShallow` de `zustand/react/shallow`.
8. **Permissões (v2):** handler que lê ou muda algo de um canal confere `await allowed(accountId, 'view' | 'send' | ..., channelId)`; evento de canal vai por `emitToViewers` (nunca `io.emit`, que vazaria canal privado). A dona (primeira conta) pode tudo. `docs/areas/permissions.md`.
9. O servidor **valida tudo** que chega (tipo, tamanho, existência do canal); nunca confie no cliente. Ação nova que pode ser abusada (cria coisa, manda para todos) ganha uma regra em `LIMITS` (`server/middleware/rate-limit.ts`).
10. Visual: use os tokens de cor do tema (`bg-sidebar`, `bg-rail`, `bg-panel`, `bg-composer`, `text-muted-foreground`, `text-success`...) definidos em `src/renderer/src/assets/globals.css`. Não use cores hex soltas nos componentes.
11. Novos componentes shadcn: `npx shadcn@latest add <nome>` (o `components.json` já aponta para os aliases certos).
12. Textos da interface em **português do Brasil**.
13. Aliases: `@/` → `src/renderer/src/`, `@shared/` → `src/shared/` (o servidor importa por caminho relativo `../src/shared/types`).
14. **Toda tarefa, todo módulo novo e toda alteração vêm com a documentação correspondente** em `docs/areas/<area>.md`. Sem isso a tarefa **não está finalizada**, mesmo com testes e typecheck passando. Ver "Definição de pronto" abaixo.

## Definição de pronto

Uma tarefa (task do roadmap, correção, refatoração ou mudança de comportamento) só está **finalizada** quando:

1. `npm run typecheck` **e** `npm test` passam por completo, com testes novos cobrindo a mudança (regra 5).
2. **A documentação da área está em dia com o código entregue** (`docs/areas/<area>.md`):
   - **Área nova** (domínio, módulo do servidor, processo do Electron, conjunto de telas): crie
     `docs/areas/<area>.md` e a skill-ponteiro `.claude/skills/concord-<area>/SKILL.md` — só frontmatter
     (`name` e `description`, e a `description` diz **quando** abrir o doc, citando arquivos e eventos) mais
     a linha que manda ler o doc. Acrescente a área na lista "Documentação por área" abaixo.
     Se a área for pequena e pertencer a um doc que já existe, uma **seção nova** nesse doc basta.
   - **Alteração** em algo que já tem doc: atualize as seções afetadas no mesmo PR. Nada de doc descrevendo
     comportamento antigo (evento removido, arquivo renomeado, regra que mudou).
   - O conteúdo mínimo de cada doc ou seção: o que faz e por quê, arquivos envolvidos, eventos e contratos
     (`shared/types`), fluxo principal, regras e limites, como testar e problemas conhecidos/depuração.
   - **Nada de conteúdo nas skills `concord-*`.** Elas são só o gatilho que leva ao doc; regra duplicada
     divergiria no PR seguinte. As skills de **competência** (`wise-dev`, `test-strategy`, `code-quality`,
     `token-efficiency`, `semantic-docs`) são a exceção: descrevem *como trabalhar*, não como o Concord é, e
     carregam o próprio conteúdo em `reference/`.
3. Decisão que **custa caro desfazer** (troca de biblioteca, formato de dado, limite, protocolo) vira um ADR em
   `docs/decisions/NNNN-*.md`, com as alternativas descartadas. Modelo em `docs/decisions/README.md`.
4. Eventos novos ou alterados aparecem na tabela de eventos de `docs/areas/architecture.md`.
5. Arquivo ou pasta nova aparece no "Mapa rápido" deste arquivo.
6. O PR diz quais docs e ADRs foram criados ou atualizados. Revisor: PR sem doc atualizado volta.

## Documentação por área

Leia o doc certo antes de mexer em cada área (ficam em `docs/areas/<area>.md`; as skills `concord-*` são só
ponteiros para eles):

- `docs/areas/architecture.md` — visão completa: fluxo de dados, todos os eventos, estado, ciclo de conexão.
- `docs/areas/add-feature.md` — passo a passo para adicionar uma funcionalidade de ponta a ponta, com exemplo.
- `docs/areas/accounts.md` — contas: cadastro/login com e-mail e senha, sessões, login com Google, perfil `nome#id` e foto, regra do id único e imutável.
- `docs/areas/messages.md` — mensagens: envio, histórico, editar (A15), responder citando (B18), reações (A16), menções @nome (B19) e links clicáveis.
- `docs/areas/permissions.md` — cargos e permissões (v2): regra de cálculo compartilhada, @todos, dona, regras por canal, hierarquia, eventos `role:*` e o que cada handler bloqueia.
- `docs/areas/friends.md` — amizades (v3): pedidos por `nome#id`, bloqueio, online só para amigos e os eventos `friend:*`.
- `docs/areas/dms.md` — conversas privadas (v3): canal `dm` com dois membros, quem pode abrir, acesso só dos membros, bloqueio e os eventos `dm:*`.
- `docs/areas/tools.md` — ferramentas do grupo (v4): sorteio no servidor, mensagem `kind: 'tool'`, sorteador de times (`tools:teams`, lanes e preferências), dado, moeda, sortear 1 nome e como criar uma ferramenta nova.
- `docs/areas/settings.md` — configurações do usuário: janela única com menu lateral (Minha conta, Voz e vídeo, Aparência, Notificações), `openSettings`/`openDeviceSettings` e a conta nova do Google escolhendo o id.
- `docs/areas/themes.md` — temas personalizáveis (v5), "Surpreenda-me" e o tema translúcido (vidro): `ThemeConfig`, `validateTheme`, código de compartilhamento e preferências da conta no servidor.
- `docs/areas/sounds.md` — efeitos sonoros (soundboard): envio por `POST /sounds`, tipo e duração pelos bytes, tocar só para a sala, sobreposição e quem apaga.
- `docs/areas/calls.md` — chamadas privadas (B8): ligar, tocar, atender, desligar, tempos limite e os eventos `call:*`.
- `docs/areas/home.md` — navegação (B7): barra de úteis, Home (Amigos e conversas), `section`/`homeView`, "Mensagem" no botão direito e o registro de ferramentas.
- `docs/areas/moderation.md` — moderação (B6): expulsar da voz, silenciar pelo servidor e apagar mensagem, com a hierarquia e os eventos `moderation:*`/`message:delete`.
- `docs/areas/attachments.md` — anexos: envio por `POST /uploads`, download por `GET /files`, tipo pelos bytes, storage, limpeza e a interface (clipe, colar, arrastar, prévia).
- `docs/areas/voice.md` — como a voz funciona (LiveKit no servidor, token por sala), compartilhamento de tela, dispositivos e volume por pessoa, pressione para falar (B20), limites e depuração.
- `docs/areas/notifications.md` — notificações (B9): quando avisar (conversa, chamada, pedido de amizade, só fora de foco), clique e selo no ícone.
- `docs/areas/overlay.md` — sobreposição em jogos (B15): janela transparente com quem fala, atalho global, canto/tamanho, arrastar para mover (como no Discord) e o limite da tela cheia exclusiva.
- `docs/areas/updates.md` — atualização automática (A13): electron-updater, faixa e botão "Atualizar o Concord", e a release automática a cada PR mergeado na `main` (tag vX.Y.Z).
- `docs/areas/deploy.md` — hospedar pela internet (A14): imagem, compose de produção, LiveKit com TURN, Caddy, variáveis e guia.
- `docs/areas/dev-workflow.md` — rodar, testar com vários usuários, build e solução de problemas conhecidos.

## Estilo das respostas

Poucas palavras, o suficiente para entender. Simples, curto, **ultra resumido** — e **sem perder detalhe**.
O leitor quer ler **o mínimo** e entender **o máximo**. Resultado primeiro; se algo falhou, na primeira frase.
Tabela em vez de parágrafo para fatos. Sem emoji. Sem narrar o processo.

## Git

- Trabalhe em **git worktree** dentro de `.claude/worktrees/<nome>` (ignorado pelo git).
- Worktree nova sai sempre da `main` — exceto em branch empilhada (stacked) para trabalho em paralelo.
- **Sempre rebase na `main`** antes de trabalhar e ao pesquisar, para não decidir em cima de código velho.
  Lembre da R4: `npm run db:generate` só **depois** do rebase.
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), **Conventional Branches**
  (`feat/<assunto>`, `fix/<assunto>`; a task do roadmap entra no corpo da mensagem, ex.: `feat: ... (B21)`) e o
  título do PR no mesmo formato. O histórico anterior à adoção não segue isso; não reescreva.
