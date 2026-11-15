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
8. **Toda task, todo módulo novo e toda alteração vêm com a skill correspondente** (cria `.claude/skills/concord-<area>/` para área nova ou atualiza a da área no mesmo PR) e com o mapa do `AGENTS.md` em dia. Sem skill, a task **não está pronta** (ver "Definição de pronto" no `AGENTS.md`).

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
| **B8 Chamadas privadas** (voz da DM no servidor ✅, branch `v3/voz-dm`: `voice:join` aceita `dm`, só membros, bloqueio encerra) | B | `call:invite/accept/decline/cancel/end` com toque e timeout; sala LiveKit = id do canal `dm`; UI de chamada recebida (toast persistente com som), barra de chamada no topo do DM, tela compartilhada reutilizando os componentes da v1. | `server/modules/calls.ts`, `components/call/**`, `lib/actions/calls.ts`, `store/calls.ts` |
| **B9 Notificações** | B | Notificação nativa do Electron e badge no ícone para DM/chamada/pedido de amizade. | `src/main/notifications.ts`, `lib/notifications.ts` |

Ordem: contrato → B7 → (A6, A7) em paralelo com (B8, B9).

## v4 — Ferramentas do grupo (na barra de úteis)

As ferramentas moram na **barra da esquerda**, onde no Discord ficariam os servidores (casco entregue na B7): cada ferramenta é um ícone com tooltip; clicar abre o painel dela na área central (`view: { kind: 'tool', toolId }`), mantendo o canal ou a sala de voz atual como contexto (ex.: o sorteador já vem com quem está na sala). O resultado é postado num canal de texto escolhido no painel.

Infra comum (contrato em conjunto): mensagem ganha `kind` (`'text' | 'tool'`) e `payload` tipado; registro de ferramentas (`components/tools/registry.ts`: cada ferramenta = id, ícone, nome, 1 painel + 1 cartão de resultado no chat). Um atalho opcional no `+` do composer abre o mesmo painel. O sorteio roda **no servidor** (`crypto.randomInt`) e o resultado é postado no canal, para todos verem o mesmo resultado e ninguém poder "rolar de novo escondido".

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A8 Sorteador de times (servidor)** ✅ servidor + contrato (branch `v4/a8-sorteador`; `players: [{ name, lanes? }]` no lugar de `names[]`) | A | `tools:teams { channelId, names[], teamCount, lanes? }`: valida (2–50 nomes, até 32 caracteres), embaralha (Fisher–Yates), distribui equilibrado; com `lanes` ligado e times de 5, atribui Top/Selva/Meio/Atirador/Suporte sem repetir; aceita preferências de lane opcionais por pessoa. Função pura com testes. Posta mensagem `kind: 'tool'`. | `server/modules/tools.ts`, `server/tools/teams.ts`, `shared/types/tools.ts` |
| **B10 Sorteador (UI)** | B | Ícone na barra de úteis + painel: importar nomes de quem está na sala de voz / online / digitar manualmente, nº de times, toggle de lanes, canal onde postar, "Sortear de novo". Card de resultado no chat com times coloridos e lanes. | `components/tools/{TeamRandomizerPanel,TeamResultCard,registry}.tsx` |
| **Próximas ferramentas** (servidor ✅ dado/moeda e sorteio de 1 nome — branch `v4/ferramentas-simples`; enquete ✅ — branch `v4/enquete`; falta mover times) | alternado | Mesmo molde, uma por pessoa, cada uma vira mais um ícone na barra: enquete, dado/moeda, sorteio de 1 nome, "mover times para salas de voz" (usa o resultado do sorteador + permissão de moderação da v2). | 1 arquivo de servidor + 2 de UI cada |

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
| Efeitos sonoros (soundboard) | A10 + B17 | A2 (na `main`); permissão opcional da v2 | médio |
| Overlay em jogos | B15 | B2 (na `main`) | médio |
| Bot de música | A11 + B14 | B1 (na `main`); **decisão sobre termos de uso** | grande |

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
| **B17 Sons (UI)** | B | Botão "Efeitos sonoros" na sala de voz abrindo a grade de sons (nome + emoji, clique toca, botão direito apaga se puder). Enviar: escolher arquivo, prévia, cortar para 5 s antes de enviar (opcional), nome e emoji. Ao receber `sound:played`, cada app toca o som localmente pela saída escolhida, respeitando deafen e o volume da pessoa que tocou (B4); o mesmo autor não toca dois ao mesmo tempo (o novo espera ou substitui, decidir no contrato). Indicador de quem tocou. | `components/voice/Soundboard*.tsx`, `lib/actions/sounds.ts`, `store/sounds.ts` |

