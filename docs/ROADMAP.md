# Concord — roadmap v1 → v5 para 2 devs em paralelo

## Contexto

O Concord já tem contas (e-mail+senha e Google), canais de texto, canais de voz (WebRTC em malha) e presença.
Faltam: anexos (imagens/arquivos), compartilhamento de tela, banco de dados de verdade (hoje é `server/data/db.json`),
permissões, amizades/DMs e ferramentas do grupo. Duas pessoas vão implementar em computadores diferentes, então o
plano é organizado para que cada task mexa em **arquivos próprios**.

Decisões já tomadas:

- **Banco:** PostgreSQL + Drizzle ORM (gratuito, self-hosted via Docker; compatível com Neon/Supabase free se quiserem gerenciado).
- **Voz/tela:** salas com mais de 15 pessoas → trocar a malha P2P por **LiveKit** (SFU open source, self-hosted, gratuito) já na v1.
- **Permissões (v2):** cargos estilo Discord simplificado.
- **Hospedagem:** indefinida → tudo sobe por `docker compose` (Postgres + LiveKit) e arquivos ficam atrás de uma interface de storage (disco local agora; S3-compatível tipo MinIO/R2 depois, sem mudar o resto).
- Sem "servidores/guildas": continua uma única comunidade. A barra da esquerda, onde o Discord lista servidores, vira a **barra de úteis** (Home, Comunidade e as ferramentas do grupo da v4).
- **Temas (v5):** temas com gradiente e cor de destaque, prontos e editáveis, salvos na conta e compartilháveis por código, grátis para todos.

> Ajuste em relação ao pedido: a migração para Postgres entra **na v1** (não na v2). Anexos, permissões e DMs
> dependem do schema; fazer depois significaria reescrever tudo duas vezes.

Stack 100% gratuita: PostgreSQL, Drizzle, LiveKit server + `livekit-client` + `livekit-server-sdk`, coturn embutido no LiveKit (TURN), Docker, vitest.

## O problema de conflito hoje

Quatro arquivos concentram tudo e seriam editados pelos dois o tempo todo:
`src/shared/types.ts`, `server/index.ts` (todos os handlers), `src/renderer/src/lib/client.ts` (todas as ações e listeners) e `src/renderer/src/store.ts`.
A **Fase 0** quebra esses arquivos por domínio. Depois dela, uma feature nova = arquivos novos + 1 linha de registro.

## Fase 0 — Fundação (antes de dividir; ~2 dias)

Feita em sequência e mergeada na `main` antes de qualquer feature.

**F0-A (Dev A) — Modularização, sem mudar comportamento**

- `src/shared/types.ts` → pasta `src/shared/types/` (`account.ts`, `channel.ts`, `message.ts`, `voice.ts`, `index.ts`). Cada domínio exporta seus próprios mapas (`VoiceClientEvents`, `VoiceServerEvents`...) e o `index.ts` compõe `ClientToServerEvents`/`ServerToClientEvents` com `extends`. Os imports `@shared/types` continuam funcionando.
- `server/index.ts` → só bootstrap. Handlers vão para `server/modules/{accounts,channels,messages,voice,presence}.ts`, cada um exportando `register(io, socket, ctx)` e, se tiver, `http(req, res)`. Um `server/context.ts` guarda `users`, `voice` e helpers (`sendJson`, `readJson`).
- `lib/client.ts` → mantém conexão/sessão; ações e listeners vão para `lib/actions/{channels,messages,voice,account}.ts`, cada um com `bind(socket)` chamado no `connect`. `client.ts` reexporta tudo (componentes não mudam).
- `store.ts` → slices por domínio em `src/renderer/src/store/` compostas em `useApp`.
- Acesso a dados: handlers param de tocar `db.*` direto e passam a chamar `server/repo/{accounts,sessions,channels,messages}.ts` (**funções async**), ainda implementadas sobre o JSON. Isso isola a troca para Postgres.

**F0-B (Dev B) — Infra, só arquivos novos**

- `docker-compose.yml` (Postgres 17 + LiveKit em modo dev), `server/.env.example`, `livekit.yaml`.
- `vitest` configurado + script `npm test`.
- Spike do LiveKit num branch descartável (token → conectar → publicar microfone) para validar no Electron.
- Atualizar `concord-dev-workflow` com `docker compose up`.

## Regras de trabalho em paralelo (valem para todas as versões)

1. **Contrato primeiro:** cada task começa com um PR pequeno só com tipos em `src/shared/types/<domínio>.ts`. Os dois revisam, mergeia, e aí cada um implementa seu lado.
2. **Dono por arquivo:** cada task lista os arquivos que possui. Precisa mexer em arquivo do outro → pede ou faz PR separado e mínimo.
3. Arquivos compartilhados (`types/index.ts`, `server/index.ts`, `lib/client.ts`, `store/index.ts`, `App.tsx`) só recebem **linhas de registro**, nunca lógica.
4. **Migrations do Drizzle:** um arquivo de schema por domínio em `server/db/schema/`. Migration é gerada **depois do rebase na main**, logo antes do merge (se o outro mergeou antes, apague a sua e gere de novo). Nunca editar migration já mergeada.
5. `package.json`/`package-lock.json`: em conflito, aceite a `main` e rode `npm install <pacotes>` de novo.
6. Branch por task (`v1/a2-uploads`), PRs pequenos, rebase diário, `npm run typecheck && npm test` antes de mergear.
7. **Toda task traz testes automatizados** e só está pronta quando `npm test` passa por completo. Testes de integração do servidor ficam em `server/tests/<dominio>.test.ts`; os demais ficam ao lado do código (`arquivo.test.ts`). Um arquivo por domínio, para não haver conflito.
8. **Toda task, todo módulo novo e toda alteração vêm com o doc da área** (cria `docs/areas/<area>.md` para área nova ou atualiza o da área no mesmo PR) e com o mapa do `AGENTS.md` em dia. Sem doc, a task **não está pronta** (ver "Definição de pronto" no `AGENTS.md`).

## v1 — Banco, anexos, voz em SFU e compartilhamento de tela

Trilha A = dados e texto. Trilha B = mídia. As duas não compartilham arquivos.

### Trilha A (Dev A)

