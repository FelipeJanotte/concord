# Concord — roadmap v1 → v4 para 2 devs em paralelo

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
- Sem "servidores/guildas": continua uma única comunidade.

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
8. Cada task atualiza a skill da sua área em `.claude/skills/` e o mapa do `AGENTS.md`.

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
| **B3 Compartilhar tela** | Main: `session.setDisplayMediaRequestHandler` + `desktopCapturer.getSources`, IPC `screen-sources` para o seletor. Renderer: diálogo de escolha de tela/janela (com miniaturas), publicar faixa de tela (com áudio do sistema quando disponível), grade no `VoiceView` com tile de tela em destaque, indicador "ao vivo" na sidebar. Campo `sharing` em `VoiceState`. | `src/main/screen-share.ts`, `src/preload/*`, `components/voice/{ScreenPicker,ScreenTile,VoiceGrid}.tsx`, `VoiceView.tsx` |
| **B4 Dispositivos** (se sobrar tempo) | Escolha de microfone/saída e volume por pessoa. | `components/voice/DeviceSettings.tsx` |

**Único ponto de contato na v1:** `voice.ts` do servidor usa `repo/channels` (A1). Como o repo já é async desde a F0, B não é afetado pela troca.

**Pronto quando:** dois apps trocam imagem e arquivo num canal, reiniciar o servidor não perde nada, e três clientes numa sala de voz se ouvem e veem a tela de um deles.

## v2 — Cargos e permissões de canal

Contrato em conjunto (`shared/types/permissions.ts`): `Role { id, name, color, position, permissions }`, permissões globais (`manageChannels`, `manageRoles`, `manageMembers`) e por canal (`view`, `send`, `attach`, `connect`, `speak`, `share`), `ChannelOverride { channelId, roleId, allow, deny }`. Primeira conta criada vira dona; cargo `@todos` implícito.

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A4 Motor de permissões** | A | Tabelas `roles`, `member_roles`, `channel_overrides`. Função pura `can(accountId, channelId, perm)` com testes vitest. Aplicar em **todos** os handlers; `hello` devolve só canais visíveis; trocar `io.emit` por salas Socket.IO por canal (mensagem só chega em quem pode ver); `/files/*` passa a exigir token assinado de curta duração; token LiveKit sai com grants conforme `connect/speak/share`. Eventos `role:*`, `member:roles`, `channel:overrides`. | `server/modules/permissions.ts`, `server/permissions/**`, `server/db/schema/roles.ts` |
| **B5 UI de administração** | B | Diálogo "Configurações da comunidade" (CRUD de cargos, ordenar, atribuir a membros), aba "Permissões" no diálogo do canal, cargos e cores no `MemberList`, esconder ações que a pessoa não pode fazer, canal privado com cadeado. | `components/settings/**`, `lib/actions/permissions.ts`, `store/permissions.ts` |
| **A5 Endurecimento do banco** ✅ (branch `v2/a5-endurecimento`) | A | Backup automático (`pg_dump` diário com rotação, serviço no compose), rate limit por conta em mensagens/uploads/login, índices, expiração de sessões, usuário do Postgres com privilégio mínimo. | `server/scripts/backup.*`, `server/middleware/rate-limit.ts` |
| **B6 Moderação** | B | Expulsar da voz, silenciar pelo servidor (LiveKit `mutePublishedTrack`), apagar mensagem alheia com permissão. | `server/modules/moderation.ts`, `components/voice/ModerationMenu.tsx` |

B5 desenvolve contra o contrato com dados mockados em `store/permissions.ts` enquanto A4 não mergeia.

## v3 — Amizades e conversas privadas (texto, arquivos, voz, tela)