Tocar **localmente em cada app** (em vez de mixar no microfone de quem tocou) é mais simples, sai igual para todo
mundo e respeita o volume/deafen de cada um. Na v2, uma permissão de canal `soundboard` pode limitar quem toca.

### Sobreposição em jogos (overlay)

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **B15 Overlay** | B | Janela extra do Electron **transparente, sem borda, sempre no topo** (`alwaysOnTop: 'screen-saver'`, `setIgnoreMouseEvents(true)` para o clique passar para o jogo, `focusable: false`) mostrando os membros da minha sala de voz com avatar, nome, mute/deafen e **quem está falando** (mesmo `speaking` da store, enviado do renderer principal por IPC). Liga/desliga em Configurações de voz e por atalho global (`globalShortcut`, ex.: Shift+`); posição (cantos) e tamanho configuráveis; some quando não estou em sala. | `src/main/overlay.ts`, `src/preload/*`, `src/renderer/overlay/**` (página própria no electron-vite), `lib/actions/overlay.ts` |

**Limite importante:** funciona por cima de jogos em **modo janela** e **tela cheia sem bordas (borderless)**, que é o
padrão da maioria dos jogos hoje. Em **tela cheia exclusiva** (DirectX/Vulkan com o monitor só para o jogo) uma
janela comum não aparece por cima: o Discord resolve injetando código no processo do jogo, o que é complexo, frágil e
pode ser bloqueado por **anti-cheat**. Fica fora; a tela de configuração deve explicar isso ("use tela cheia sem bordas").

### Bot de música (YouTube/Spotify por URL)

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A11 Bot de música (servidor)** | A | Um participante "Música" que o **servidor** coloca na sala do LiveKit com `@livekit/rtc-node` (Apache-2.0), publicando uma faixa de áudio. Fila por sala: `music:play { channelId, url }`, `music:skip`, `music:stop`, `music:queue`; estado em `music:state` para a sala. Áudio obtido com **yt-dlp** (`youtube-dl-exec`, MIT) + **ffmpeg** (decodifica para PCM e envia em quadros). Link do **Spotify** não tem áudio disponível pela API: o bot lê título/artista da página/oEmbed e procura a música no YouTube. Validação de URL (só domínios permitidos), duração máxima, limite de fila e de requisições; sai sozinho quando a sala esvazia. | `server/modules/music.ts`, `server/music/**`, `shared/types/music.ts` |
| **B14 Bot de música (UI)** | B | Comandos no chat (`/tocar <url>`, `/pular`, `/parar`, `/fila`) e um cartão "Tocando agora" na sala de voz com capa, título, quem pediu e botões; o bot aparece na lista da sala com o selo "BOT" e tem o volume do botão direito (B4) como qualquer pessoa. | `components/voice/MusicPlayer.tsx`, `lib/actions/music.ts`, `store/music.ts`, comandos no `Composer` |

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
- A11/B14: `/tocar <link do YouTube>` toca para todos na sala; `/pular` e `/parar` funcionam; link de Spotify acha a música; sala vazia derruba o bot; URL de domínio não permitido é recusada.