| Task | O que faz | Arquivos (dono) |
|---|---|---|
| **A1 Postgres** ✅ (branch `v1/a1-postgres`) | Schema Drizzle (`accounts`, `sessions`, `channels`, `messages`), pool `pg`, migrations no boot, reimplementar `server/repo/*` em SQL, script `server/scripts/import-json.ts` para migrar o `db.json` atual. Mensagens guardam `author_id` (join na leitura) em vez de cópia do autor. Histórico paginado por cursor (`message:history` com `before`), sem o teto de 500. | `server/db/**`, `server/repo/**`, `drizzle.config.ts`; remove `server/db.ts` |
| **A2 Uploads (servidor)** ✅ (branch `v1/a2-uploads`) | `POST /uploads` (stream para disco, `Authorization: Bearer <token>`, limite 25 MB, valida tipo por magic bytes), `GET /files/<id>/<nome>` (`nosniff`, `Content-Disposition: attachment` para o que não for imagem), interface `Storage` com implementação em disco (`DATA_DIR/uploads`). Tabela `attachments`; `message:send` aceita `attachmentIds` e valida dono/uso único. `Message.attachments: Attachment[]`. | `server/modules/uploads.ts`, `server/storage/**`, `server/db/schema/attachments.ts`, `shared/types/attachment.ts` |
| **A3 Anexos (UI)** ✅ (branch `v1/a3-anexos-ui`) | Botão de clipe, colar (Ctrl+V) e arrastar-soltar no composer; prévia e barra de progresso; imagem inline com lightbox; card de download para arquivos. Reusar `lib/image.ts` para redimensionar miniaturas. | `lib/actions/uploads.ts`, `components/chat/{Composer,AttachmentPreview,MessageAttachments,ImageLightbox}.tsx`, `ChatView.tsx` |

### Trilha B (Dev B)

| Task | O que faz | Arquivos (dono) |
|---|---|---|
| **B1 LiveKit (servidor)** ✅ (branch `v1/b1-livekit`) | `voice:join` continua validando o canal e mantendo `VoiceState`, mas o ack passa a devolver `{ url, token }` (JWT do `livekit-server-sdk`, sala = id do canal, identidade = `User.id`). Remove `voice:signal`/`voice:peer-left` e `peers`. | `server/modules/voice.ts`, `shared/types/voice.ts` |
| **B2 Voz no cliente** ✅ (branch `v1/b1-livekit`, junto com a B1) | Reescrever `VoiceClient` sobre `livekit-client` mantendo a mesma API pública (`join`, `leave`, `setMuted`, `setDeafened`, `teardown`) para `client.ts` e a UI não mudarem. `speaking` vem de `ActiveSpeakersChanged` (some o `AnalyserNode`). Mantém o modo "só ouvir" sem microfone. | `lib/voice.ts`, `lib/actions/voice.ts`, `store/voice.ts` |
| **B3 Compartilhar tela** ✅ (branch `v1/b3-screen-share`) | Main: `session.setDisplayMediaRequestHandler` + `desktopCapturer.getSources`, IPC `screen-sources` para o seletor. Renderer: diálogo de escolha de tela/janela (com miniaturas), publicar faixa de tela (com áudio do sistema quando disponível), grade no `VoiceView` com tile de tela em destaque, indicador "ao vivo" na sidebar. Campo `sharing` em `VoiceState`. | `src/main/screen-share.ts`, `src/preload/*`, `components/voice/{ScreenPicker,ScreenTile,VoiceGrid}.tsx`, `VoiceView.tsx` |
| **B4 Dispositivos** ✅ (branch `v1/b4-dispositivos`) | Escolha de microfone/saída; botão direito numa pessoa (sala de voz e barra lateral) com volume, silenciar só para mim e ver perfil. | `components/voice/{DeviceSettings,MemberContextMenu}.tsx`, `components/UserProfileDialog.tsx`, `lib/actions/devices.ts`, `store/devices.ts` |

**Único ponto de contato na v1:** `voice.ts` do servidor usa `repo/channels` (A1). Como o repo já é async desde a F0, B não é afetado pela troca.

**Pronto quando:** dois apps trocam imagem e arquivo num canal, reiniciar o servidor não perde nada, e três clientes numa sala de voz se ouvem e veem a tela de um deles.

## v2 — Cargos e permissões de canal

Contrato em conjunto (`shared/types/permissions.ts`): `Role { id, name, color, position, permissions }`, permissões globais (`manageChannels`, `manageRoles`, `manageMembers`) e por canal (`view`, `send`, `attach`, `connect`, `speak`, `share`), `ChannelOverride { channelId, roleId, allow, deny }`. Primeira conta criada vira dona; cargo `@todos` implícito.

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A4 Motor de permissões** ✅ servidor (branch `v2/a4-permissoes`; token LiveKit com `speak`/`share` incluído) | A | Tabelas `roles`, `member_roles`, `channel_overrides`. Função pura `can(accountId, channelId, perm)` com testes vitest. Aplicar em **todos** os handlers; `hello` devolve só canais visíveis; trocar `io.emit` por salas Socket.IO por canal (mensagem só chega em quem pode ver); `/files/*` passa a exigir token assinado de curta duração; token LiveKit sai com grants conforme `connect/speak/share`. Eventos `role:*`, `member:roles`, `channel:overrides`. | `server/modules/permissions.ts`, `server/permissions/**`, `server/db/schema/roles.ts` |
| **B5 UI de administração** ✅ (branch `v2/b5-administracao`) | B | Diálogo "Configurações da comunidade" (CRUD de cargos, ordenar, atribuir a membros), aba "Permissões" no diálogo do canal, cargos e cores no `MemberList`, esconder ações que a pessoa não pode fazer, canal privado com cadeado. Item **"Cargos"** no menu de botão direito (`MemberContextMenu`), só para quem pode gerenciar membros. | `components/settings/**`, `lib/actions/permissions.ts`, `store/permissions.ts` |
| **A5 Endurecimento do banco** ✅ (branch `v2/a5-endurecimento`) | A | Backup automático (`pg_dump` diário com rotação, serviço no compose), rate limit por conta em mensagens/uploads/login, índices, expiração de sessões, usuário do Postgres com privilégio mínimo. | `server/scripts/backup.*`, `server/middleware/rate-limit.ts` |
| **B6 Moderação** ✅ (branch `v2/b6-moderacao`; silêncio pelo servidor = tirar o microfone no LiveKit, mais forte que `mutePublishedTrack`) | B | Expulsar da voz, silenciar pelo servidor (LiveKit `mutePublishedTrack`), apagar mensagem alheia com permissão. | `server/modules/moderation.ts`, `components/voice/ModerationMenu.tsx` |