Decisão de modelagem que evita duplicar código: **DM é um canal** de tipo `'dm'` com tabela `channel_members`. Mensagens, anexos, histórico, "digitando" e salas LiveKit funcionam sem alteração; a permissão vira "é membro".

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A6 Amizades** | A | Tabela `friendships` (pendente/aceita/bloqueada). Eventos `friend:request` (por `nome#tag`), `accept`, `decline`, `remove`, `block`. Presença por conta (online/offline) visível só para amigos. Tela "Amigos" (Online, Todos, Pendentes, Adicionar). | `server/modules/friends.ts`, `server/db/schema/friends.ts`, `components/friends/**`, `lib/actions/friends.ts`, `store/friends.ts` |
| **A7 DMs de texto** | A | `dm:open(accountId)` cria/recupera o canal `dm`; só amigos (ou quem já tem conversa); lista de DMs na sidebar da Home com não lidos; reusa `ChatView`/anexos. | `server/modules/dms.ts`, `components/dm/DmList.tsx` |
| **B7 Navegação Home** | B | `ServerRail` deixa de ser decorativa: botão Home (Amigos + DMs) × comunidade. `view` ganha `kind: 'friends' \| 'dm'`. Entrega o "casco" com slots onde A6/A7 encaixam seus componentes. **Mergear primeiro.** | `components/ServerRail.tsx`, `components/home/HomeLayout.tsx`, `store/view.ts`, `App.tsx` |
| **B8 Chamadas privadas** | B | `call:invite/accept/decline/cancel/end` com toque e timeout; sala LiveKit = id do canal `dm`; UI de chamada recebida (toast persistente com som), barra de chamada no topo do DM, tela compartilhada reutilizando os componentes da v1. | `server/modules/calls.ts`, `components/call/**`, `lib/actions/calls.ts`, `store/calls.ts` |
| **B9 Notificações** | B | Notificação nativa do Electron e badge no ícone para DM/chamada/pedido de amizade. | `src/main/notifications.ts`, `lib/notifications.ts` |

Ordem: contrato → B7 → (A6, A7) em paralelo com (B8, B9).

## v4 — Ferramentas do grupo

Infra comum (contrato em conjunto): mensagem ganha `kind` (`'text' | 'tool'`) e `payload` tipado; menu "Ferramentas" (`+`) no composer com registro de ferramentas (`components/tools/registry.ts`: cada ferramenta = 1 arquivo de diálogo + 1 de renderização). O sorteio roda **no servidor** (`crypto.randomInt`) e o resultado é postado no canal, para todos verem o mesmo resultado e ninguém poder "rolar de novo escondido".

| Task | Dev | O que faz | Arquivos (dono) |
|---|---|---|---|
| **A8 Sorteador de times (servidor)** | A | `tools:teams { channelId, names[], teamCount, lanes? }`: valida (2–50 nomes, até 32 caracteres), embaralha (Fisher–Yates), distribui equilibrado; com `lanes` ligado e times de 5, atribui Top/Selva/Meio/Atirador/Suporte sem repetir; aceita preferências de lane opcionais por pessoa. Função pura com testes. Posta mensagem `kind: 'tool'`. | `server/modules/tools.ts`, `server/tools/teams.ts`, `shared/types/tools.ts` |
| **B10 Sorteador (UI)** | B | Diálogo: importar nomes de quem está na sala de voz / online / digitar manualmente, nº de times, toggle de lanes, "Sortear de novo". Card de resultado no chat com times coloridos e lanes. | `components/tools/{TeamRandomizerDialog,TeamResultCard,registry}.tsx` |
| **Próximas ferramentas** | alternado | Mesmo molde, uma por pessoa: enquete, dado/moeda, sorteio de 1 nome, "mover times para salas de voz" (usa o resultado do sorteador + permissão de moderação da v2). | 1 arquivo de servidor + 2 de UI cada |

## Verificação (em toda task)

- `npm run typecheck` e `npm test` (vitest: `can()`, sorteador, validação de upload, repos contra Postgres de teste).
- `docker compose up -d` + `npm run dev:all`; segunda/terceira instância do app conforme a skill `concord-dev-workflow`.
- v1: enviar imagem e arquivo de 20 MB, rejeitar 30 MB, reiniciar servidor e conferir histórico; 3 clientes em voz + tela; `import-json` preserva contas e mensagens.
- v2: conta sem cargo não vê canal privado, não recebe `message:new` dele (conferir no DevTools → WS) e não obtém token LiveKit.
- v3: pedido de amizade → aceitar → DM com anexo → chamada com tela; bloqueado não consegue abrir DM.
- v4: mesmo resultado nos dois clientes; times equilibrados com número ímpar; lanes sem repetição.
