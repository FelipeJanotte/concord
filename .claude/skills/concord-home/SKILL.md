---
name: concord-home
description: Navegação do Concord (v3, B7) — a barra de úteis (barra da esquerda com Início, Comunidade e as ferramentas do registro), a Home (tela "Amigos" com abas e "Adicionar amigo", lista de conversas privadas com não lido e online, chat da conversa com @nome) e o item "Mensagem"/"Adicionar amigo" do botão direito numa pessoa. Use ao mexer em store/navigation.ts (section, homeView, toolId), lib/actions/navigation.ts (showHome, showCommunity, showFriends, openDmChat, messageAccount, openTool, isChatOnScreen), components/rail/UtilityRail.tsx, components/home/HomeSidebar.tsx, components/friends/FriendsView.tsx, components/dm/DmList.tsx, components/tools/{registry,ToolView}, lib/dms.ts, lib/home.ts, no layout de App.tsx, ou ao investigar selo errado na Home, não lido que não some, conversa que não abre ou "Vocês precisam ser amigos para conversar".
---

# Navegação: barra de úteis e Home (v3, B7)

A barra da esquerda (onde no Discord ficam os servidores) é a **barra de úteis**: no topo, **Início** (Amigos +
conversas privadas) e **Concord** (a comunidade: canais de texto e voz); abaixo do separador, as **ferramentas** da
v4, lidas de um registro. É só tela: não há evento novo. Amizades e conversas vêm das ações da A6/A7 (skills
`concord-friends` e `concord-dms`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `store/navigation.ts` | `section: 'community' \| 'home' \| 'tool'`, `homeView: { kind: 'friends' } \| { kind: 'dm', channelId }`, `toolId`. |
| `lib/actions/navigation.ts` | `showCommunity`, `showHome`, `showFriends`, `openDmChat(channelId)`, `messageAccount(accountId)`, `openTool(toolId)`, `isChatOnScreen(state, channelId)`. Reexportadas por `lib/client.ts`. |
| `lib/dms.ts` | `findDm(dms, channelId)`, `chatLabel(channel, dms)` (`#geral` / `@Ana`) e `DM_PERMISSIONS`. |
| `lib/home.ts` | `homeBadge` (selo do Início) e `communityUnread` (bolinha da comunidade). |
| `components/rail/UtilityRail.tsx` | A barra de úteis (substitui o antigo `ServerRail` do `App.tsx`). |
| `components/home/HomeSidebar.tsx` | Barra lateral da Home: botão "Amigos" (selo de pedidos recebidos) + `DmList` + painéis de voz e da conta. |
| `components/dm/DmList.tsx` | Conversas, a mais recente primeiro, com não lido e online (online só de amigos). |
| `components/friends/FriendsView.tsx` | Abas Online, Todos, Pendentes, Bloqueados e "Adicionar amigo" (nome#id). |
| `components/tools/registry.ts` | `TOOLS: ToolDefinition[]` (`id`, `name`, `icon`, `Panel`), vazio até a B10. |
| `components/tools/ToolView.tsx` | Cabeçalho + painel da ferramenta aberta. |
| `components/voice/MemberContextMenu.tsx` | Item `MessageItem`: "Mensagem" ou "Adicionar amigo". |
| `App.tsx` | Layout: barra de úteis → barra lateral da seção → área central → lista de membros (só na comunidade). |

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

## Botão direito numa pessoa

Depois de volume/silenciar/moderação: **"Mensagem"** se é amiga ou já há conversa (e não está bloqueada);
**"Adicionar amigo"** (pedido para `nome#tag`) se não há relação nenhuma; nada com pedido pendente ou bloqueio.

## Ferramenta nova na barra (B10 e seguintes)

1. Crie o painel em `components/tools/<Nome>Panel.tsx` (usa as ações de `lib/actions/tools.ts`).
2. Acrescente **uma linha** em `TOOLS` (`components/tools/registry.ts`): `{ id, name, icon, Panel }`.
3. O ícone aparece abaixo do separador, o clique chama `openTool(id)` e o `ToolView` mostra o painel.

## Testes

| Arquivo | Cobre |
|---|---|
| `lib/actions/navigation.test.ts` | Seções, a Home lembra a conversa, ferramenta fecha ao escolher canal, `messageAccount` (sucesso e erro), não lido por seção. |
| `lib/home.test.ts` | `homeBadge`, `communityUnread`, `findDm`, `chatLabel`, `DM_PERMISSIONS`. |
| `components/home/home.test.tsx` | Barra (selo, troca de seção, ferramenta do registro), Home (ordem, online, vazio, selo de pedidos), chat da conversa (@nome, sem cargos, busca o histórico), tela Amigos (abas, ações, confirmações, adicionar), botão direito ("Mensagem", "Adicionar amigo", nada quando bloqueada). |

À mão (duas contas, skill `concord-dev-workflow`): A adiciona B pelo `nome#id` → B vê o selo no Início e aceita em
Pendentes → A clica em "Mensagem" (tela Amigos ou botão direito) → B vê a conversa com bolinha e o selo; abrir limpa.
Ir para a comunidade e voltar mantém o canal e a conversa.

## Problemas conhecidos

- Não há "fechar conversa" na lista nem contagem de mensagens (só a bolinha).
- Conversa com bloqueio continua na lista (o servidor não manda remoção); abrir mostra o histórico, mandar dá erro.
- Chamada de voz na conversa (B8) e notificações nativas (B9) ainda não existem.