B5 desenvolve contra o contrato com dados mockados em `store/permissions.ts` enquanto A4 não mergeia.

## v3 — Amizades e conversas privadas (texto, arquivos, voz, tela)

Decisão de modelagem que evita duplicar código: **DM é um canal** de tipo `'dm'` com tabela `channel_members`. Mensagens, anexos, histórico, "digitando" e salas LiveKit funcionam sem alteração; a permissão vira "é membro".

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A6 Amizades** ✅ servidor + contrato (branch `v3/a6-amizades`; a tela entra no casco da B7) | A | Tabela `friendships` (pendente/aceita/bloqueada). Eventos `friend:request` (por `nome#tag`), `accept`, `decline`, `remove`, `block`. Presença por conta (online/offline) visível só para amigos. Tela "Amigos" (Online, Todos, Pendentes, Adicionar). | `server/modules/friends.ts`, `server/db/schema/friends.ts`, `components/friends/**`, `lib/actions/friends.ts`, `store/friends.ts` |
| **A7 DMs de texto** ✅ servidor + contrato (branch `v3/a7-dms`; a lista entra no casco da B7) | A | `dm:open(accountId)` cria/recupera o canal `dm`; só amigos (ou quem já tem conversa); lista de DMs na sidebar da Home com não lidos; reusa `ChatView`/anexos. | `server/modules/dms.ts`, `components/dm/DmList.tsx` |
| **B7 Navegação Home + barra de úteis** ✅ (branch `v3/b7-navegacao`; seção em `store/navigation.ts` em vez de `view.kind`, para não perder o canal aberto) | B | A barra da esquerda (onde no Discord ficam os servidores) deixa de ser decorativa e vira a **barra de úteis**: no topo, Home (Amigos + DMs) e Comunidade (canais); abaixo de um separador, a área das ferramentas da v4 (vazia por enquanto, lida de um registro `components/tools/registry.ts`). `view` ganha `kind: 'friends' \| 'dm' \| 'tool'`. Entrega o "casco" com slots onde A6/A7 encaixam seus componentes. Item **"Mensagem"** no menu de botão direito (`MemberContextMenu`), que abre a DM com a pessoa (usa o `dm:open` da A7). **Mergear primeiro.** | `components/ServerRail.tsx` (vira `components/rail/**`), `components/home/HomeLayout.tsx`, `store/view.ts`, `App.tsx` |
| **B8 Chamadas privadas** ✅ (branch `v3/b8-chamadas`; voz da DM no servidor: `v3/voz-dm`) | B | `call:invite/accept/decline/cancel/end` com toque e timeout; sala LiveKit = id do canal `dm`; UI de chamada recebida (toast persistente com som), barra de chamada no topo do DM, tela compartilhada reutilizando os componentes da v1. | `server/modules/calls.ts`, `components/call/**`, `lib/actions/calls.ts`, `store/calls.ts` |
| **B9 Notificações** ✅ (transferida para o Dev A; branch `v3/b9-notificacoes`) | A | Notificação nativa do Electron e badge no ícone para DM/chamada/pedido de amizade. | `src/main/notifications.ts`, `lib/notifications.ts` |

Ordem: contrato → B7 → (A6, A7) em paralelo com (B8, B9).

## v4 — Ferramentas do grupo (na barra de úteis)

As ferramentas moram na **barra da esquerda**, onde no Discord ficariam os servidores (casco entregue na B7): cada ferramenta é um ícone com tooltip; clicar abre o painel dela na área central (`view: { kind: 'tool', toolId }`), mantendo o canal ou a sala de voz atual como contexto (ex.: o sorteador já vem com quem está na sala). O resultado é postado num canal de texto escolhido no painel.

Infra comum (contrato em conjunto): mensagem ganha `kind` (`'text' | 'tool'`) e `payload` tipado; registro de ferramentas (`components/tools/registry.ts`: cada ferramenta = id, ícone, nome, 1 painel + 1 cartão de resultado no chat). Um atalho opcional no `+` do composer abre o mesmo painel. O sorteio roda **no servidor** (`crypto.randomInt`) e o resultado é postado no canal, para todos verem o mesmo resultado e ninguém poder "rolar de novo escondido".

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A8 Sorteador de times (servidor)** ✅ servidor + contrato (branch `v4/a8-sorteador`; `players: [{ name, lanes? }]` no lugar de `names[]`) | A | `tools:teams { channelId, names[], teamCount, lanes? }`: valida (2–50 nomes, até 32 caracteres), embaralha (Fisher–Yates), distribui equilibrado; com `lanes` ligado e times de 5, atribui Top/Selva/Meio/Atirador/Suporte sem repetir; aceita preferências de lane opcionais por pessoa. Função pura com testes. Posta mensagem `kind: 'tool'`. | `server/modules/tools.ts`, `server/tools/teams.ts`, `shared/types/tools.ts` |
| **B10 Sorteador (UI)** ✅ (transferida para o Dev A, junto com os painéis e cartões de dado, moeda, sortear 1 e enquete e o "Mover para as salas"; branch `v4/b10-ferramentas-ui`) | A | Ícone na barra de úteis + painel: importar nomes de quem está na sala de voz / online / digitar manualmente, nº de times, toggle de lanes, canal onde postar, "Sortear de novo". Card de resultado no chat com times coloridos e lanes. | `components/tools/{TeamRandomizerPanel,TeamResultCard,registry}.tsx` |
| **Próximas ferramentas** (servidor ✅ dado/moeda e sorteio de 1 nome — branch `v4/ferramentas-simples`; enquete ✅ — branch `v4/enquete`; mover times ✅ servidor + ação do app — branch `v4/mover-times`; painéis e cartões de todas ✅ na B10) | alternado | Mesmo molde, uma por pessoa, cada uma vira mais um ícone na barra: enquete, dado/moeda, sorteio de 1 nome, "mover times para salas de voz" (usa o resultado do sorteador + permissão de moderação da v2). | 1 arquivo de servidor + 2 de UI cada |

## v5 — Temas personalizáveis

Temas no estilo dos temas premium do Discord (fundos em gradiente e cor de destaque), mas **grátis e editáveis**. Base pronta: as cores já são tokens CSS em `assets/globals.css`, então um tema é só um conjunto de valores para esses tokens. **Independente das outras versões**: pode ser puxado antes se sobrar tempo (só depende da F0).

