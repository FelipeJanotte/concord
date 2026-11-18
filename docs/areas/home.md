# Navegação: barra de úteis e Home (v3, B7)

A barra da esquerda (onde no Discord ficam os servidores) é a **barra de úteis**: no topo, **Início** (Amigos +
conversas privadas) e **Concord** (a comunidade: canais de texto e voz); abaixo do separador, **um só botão "Ferramentas"**: abre o hub das
ferramentas da v4 (barra lateral `ToolsSidebar` com as ferramentas por grupo e, sem ferramenta aberta, a galeria `ToolGallery` de cartões). É só tela: não há evento novo. Amizades e conversas vêm das ações da A6/A7 (`docs/areas/friends.md` e `docs/areas/dms.md`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `store/navigation.ts` | `section: 'community' \| 'home' \| 'tool'`, `homeView: { kind: 'friends' } \| { kind: 'dm', channelId }`, `toolId` (a ferramenta aberta; `null` na seção `tool` é a galeria; **não** é zerado ao sair da seção, então é a memória da última ferramenta, como `homeView`), `toolChannelId` (destino escolhido pelo `+` do composer, `docs/areas/tools.md`). |
| `lib/actions/navigation.ts` | `showCommunity`, `showHome`, `showFriends`, `openDmChat(channelId)`, `messageAccount(accountId)`, `openTool(toolId, toolChannelId?)` (o `+` do composer passa o canal do chat), `showTools()` (botão da barra: última ferramenta ou a galeria na primeira vez; zera `toolChannelId`), `showToolGallery()` (galeria), `openVoiceChat(channelId)` e `setVoiceChatOpen(open)` (chat da sala de voz, ver `docs/areas/messages.md`), `isChatOnScreen(state, channelId)` (sala de voz só conta com o painel "Chat" aberto). Reexportadas por `lib/client.ts`. |
| `lib/dms.ts` | `findDm(dms, channelId)`, `chatLabel(channel, dms)` (`#geral` / `@Ana`) e `DM_PERMISSIONS`. |
| `lib/home.ts` | `homeBadge` (selo do Início) e `communityUnread` (bolinha da comunidade). |
| `components/rail/UtilityRail.tsx` | A barra de úteis (substitui o antigo `ServerRail` do `App.tsx`). No topo, acima do Início, o botão de atualizar o app quando há versão nova (`UpdateRailSlot`, `docs/areas/updates.md`). Um único botão "Ferramentas" (ativo com `section === 'tool'`) chama `showTools`. |
| `components/home/HomeSidebar.tsx` | Barra lateral da Home: botão "Amigos" (selo de pedidos recebidos) + `DmList` + painéis de voz e da conta. |
| `components/dm/DmList.tsx` | Conversas, a mais recente primeiro, com não lido e online (online só de amigos). |
| `components/friends/FriendsView.tsx` | Abas Online, Todos, Pendentes, Bloqueados e "Adicionar amigo" (nome#id). |
| `components/tools/registry.ts` | `TOOLS: ToolDefinition[]` (`id`, `name`, `description`, `group`, `icon`, `Panel`) e `TOOL_GROUPS` (ordem e rótulos "Comunidade"/"Diversão", fonte única da barra lateral e da galeria): as cinco ferramentas da v4 (B10, `docs/areas/tools.md`). |
| `components/tools/ToolView.tsx` | Sem ferramenta (`toolId` nulo): a `ToolGallery`; senão cabeçalho + painel (id desconhecido: "Ferramenta não encontrada"). |
| `components/tools/ToolsSidebar.tsx` | Barra lateral da seção `tool`: cabeçalho "Ferramentas" (galeria), ferramentas por grupo (`aria-current` na aberta) + painéis de voz e da conta. |
| `components/tools/ToolGallery.tsx` | Cartões (ícone, nome, descrição) por grupo; clicar chama `openTool(id)`. |
| `components/voice/MemberContextMenu.tsx` | Item `MessageItem`: "Mensagem" ou "Adicionar amigo". |
| `App.tsx` | Layout: barra de úteis → barra lateral da seção (`HomeSidebar`, `ToolsSidebar` ou `ChannelSidebar`) → área central → lista de membros (só na comunidade). Barras com largura ajustável (`ResizableSide`, ver "Barras laterais redimensionáveis"). |
| `lib/side-width.ts`, `components/ResizableSide.tsx` | Largura das barras laterais: limites, guardar na máquina e a alça de arrastar. |

## Por que `section` e não `view.kind`

O roadmap previa `view` ganhar `kind: 'friends' | 'dm' | 'tool'`. Ficou numa fatia própria: `view` continua sendo
**a tela da comunidade** (`text`/`voice`, sem mudança em quem já usa) e `section` diz qual parte está na frente.
Assim, ir para a Home e voltar mantém o canal ou a sala abertos, e a Home lembra a última conversa (`homeView`).

| `section` | Barra lateral | Área central | Lista de membros |
|---|---|---|---|
| `community` | `ChannelSidebar` | `ChatView`/`VoiceView` de `view` | sim |
| `home` | `HomeSidebar` | `FriendsView` ou `ChatView` da conversa | não |
| `tool` | `ChannelSidebar` (contexto: canal/sala atual) | `ToolView` | não |

`selectTextChannel` e `joinVoice` põem `section: 'community'` (clicar num canal sempre leva à comunidade).

## Conversas privadas na tela

- Os canais `dm` **não vêm em `channels`** (o servidor os esconde de `visibleChannels`): ficam só em `dms`. Por isso
  `ChatView`, `Composer` e `MessageActions` procuram o canal também em `dms` (`findDm`).
- **Cargos não valem** na conversa: `useCan(perm, channelId)` devolve `DM_PERMISSIONS.has(perm)` (ver, mandar,
  anexar), igual ao `allowedInDm` do servidor. `MessageActions`: só o autor apaga (B6).
- `ChatView` busca o histórico sozinho quando `messages[channelId]` está vazio (primeira vez ou depois de
  reconectar, porque o `hello` zera `messages`).
- **Não lido:** `message:new` usa `isChatOnScreen` (olha a seção, não só o último canal). Abrir a conversa limpa.
- **"Mensagem"** (`messageAccount`): `dm:open` no servidor (cria ou recupera) e abre o chat. Erro do servidor vira
  exceção e a tela mostra no toast.

## Selos e indicadores

- **Início:** `homeBadge` = pedidos recebidos + conversas não lidas (aparece no `aria-label`, ex.: "Início (2)").
- **Concord:** bolinha à esquerda quando algum canal da comunidade tem não lido e a seção é outra.
- **Amigos** (Home) e aba **Pendentes**: só pedidos recebidos.
- Canal ou conversa **silenciados** (botão direito → "Silenciar") não ficam como não lidos e aparecem esmaecidos
  (`docs/areas/notifications.md`, "Silenciar canal").

## Botão direito numa pessoa

Depois de volume/silenciar/moderação: **"Mensagem"** se é amiga ou já há conversa (e não está bloqueada);
**"Adicionar amigo"** (pedido para `nome#tag`) se não há relação nenhuma; nada com pedido pendente ou bloqueio.

## Barras laterais redimensionáveis

Arrastar a borda muda a largura da barra lateral (canais ou Home), da lista de membros e do painel "Chat" da sala de
voz. Duplo clique na alça volta ao padrão. A largura fica na máquina (`localStorage`), uma chave por painel; a barra
de canais e a da Home dividem a mesma (`navigation`), então trocar de seção não faz o layout pular. Só tela: sem evento.

| Painel | Chave (`localStorage`) | Padrão | Mín. | Máx. | Alça |
|---|---|---|---|---|---|
| Barra lateral (canais/Home) | `concord:side-width:navigation` | 240 | 200 | 400 | borda direita |
| Lista de membros | `concord:side-width:members` | 240 | 200 | 400 | borda esquerda |
| Chat da sala de voz | `concord:side-width:voice-chat` | 360 | 280 | 640 | borda esquerda |

- `lib/side-width.ts`: `SIDE_PANELS` (tabela acima), `clampWidth`, `loadSideWidth`/`saveSideWidth` (com `try/catch`:
  sem armazenamento vale o padrão; valor guardado inválido volta ao padrão, fora dos limites é corrigido).
- `components/ResizableSide.tsx`: `<ResizableSide panel edge label className?>` envolve o painel (que passa a ter
  `flex-1 min-w-0` em vez de largura fixa) e desenha a alça `role="separator"` (`aria-valuenow/min/max`). Arraste
  com `setPointerCapture`; grava só ao soltar. Montado em `App.tsx` (barra lateral e `MemberList`, que leva o
  `hidden lg:flex`) e no `VoiceView` (chat da sala).
- **Por que não o `resizable` do shadcn** (`react-resizable-panels`): trabalha com porcentagem do grupo inteiro; aqui
  os painéis têm largura em px e a área central é que absorve, e a lista de membros some abaixo de `lg`. A alça
  própria tem ~60 linhas e nenhuma dependência.
- Painel novo redimensionável: uma linha em `SIDE_PANELS` e envolver o painel com `ResizableSide`.

## Ferramenta nova no hub (B10 e seguintes)

1. Crie o painel em `components/tools/<Nome>Panel.tsx` (usa as ações de `lib/actions/tools.ts`).
2. Acrescente **uma linha** em `TOOLS` (`components/tools/registry.ts`): `{ id, name, description, group, icon, Panel }` (`group`: `'community'` ou `'fun'`; grupo novo entra em `TOOL_GROUPS`).
3. A ferramenta aparece na barra lateral (no grupo) e na galeria; o clique chama `openTool(id)` e o `ToolView` mostra o painel.

## Testes

| Arquivo | Cobre |
|---|---|
| `lib/actions/navigation.test.ts` | Seções, a Home lembra a conversa, escolher canal sai da seção e a ferramenta fica lembrada, `toolChannelId` do `+` do composer, `messageAccount` (sucesso e erro), não lido por seção. |
| `lib/home.test.ts` | `homeBadge`, `communityUnread`, `findDm`, `chatLabel`, `DM_PERMISSIONS`. |
| `lib/side-width.test.ts`, `components/ResizableSide.test.tsx` | Limites, largura guardada (inválida, sem armazenamento), arrastar nas duas bordas, mínimo/máximo, só grava ao soltar, duplo clique volta ao padrão. |
| `components/tools/hub.test.tsx` | Um só botão "Ferramentas" na barra, galeria com os grupos, abrir pelo cartão, barra lateral marcando a aberta, voltar à galeria, memória da última ferramenta, `toolChannelId`. |
| `components/home/home.test.tsx` | Barra (selo, troca de seção), Home (ordem, online, vazio, selo de pedidos), chat da conversa (@nome, sem cargos, busca o histórico), tela Amigos (abas, ações, confirmações, adicionar), botão direito ("Mensagem", "Adicionar amigo", nada quando bloqueada). |

À mão (duas contas, `docs/areas/dev-workflow.md`): A adiciona B pelo `nome#id` → B vê o selo no Início e aceita em
Pendentes → A clica em "Mensagem" (tela Amigos ou botão direito) → B vê a conversa com bolinha e o selo; abrir limpa.
Ir para a comunidade e voltar mantém o canal e a conversa.

## Problemas conhecidos

- Não há "fechar conversa" na lista nem contagem de mensagens (só a bolinha).
- Conversa com bloqueio continua na lista (o servidor não manda remoção); abrir mostra o histórico, mandar dá erro.
- Chamada na conversa: ✅ B8 (`docs/areas/calls.md`; botão no cabeçalho, painel no topo do chat e cartão no canto).
- Notificações nativas (B9) ainda não existem.