Contrato em conjunto (`shared/types/theme.ts`): `ThemeConfig { base: 'escuro' | 'claro', accent: '#rrggbb', background: { stops: '#rrggbb'[] (1 a 4), angle: 0–360 }, intensity: 0–100 }` + `validateTheme()` (função pura, usada pelos dois lados). Os demais tokens (sidebar, rail, panel, composer, texto) são **derivados** do `ThemeConfig` garantindo contraste legível (WCAG AA para texto).

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A9 Preferências da conta (servidor)** ✅ (branch `v5/a9-temas`, com a proposta de contrato) | A | Tabela `account_preferences` (tema ativo + até 10 temas salvos, jsonb validado com `validateTheme`). Eventos `preferences:get` / `preferences:update` com limite de requisições; o tema acompanha a conta em qualquer computador e muda ao vivo nas outras janelas da mesma conta (`preferences:updated`). | `server/modules/preferences.ts`, `server/db/schema/preferences.ts`, `server/repo/preferences.ts`, `shared/types/preferences.ts` |
| **B11 Motor de temas (UI)** ✅ (transferida para o Dev A; branch `v5/b11-motor-temas`) | A | `deriveTokens(theme)` (pura, com testes de contraste) aplicando as variáveis CSS no `:root`, com transição suave. ~10 temas prontos com gradientes próprios (ex.: Aurora, Pôr do sol, Oceano, Floresta, Neon, Grafite, Claro). Funciona antes do login com o último tema salvo localmente. | `lib/theme/**`, `assets/themes/**` |
| **B12 Editor de temas (UI)** ✅ (transferida para o Dev A; branch `v5/b12-editor-temas`) | A | Em "Configurações → Aparência": galeria dos prontos, editor (cor de destaque, 1 a 4 cores do gradiente, ângulo, intensidade, claro/escuro) com prévia ao vivo, salvar/duplicar/apagar temas próprios e **compartilhar por código** (copiar/colar um texto curto) entre amigos. | `components/settings/appearance/**` |

Ordem: contrato → A9 → B11 → B12. **A v5 inteira ficou com o Dev A** (B11 e B12 transferidas do Dev B); o Dev B não mexe em `lib/theme/**` nem em `components/settings/appearance/**`.

## Extras de voz e comunidade (independentes)

Ideias sem versão fixa, para puxar quando sobrar tempo, em paralelo com qualquer versão. Cada uma diz do que
depende: B1, B2, B3, B4 e A2 já estão na `main`.

| Ideia | Tasks | Depende de | Tamanho |
|---|---|---|---|
| Supressão de ruído automática ✅ | B13 | B4 (na `main`) | médio (spike + modo automático) |
| Sons de entrar/sair ✅ | B16 | B4 (na `main`) | pequeno |
| Efeitos sonoros (soundboard) ✅ | A10 + B17 | A2 (na `main`); permissão opcional da v2 | médio |
| Overlay em jogos ✅ | B15 | B2 (na `main`) | médio |
| Bot de música ✅ (branch `feat/sons-login-musica`; fonte: Spotify → YouTube, ADR 0006) | A11 + B14 | B1 (na `main`); decisão tomada: só links do Spotify por enquanto | grande |

### B13 Supressão de ruído automática

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **B13 Supressão de ruído automática** ✅ (branch `extras/b13-supressao-ruido`; motor: RNNoise) | B | Tirar teclado, ventilador, cachorro latindo etc. do microfone **antes de enviar**, **sem a pessoa precisar escolher nada**: vem ligada e o próprio app decide o filtro conforme o ruído do ambiente e a capacidade do PC. Roda no **app de quem fala** (processador na faixa do microfone, `LocalAudioTrack.setProcessor()` do `livekit-client`), então todo mundo ouve limpo sem mudar nada no servidor. | `lib/noise/**`, `lib/voice.ts` (só o `setProcessor`), `lib/actions/devices.ts`, `components/voice/DeviceSettings.tsx` |

**Como o modo automático decide** (tudo no app, a cada entrada na sala e durante a conversa):

1. **Filtro forte por padrão:** ao entrar na sala, o microfone já sai pelo filtro avançado (o vencedor do spike) e a
   supressão nativa do WebRTC é desligada para não processar duas vezes (som "abafado").
2. **Liga o pesado só quando precisa** (economiza CPU e bateria): mede o **ruído de fundo** nos momentos em que a pessoa
   não está falando (nível do microfone fora da fala). Ambiente silencioso → fica no filtro nativo, que é leve; ruído
   persistente (teclado, ventilador, rua) → ativa o filtro avançado. Com folga (histerese de alguns segundos) para não
   ficar trocando a cada barulho.
3. **Se adapta ao PC:** se o filtro avançado pesar demais (o processamento de áudio atrasando, quadros perdidos no
   AudioWorklet) ou não carregar (WASM bloqueado, PC sem suporte), **cai sozinho** para o filtro nativo e tenta de novo
   só na próxima entrada. Sem mensagem de erro para a pessoa; no máximo um log `[ruído]`.
4. **Sem configuração para escolher:** em Configurações de voz aparece só um texto informativo ("Supressão de ruído:
   automática") com o estado atual (por exemplo, "filtro avançado ativo"). Existe **um único interruptor** para
   desligar tudo, pensado para quem toca instrumento ou quer o áudio cru; ele vem ligado e fica salvo em `concord:audio`.

**Opções avaliadas para o filtro avançado** (todas gratuitas; escolher no spike):

| Opção | Licença | Prós | Contras |
|---|---|---|---|
| **Supressão nativa do WebRTC** (`noiseSuppression: true`) | — | Já está ligada hoje; custo zero. É o filtro **leve** do modo automático e a reserva quando o avançado não roda. | Remove só ruído constante (chiado, ventilador); teclado e vozes ao fundo passam. |
| **RNNoise** via `@sapphi-red/web-noise-suppressor` (também traz Speex) | MIT | Leve (WASM + AudioWorklet), roda bem em qualquer PC; bom contra teclado e ruído de fundo. Forte candidato a filtro avançado. | Qualidade abaixo do Krisp; precisa embrulhar como `TrackProcessor`. |
| **DeepFilterNet3** via `deepfilternet3-noise-filter` | MIT / Apache-2.0 | Melhor qualidade entre as abertas; já vem como processador do `livekit-client`. | Mais pesado (CPU e tamanho do modelo); medir em PC fraco. Se ficar, o passo 3 (cair sozinho) é essencial. |
| **RNNoise** via `@shiguredo/noise-suppression` | Apache-2.0 | Alternativa à de cima. | Última versão em 2025. |
| **Krisp** (`@livekit/krisp-noise-filter`) | Termos da LiveKit | Qualidade comercial. | Pelo que consta, só funciona com o **LiveKit Cloud**, não com o nosso servidor self-hosted. **Confirmar** antes de descartar; se for o caso, fica fora (fere "stack 100% gratuita e self-hosted"). |

**Plano sugerido:**
1. **Spike** (branch descartável): RNNoise e DeepFilterNet3 como processador no `livekit-client`; medir CPU (Gerenciador de
   Tarefas), atraso percebido e qualidade com teclado, ventilador e música ao fundo, em duas janelas. Medir também como
   detectar "pesado demais" de forma confiável (atraso do AudioWorklet).
2. Implementar o modo automático (passos 1 a 4 acima) com o vencedor do spike.
3. Os arquivos WASM/modelo vão empacotados no app (sem baixar de CDN em tempo de execução; a CSP não libera).

**Feito:** motor **RNNoise** (leve, MIT); a troca por GTCRN/DeepFilterNet3 continua possível depois do teste de
qualidade (`NoiseEngineLoader`). O "se adapta ao PC" ficou por núcleos (≥ 3) e por erro no AudioWorklet; medir o
atraso real do processamento fica como melhoria. CSP ganhou `'wasm-unsafe-eval'`.

**Pronto quando:** sem mexer em nada, quem ouve não escuta teclado nem ventilador de quem fala; em ambiente silencioso o
filtro avançado não fica ligado à toa; num PC que não aguenta (simulado nos testes) o app cai para o filtro nativo sem
quebrar a voz nem mostrar erro; o interruptor de desligar volta como estava depois de reiniciar. Testes: decisão do
modo automático a partir de níveis de ruído simulados (com histerese), queda para o nativo quando o processador falha ou
atrasa (processador falso no `VoiceClient`), interruptor salvo e texto de estado no diálogo (jsdom). Skill: seção em
`concord-voice`.

### B16 Sons de entrada e saída na sala

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **B16 Sons de entrar/sair** ✅ (branch `extras/b16-sons-entrada-saida`) | B | Um som curto quando alguém **entra** na sala de voz em que estou e outro quando alguém **sai** (inclusive eu mesmo entrando/saindo, como no Discord). Só cliente: compara o `voice:state` anterior com o novo na minha sala. Toca pela saída escolhida na B4, respeita o deafen e tem interruptor + volume + "Testar" em Configurações de voz (salvo em `concord:audio`). Não toca na carga inicial (`hello`) nem em rajada (várias mudanças juntas = um som de cada tipo). Os sons são **gerados na hora pela Web Audio** (sem arquivos de áudio: nada para baixar nem licença para conferir). | `lib/sounds/**`, `lib/actions/voice-sounds.ts`, `lib/actions/devices.ts`, `components/voice/DeviceSettings.tsx` |

Pequena e sem dependências: boa para puxar logo. **Testes:** detecção de entrada/saída a partir de dois `voice:state`, sem som no `hello`, rajada agrupada, deafen e interruptor desligado silenciam (áudio falso).

### Efeitos sonoros do servidor (soundboard)

Cada pessoa pode enviar **áudios de até 5 segundos** para a coleção da comunidade; quem está numa sala de voz toca um
deles e **todos na sala ouvem do começo ao fim** (sem cortar no meio, sem tocar dois por cima do mesmo autor).

**Contrato em conjunto** (`shared/types/sounds.ts`): `Sound { id, name, emoji?, durationMs, uploaderId, url }`,
`sound:list`, `sound:created`/`sound:deleted`, `sound:play { channelId, soundId }` → servidor emite
`sound:played { channelId, soundId, by }` só para quem está naquela sala. Envio do arquivo por HTTP, como os anexos.

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A10 Sons (servidor)** ✅ (branch `v2/a10-sons`) | A | `POST /sounds` (multipart igual a `/uploads`: token, limite de **512 KB**, MP3/OGG/WAV/WebM conferidos pelos bytes) e **duração ≤ 5 s** lida do próprio arquivo com `music-metadata` (MIT), recusando o que passar. Tabela `sounds`, bytes no `FileStorage` (reusa a A2), nome até 32, limite de sons por conta e no total. `sound:play` valida que a pessoa está na sala, aplica limite de requisições (ex.: 1 a cada 3 s por pessoa) e repassa só para a sala. Apagar: o autor ou quem tiver permissão (v2). | `server/modules/sounds.ts`, `server/repo/sounds.ts`, `server/db/schema/sounds.ts`, `shared/types/sounds.ts` |
| **B17 Sons (UI)** ✅ (transferida para o Dev A; branch `v2/b17-sons-ui`) | A | Botão "Efeitos sonoros" na sala de voz abrindo a grade de sons (nome + emoji, clique toca, botão direito apaga se puder). Enviar: escolher arquivo, prévia, cortar para 5 s antes de enviar (opcional), nome e emoji. Ao receber `sound:played`, cada app toca o som localmente pela saída escolhida, respeitando deafen e o volume da pessoa que tocou (B4); o mesmo autor não toca dois ao mesmo tempo (o novo espera ou substitui, decidir no contrato). Indicador de quem tocou. | `components/voice/Soundboard*.tsx`, `lib/actions/sounds.ts`, `store/sounds.ts` |

Tocar **localmente em cada app** (em vez de mixar no microfone de quem tocou) é mais simples, sai igual para todo
mundo e respeita o volume/deafen de cada um. Na v2, uma permissão de canal `soundboard` pode limitar quem toca.

### Sobreposição em jogos (overlay)

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **B15 Overlay** ✅ (transferida para o Dev A; branch `v3/b15-overlay`) | A | Janela extra do Electron **transparente, sem borda, sempre no topo** (`alwaysOnTop: 'screen-saver'`, `setIgnoreMouseEvents(true)` para o clique passar para o jogo, `focusable: false`) mostrando os membros da minha sala de voz com avatar, nome, mute/deafen e **quem está falando** (mesmo `speaking` da store, enviado do renderer principal por IPC). Liga/desliga em Configurações de voz e por atalho global (`globalShortcut`, ex.: Shift+`); posição (cantos) e tamanho configuráveis; some quando não estou em sala. | `src/main/overlay.ts`, `src/preload/*`, `src/renderer/overlay/**` (página própria no electron-vite), `lib/actions/overlay.ts` |

**Limite importante:** funciona por cima de jogos em **modo janela** e **tela cheia sem bordas (borderless)**, que é o
padrão da maioria dos jogos hoje. Em **tela cheia exclusiva** (DirectX/Vulkan com o monitor só para o jogo) uma
janela comum não aparece por cima: o Discord resolve injetando código no processo do jogo, o que é complexo, frágil e
pode ser bloqueado por **anti-cheat**. Fica fora; a tela de configuração deve explicar isso ("use tela cheia sem bordas").

### Bot de música (YouTube/Spotify por URL)

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A11 Bot de música (servidor)** ✅ (branch `feat/sons-login-musica`; metadados pela Web API do Spotify com Client Credentials, não oEmbed; yt-dlp chamado direto, sem `youtube-dl-exec`; `docs/areas/music.md`) | A | Um participante "Música" que o **servidor** coloca na sala do LiveKit com `@livekit/rtc-node` (Apache-2.0), publicando uma faixa de áudio. Fila por sala: `music:play { channelId, url }`, `music:skip`, `music:stop`, `music:queue`; estado em `music:state` para a sala. Áudio obtido com **yt-dlp** (`youtube-dl-exec`, MIT) + **ffmpeg** (decodifica para PCM e envia em quadros). Link do **Spotify** não tem áudio disponível pela API: o bot lê título/artista da página/oEmbed e procura a música no YouTube. Validação de URL (só domínios permitidos), duração máxima, limite de fila e de requisições; sai sozinho quando a sala esvazia. | `server/modules/music.ts`, `server/music/**`, `shared/types/music.ts` |
| **B14 Bot de música (UI)** ✅ (branch `feat/sons-login-musica`) | B | Comandos no chat (`/play <link ou texto>`, `/skip`, `/stop`, `/queue`) e um cartão "Tocando agora" na sala de voz (entre os membros e as ações) com capa, título, quem pediu, botões, volume do bot, ocultar e a fila paginada; o bot aparece na lista da sala com o selo "BOT" e tem o volume do botão direito (B4) como qualquer pessoa. | `components/voice/MusicPlayer.tsx`, `lib/actions/music.ts`, `store/music.ts`, comandos no `Composer` |

**Decidir antes de começar (riscos):**
- **Termos de uso:** baixar/retransmitir áudio do YouTube viola os termos do YouTube, e o Spotify não permite
  retransmitir áudio fora dos apps dele. Para um grupo de amigos num servidor próprio o risco prático é baixo, mas é um
  risco real (bloqueio de IP, quebra quando o YouTube muda algo e o yt-dlp precisa atualizar). Alternativas mais limpas:
  só arquivos enviados pelo grupo, rádios/streams com licença, ou SoundCloud/Bandcamp onde o autor permite.
- **Licença:** evitar bibliotecas GPL no servidor se o projeto não quiser virar GPL (ex.: `play-dl` é GPL-3.0); `yt-dlp`
  (Unlicense) chamado como programa externo e `ffmpeg` em build LGPL não contaminam o código.
- **Hospedagem:** yt-dlp e ffmpeg precisam estar instalados no servidor (entram no `docker-compose`/imagem do servidor).

Como sempre: cada task vem com testes e com a skill da área (`concord-voice` para B13–B17; skills novas
`concord-sounds` para A10/B17, `concord-overlay` para B15 e `concord-music` para A11/B14).

## v6 — Qualidade, chat completo e voz para jogar

Com a v1–v5 e os extras na `main` (o bot de música saiu depois, na branch `feat/sons-login-musica`), o
próximo passo junta três frentes: **proteger a `main`** (CI) e levar o app para fora da rede local, **completar o
chat** (o que todo mundo espera de um chat e ainda falta) e **melhorar a voz para quem joga**.

**Divisão sugerida** (combinar antes de começar, como nas transferências da v5/B10/B17): cada task segue as regras
de sempre (contrato primeiro, dono por arquivo, testes e skill no mesmo PR).

### Infra e distribuição

| Task | Dev | O que faz | Arquivos (dono) | Tamanho |
|---|---|---|---|---|
| **A12 CI no GitHub** ✅ (branch `v6/a12-ci`) | A | GitHub Actions em todo PR e push na `main`: `npm ci`, `npm run typecheck` e `npm test` (PGlite, sem Docker), com cache do npm. Badge no README e PR vermelho não mergeia (proteção de branch, se o dono do repositório ligar). | `.github/workflows/ci.yml` | pequeno |
| **A13 Atualização automática** ✅ (branch `v6/a13-atualizacao`) | A | `electron-updater` lendo os GitHub Releases: o app confere ao abrir, baixa em segundo plano e oferece "Reiniciar para atualizar". Workflow que gera o instalador e publica a release a partir de uma tag. | `src/main/updater.ts`, `electron-builder.yml`, `.github/workflows/release.yml` | médio |
| **A14 Hospedagem pela internet** ✅ (branch `v6/a14-hospedagem`) | A | Imagem Docker do servidor e um `docker-compose.prod.yml` (servidor + Postgres + LiveKit com TURN embutido e TLS), proxy com HTTPS (Caddy), variáveis de produção e um guia passo a passo numa VPS barata. Sem isso a voz só funciona na rede local. | `Dockerfile`, `docker-compose.prod.yml`, `deploy/**`, skill `concord-deploy` | médio |

### Chat completo

| Task | Dev | O que faz | Arquivos (dono) | Tamanho |
|---|---|---|---|---|
| **A15 Editar mensagem** ✅ (branch `v6/a15-b18-editar-responder`) | A | `message:edit { messageId, content }` só do autor (mesmas validações do envio, até `MESSAGE_MAX_LENGTH`), coluna `edited_at`, `message:edited` por `emitToViewers`. Na tela: "Editar" no menu da mensagem, edição no lugar (Enter salva, Esc cancela), "(editada)" ao lado da hora. Mensagem de ferramenta não edita. | `server/modules/messages.ts` (handler novo), `server/repo/messages.ts`, `shared/types/message.ts`, `components/chat/MessageActions.tsx` | médio |
| **A16 Reações** ✅ (branch `v6/a16-reacoes`) | A | Tabela `message_reactions` (mensagem, conta, emoji), `message:react { messageId, emoji, on }` com limite de requisições, contagens na mensagem e `message:reactions` para quem vê o canal. Na tela: botão de reação (reusa o `EmojiPicker` do soundboard), chips com contagem e quem reagiu no tooltip; clicar no chip liga/desliga a minha. | `server/modules/reactions.ts`, `server/repo/reactions.ts`, `server/db/schema/reactions.ts`, `shared/types/reactions.ts`, `components/chat/Reactions.tsx` | médio |
| **B18 Responder citando** ✅ (feita pelo Dev A junto com a A15; branch `v6/a15-b18-editar-responder`) | A | `message:send` aceita `replyToId` (mesmo canal, mensagem que eu vejo); a mensagem guarda e devolve um resumo da original (autor + começo do texto, ou "mensagem apagada"). Na tela: "Responder" no menu, faixa "Respondendo a Fulano" no composer, citação clicável que rola até a original. | `shared/types/message.ts` (`replyTo`), `server/repo/messages.ts`, `components/chat/ReplyPreview.tsx`, `Composer.tsx` | médio |
| **B19 Menções @nome** ✅ (feita pelo Dev A; branch `v6/b19-mencoes`) | A | Autocompletar `@` no composer (membros que veem o canal), menção guardada pelo id da conta (`<@accountId>`) e desenhada como `@Nome`; a mensagem fica destacada para quem foi mencionado e **notifica mesmo em canal da comunidade** (B9). `@todos` só para quem tem uma permissão nova `mentionEveryone`. | `shared/types/message.ts` (`mentions`), `components/chat/MentionMenu.tsx`, `lib/notifications.ts` (regra nova) | médio |

Ordem: A15 e B18 mexem em `shared/types/message.ts` e `server/repo/messages.ts` — contrato das duas num PR só
antes de começar. A16 é independente. B19 depende do contrato de A15/B18 (para não conflitar no composer).

### Voz para jogar

| Task | Dev | O que faz | Arquivos (dono) | Tamanho |
|---|---|---|---|---|
| **B20 Push-to-talk** ✅ (branch `v6/b20-push-to-talk`; tecla solta detectada com `uiohook-napi`) | B | Modo "pressione para falar" nas Configurações de voz: o microfone só abre enquanto a tecla escolhida está pressionada, **mesmo com o jogo na frente** (atalho global no main, como o do overlay da B15; o Electron não avisa quando a tecla é solta, então usa `uiohook-napi` ou fecha sozinho depois de um tempo sem repetir). Som curto ao abrir/fechar (opcional) e indicador na sala. | `src/main/push-to-talk.ts`, `src/preload/*`, `lib/actions/devices.ts`, `DeviceSettings.tsx` | médio |
| **B21 Câmera na sala de voz** ✅ (feita pelo Dev A; branch `v6/b21-camera`) | B | Botão de câmera na sala (permissão de canal nova `video`, v2), escolha da câmera nas Configurações de voz, faixa de vídeo pelo LiveKit e a grade da sala mostrando os vídeos (a tela compartilhada continua em destaque). Limite de qualidade para não pesar no upload. | `lib/voice.ts`, `components/voice/{VoiceGrid,CameraTile}.tsx`, `shared/types/permissions.ts`, `server/livekit.ts` (grant) | grande |

### Pendências das versões anteriores

Itens pequenos que ficaram anotados nas skills (cada um com a skill da área atualizada no mesmo PR):

| Item | Dev | Origem | Skill |
|---|---|---|---|
| Interruptor para desligar as notificações no app e som por tipo ✅ (branch `feat/pendencias-v6`) | A | B9 | `concord-notifications` |
| Cortar o áudio para 5 s antes de enviar (em vez de recusar) ✅ (branch `feat/pendencias-v6`; o app deixa escolher o trecho e corta para WAV mono 44,1 kHz; servidor inalterado) | A | B17 | `concord-sounds` |
| Soundboard nas chamadas privadas (botão no painel da chamada) ✅ (feita pelo Dev B; branch `v6/soundboard-chamadas`) | A | B17 | `concord-sounds` |
| Várias lanes preferidas por pessoa no sorteador (o contrato já aceita a lista) ✅ (branch `feat/pendencias-v6`; painel com 1ª, 2ª... por pessoa) | A | B10 | `concord-tools` |
| Atalho no `+` do composer abrindo o painel das ferramentas ✅ (branch `feat/pendencias-v6`; navega para o `ToolView` com `toolChannelId` = chat atual; não aparece no chat da sala de voz) | A | v4 | `concord-tools` |
| Overlay: escolher outro atalho, arrastar a posição e acompanhar a troca de tema ao vivo ✅ (branch `feat/pendencias-v6`; também redimensionar a largura arrastando) | A | B15 | `concord-overlay` |
| Silêncio pelo servidor guardado no banco ✅ (branch `v6/silencio-no-banco`; tabela `server_mutes`) | B | B6 | `concord-moderation` |

## v7 — Bot de música na barra de úteis, borda de quem fala e botões na miniatura

Com o bot de música na `main` (PR #99), três melhorias pedidas pelo grupo. Decisões já tomadas: playlists salvas são
**da comunidade** (uma lista para o servidor todo, modelo dos efeitos sonoros) e a sensibilidade da borda é **medida
no app** (se eu ouço a pessoa, a borda acende). Cada task segue as regras de sempre (contrato primeiro, testes antes,
doc da área no mesmo PR).

| Task | Dev | O que faz | Arquivos (dono) | Tamanho |
|---|---|---|---|---|
| **A17 Pausar para todos e playlists da comunidade (servidor)** | A | `MusicState.paused` e `music:pause`/`music:resume` (mesmo formato de `music:skip`, só quem está na sala): o player para de mandar quadros e o yt-dlp/ffmpeg ficam parados pelo pipe, sem morrer; pausa vale para a sala inteira e sobrevive ao `skip`. Bot responde "Pausou"/"Retomou" no chat quando o comando vem de lá. Playlists: tabela `saved_playlists` (nome único, link do Spotify ou YouTube, quem salvou), `playlist:list/create/delete` e avisos `playlist:created/deleted` para todos; criar = qualquer conta (com limite), apagar = autor ou `manageMessages`. Tocar uma salva é `music:play` com o link. | `server/music/player.ts`, `server/modules/music.ts`, `server/modules/playlists.ts`, `server/repo/playlists.ts`, `server/db/schema/music.ts`, `shared/types/music.ts` | médio |
| **B22 Bot de música na barra de úteis (tela)** | B | Ícone "Música" no registro de ferramentas (`components/tools/registry.ts`) abrindo um painel com o mesmo `MusicPlayer` da sala (da sala em que estou), campo para tocar link ou nome e a lista "Playlists da comunidade" (tocar, salvar, apagar). Fora de sala, aviso e botões de tocar desligados. Botão Pausar/Retomar no player (também na sala), estado "Pausado" igual para todos, e comandos `/pause` e `/resume` no registro do chat. | `components/tools/MusicPanel.tsx`, `components/voice/MusicPlayer.tsx`, `lib/actions/{music,playlists}.ts`, `store/playlists.ts`, `lib/commands.ts` | médio |
| **B23 Borda de quem fala: cor do tema e sensibilidade** ✅ (branch `feat/borda-quem-fala`; `backgroundThrottling: false` para o overlay não atrasar) | B | O anel de "está falando" sai do verde fixo (`ring-success`) para a cor de destaque do tema (`ring-primary`, que segue `ThemeConfig.accent`) no avatar, na grade da sala e no overlay. Quem fala passa a ser medido no app: um `AnalyserNode` por voz recebida e outro no meu microfone, com limiar e histerese (pura `nextSpeaking`), no lugar de depender só do `ActiveSpeakersChanged` do LiveKit — voz baixa que todos ouvem acende a borda. | `lib/speaking/`, `lib/voice.ts`, `components/UserAvatar.tsx`, `components/voice/VoiceGrid.tsx`, `overlay/OverlayApp.tsx` | médio |
| **B24 Botões na miniatura da barra de tarefas (Windows)** ✅ (branch `feat/thumbar`; ícones do lucide desenhados em canvas) | B | Como no Discord: em chamada, passar o mouse no ícone do Concord na barra de tarefas mostra 3 botões — silenciar/ativar microfone, desativar/ativar áudio e sair da chamada (`BrowserWindow.setThumbarButtons`). Ícones desenhados no app e enviados como imagem (como o selo das notificações), trocando conforme o estado; fora de chamada os botões somem. Clique chama `toggleMute`/`toggleDeafen`/`leaveVoice`. | `src/shared/thumbar.ts`, `src/main/thumbar.ts`, `src/preload/*`, `lib/actions/thumbar.ts` | pequeno |

Ordem: A17, B23 e B24 são independentes (arquivos diferentes) e podem andar em paralelo. B22 depende do contrato de
A17 (pausa e playlists) — começa depois do merge dela.

**Riscos:** pausa longa pode derrubar a conexão do yt-dlp com o YouTube; medir com 10 min de pausa e, só se falhar,
reabrir a faixa ao retomar. Os limiares da borda (liga perto de -50 dBFS, desliga perto de -56, segura ~300 ms) são
ponto de partida; ajustar medindo com voz baixa real.

## Verificação (em toda task)

- `npm run typecheck` e `npm test` (vitest: `can()`, sorteador, validação de upload, repos contra Postgres de teste).
- `docker compose up -d` + `npm run dev:all`; segunda/terceira instância do app conforme a skill `concord-dev-workflow`.
- v1: enviar imagem e arquivo de 20 MB, rejeitar 30 MB, reiniciar servidor e conferir histórico; 3 clientes em voz + tela; `import-json` preserva contas e mensagens.
- v2: conta sem cargo não vê canal privado, não recebe `message:new` dele (conferir no DevTools → WS) e não obtém token LiveKit.
- v3: pedido de amizade → aceitar → DM com anexo → chamada com tela; bloqueado não consegue abrir DM.
- v4: ferramentas aparecem na barra da esquerda e abrem o painel; mesmo resultado nos dois clientes; times equilibrados com número ímpar; lanes sem repetição.
- v5: trocar o tema numa janela muda na outra janela da mesma conta; tema salvo volta depois de reiniciar o app e em outro computador; código de tema copiado por um amigo aplica igual; nenhum tema pronto ou editado deixa texto ilegível (teste de contraste).
- B13: sem configurar nada, falar teclando e com ventilador ligado e conferir na outra janela que o ruído some; em silêncio, o estado mostra o filtro leve; desligar o interruptor e conferir o áudio cru; reiniciar o app e o interruptor continua como estava.
- B16: terceira janela entra e sai da sala → as outras ouvem os dois sons; com deafen ou interruptor desligado, silêncio; reconectar não toca som.
- A10/B17: enviar áudio de 4 s (aceita) e de 6 s ou 1 MB (recusa); tocar numa sala → só quem está nela ouve, do começo ao fim; quem está em outra sala não recebe `sound:played`.
- B15: jogo em janela e em tela cheia sem bordas mostra o overlay com quem fala; o clique passa para o jogo; o atalho liga/desliga.
- A12: PR com teste quebrado fica vermelho no GitHub; PR verde mostra typecheck e testes passando.
- A13: instalar a versão N, publicar a N+1 e conferir que o app oferece "Reiniciar para atualizar" e volta na versão nova.
- A14: com o servidor numa VPS, dois PCs em redes diferentes conversam por voz e compartilham a tela (TURN).
- A15/A16/B18/B19: editar aparece "(editada)" nas duas janelas; reação liga/desliga e conta igual nas duas; responder rola até a original; mencionar notifica quem foi mencionado com o app em segundo plano, mesmo em canal.
- B20: com um jogo na frente, segurar a tecla abre o microfone (a outra janela ouve) e soltar fecha.
- B21: duas câmeras na mesma sala aparecem na grade das duas janelas; sem a permissão `video` o botão some.
- A11/B14: `/play <link do Spotify/YouTube ou nome da música>` toca para todos na sala; `/skip` e `/stop` funcionam; `/queue` abre a fila paginada; link de Spotify acha a música; sala vazia derruba o bot; URL de domínio não permitido é recusada.
- A17/B22: pausar numa janela mostra "Pausado" na outra e o som para para os dois; retomar continua do mesmo ponto (também depois de 10 min); `/skip` pausado continua pausado; salvar playlist do Spotify e do YouTube aparece para a outra conta e toca pelo botão; apagar só para quem salvou ou modera.
- B23: duas contas na sala, falar baixo e a borda acende na cor do tema; trocar o tema muda a cor (inclusive no overlay); silêncio apaga sem piscar.
- B24: no Windows, em chamada, a miniatura da barra de tarefas mostra os 3 botões; silenciar, desativar áudio e sair funcionam e o ícone troca; fora de chamada os botões somem.
