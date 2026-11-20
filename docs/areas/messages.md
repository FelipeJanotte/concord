# Mensagens

Mensagens dos canais de texto, do **chat de texto das salas de voz** e das conversas privadas (`dm`). Anexos têm doc próprio (`docs/areas/attachments.md`),
apagar fica na moderação (`docs/areas/moderation.md`) e mensagens de ferramenta na `docs/areas/tools.md`.

Tipos (`Message.kind`): `text` (escrita por alguém), `pin` (aviso "Fulano fixou uma mensagem", B27) e `tool` (postada pelo servidor com `tool` tipado: ferramentas do grupo e, com `tool.tool === 'music'`, a **resposta do bot de música** — autor gravado = quem pediu, mas a tela mostra "Música" com o selo "BOT"; `docs/areas/music.md`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/message.ts` | `Message` (com `editedAt?` e `replyTo?`), `ReplyPreview`, `replyPreviewText` (mesmo resumo no servidor e na tela), `REPLY_PREVIEW_MAX` (100), `SendMessagePayload.replyToId?`, `EditMessagePayload`, `MessageEdited`, eventos. |
| `server/modules/messages.ts` | `message:history` (com `before`/`after`/`around`), `message:send` (fila por conexão), `message:edit`, `message:search` (B26), `message:pin`/`message:pins` (B27), `typing`. |
| `server/repo/messages.ts` | `listMessages` (página por `before`/`after`/`around` + `editedAt` + `pinnedAt` + citações; `toMessages` monta a `Message`), `searchMessages` (B26), `findPinState`/`countPins`/`setPinned`/`listPins` (B27), `insertMessage` (grava `reply_to_id`), `replyPreviews`, `findReplyTarget`, `findEditable`, `editMessage`. |
| `server/db/schema/messages.ts` | Colunas `pinned_at`/`pinned_by` e o `kind` `pin` e o índice `messages_content_trgm_idx` (GIN `pg_trgm` para a busca) (migration `0015_v8`, que cria a extensão; índice parcial `messages_channel_pinned_idx` para a lista de fixadas). Colunas `edited_at` e `reply_to_id` (migration `0009_edit_reply`). `reply_to_id` **sem chave estrangeira** de propósito: se a original for apagada, o id fica e a leitura mostra "mensagem apagada". |
| `src/renderer/src/lib/actions/messages.ts` | `sendMessage` (leva a resposta e limpa), listeners `message:new`, `message:edited`, `message:deleted` (só as citações; a lista é da moderação), `startReply`/`cancelReply`, `startEdit`/`cancelEdit`/`editLastMessage`/`editMessage`. |
| `src/renderer/src/store/messages.ts` | `replyingTo` (por canal) e `editingMessageId` (uma por vez), além do histórico e do "digitando". |
| `components/chat/MessageActions.tsx` | Barra ao passar o mouse: Adicionar reação (quem pode `send`), Responder (quem pode `send`), Editar (autor, só texto), Apagar (autor ou `manageMessages`). A barra tem `w-max` e os botões/ícones `shrink-0`: em chat estreito (ex.: o chat da sala de voz) os ícones não achatam (teste em `reactions.test.tsx`). |
| `components/chat/MessageEditor.tsx` | Edição no lugar: Enter salva, Shift+Enter quebra linha, Esc cancela; erro embaixo. |
| `components/chat/ReplyPreview.tsx` | `ReplyQuote` (citação clicável, "Mensagem apagada"), `ReplyBanner` ("Respondendo a Fulano" + X), `scrollToMessage` (rola e pisca com `data-highlight`), `messageElementId`. |
| `components/ChatView.tsx` | `MessageBody` troca o texto pelo editor e mostra "(editada)" (hora no título); `MessageItem` põe o id `msg-<id>`, a citação em cima do nome e nunca deixa uma resposta compacta. |
| `components/chat/Composer.tsx` | Faixa de resposta, Esc cancela a resposta, seta para cima no campo vazio edita a minha última mensagem. Botão `+` "Ferramentas" (`ToolsMenu.tsx`, fora do chat da sala de voz): abre o painel da ferramenta mirando este chat (`docs/areas/tools.md`). Texto começando com um comando do registro (`lib/commands.ts`: hoje `/play`, `/skip`, `/stop`, `/queue`): o comando aparece como código (`CommandHighlight`). Comando com argumento seguido de espaço (`/play `, `commandBlock`) vira o **bloco** `/play` + `query` (`CommandBlock`) por cima do início da 1ª linha do campo, com `text-indent` da largura do bloco (quebra de linha usa a largura toda): o campo guarda só o argumento, o cursor fica à direita do bloco (nunca coberto), a dica longa é o `placeholder` e o bloco continua como rótulo enquanto se digita; Backspace com o argumento vazio desfaz o bloco e volta a `/play`. O estado continua sendo o texto inteiro (`/play <argumento>`), então envio, rascunho, menções e colar não mudam (`docs/areas/music.md`). Comando de música manda o chat junto (`textChannelId`) e limpa o campo ao enviar; se não foi aceito nem postado (erro antes de postar), toast e o texto volta ao campo. |
| `components/chat/CommandMenu.tsx`, `SuggestionList.tsx` | **Menu de comandos**: `/` no começo do texto abre a lista acima do campo (`commandSuggestions`: filtra pelo começo do nome, `/sk` → só `/skip`), cada item com `/nome` em código, o argumento apagado e a descrição curta. Setas navegam, Enter/Tab ou clique completam para `/nome ` (com espaço; em `/play`, já no bloco `query`), Esc fecha (reabre ao digitar de novo). Com o menu aberto o Enter completa em vez de enviar; com o comando completo (já tem espaço) o menu some e o Enter envia. Some quando o texto não começa com `/` ou nada combina. `SuggestionList` é a lista genérica (listbox, `mousedown` para não tirar o foco) usada também pelo `MentionMenu`; o teclado dos dois menus é o mesmo no `Composer` (nunca abrem juntos). |

## Eventos

| Evento | Payload | Resposta | Regras |
|---|---|---|---|
| `message:send` | `{ channelId, content, attachmentIds?, replyToId? }` | `OkResult` (a mensagem chega como `message:new`) | canal de texto, sala de voz (chat da sala) ou `dm`; texto ou anexo; até 2000; `send` (e `attach` com anexo); `replyToId` só de mensagem do **mesmo canal** (senão vai sem citação); `LIMITS.message`. Toda recusa volta com o motivo ("Canal não encontrado", "Você não tem permissão para enviar mensagens neste canal"...); o app espera até `SEND_TIMEOUT_MS` (10 s) e avisa "Mensagem não enviada: ..." (sem resposta: "o servidor não respondeu"). A resposta é opcional para o servidor: quem manda sem ack continua funcionando. |
| `message:edit` | `{ messageId, content }` | `OkResult` | ver abaixo |
| `message:embed` (servidor → app) | `MessageEmbedUpdate { channelId, messageId, embed: LinkEmbed \| null }` | — | prévia de link pronta, trocada ou removida; por `emitToViewers` ("Prévia de links") |
| `message:embed-remove` | `{ messageId }` | `OkResult` | só o autor tira a prévia ("Prévia de links") |
| `message:edited` (servidor → app) | `TextMessageEdited { channelId, messageId, content, editedAt, mentions? }` ou `ToolMessageUpdated { channelId, messageId, content, tool }` (`MessageEdited` = os dois) | — | por `emitToViewers`; a forma com `tool` é o servidor trocando o resultado de uma mensagem `kind: 'tool'` (hoje: o bot de música saindo de "procurando") |

## Buscar (B26)

Campo "Buscar" no topo do chat (fora do chat embutido da sala de voz). Enter abre o painel de resultados à direita
do chat; clicar num resultado abre o canal/conversa e rola até a mensagem, mesmo fora do histórico carregado.

| Arquivo | Papel |
|---|---|
| `src/shared/types/message.ts` | `SearchRequest { query, channelId?, authorId?, before? }`, `SearchResult`, `SEARCH_PAGE_SIZE` (25), `SEARCH_QUERY_MAX` (100); `HistoryRequest.after?/around?` e `HistoryPage.hasNewer?`. |
| `server/modules/messages.ts` | `message:search`: valida, `LIMITS.search` (10 seguidas, 1 a cada 2 s), canais = `visibleChannels` + `dmChannelsOf` (`server/access.ts`), ou só `channelId` se a conta tem `view` nele; anexos assinados para quem pediu. |
| `server/repo/messages.ts` | `searchMessages`: `content ILIKE '%q%'` com barra invertida, `%` e `_` escapados, filtro de autor, cursor `before` (pelo `seq`), mais novas primeiro, 25 + 1 para saber se há mais. |
| `src/renderer/src/lib/search.ts` | Puras: `parseSearchInput` (`de:Nome` ou `de:"Nome Composto"`, em qualquer lugar do texto), `findAuthor` (nome ou `nome#id`, sem diferenciar maiúsculas), `highlightParts` (trecho de até 160 caracteres em volta da 1ª ocorrência, partes marcadas), `messageSnippet` (com "@Nome" no lugar das menções). |
| `src/renderer/src/lib/actions/search.ts` | `searchMessages(texto, channelId ou null)` (resolve o `de:` entre quem está online, amigos e conversas), `loadMoreResults`, `closeSearch`, `jumpToMessage(channelId, messageId)` (abre canal/DM/chat da sala e marca `jumpTarget`; sem a mensagem carregada, chama `loadHistoryAround`). Resposta atrasada de uma busca antiga é descartada. |
| `src/renderer/src/lib/actions/messages.ts` | `loadHistoryAround` (troca a lista do canal pela página em volta da mensagem), `loadNewerMessages` (`after` da última), `jumpToPresent` (descarta e busca a página mais recente), `clearJumpTarget`. Uma versão por canal descarta páginas que chegam depois de a lista ter sido trocada. Com `hasNewerHistory`, `message:new` **não** entra no fim (haveria buraco); chega ao carregar as mais novas. |
| `src/renderer/src/store/search.ts` | `search: SearchView` ou `null` (texto, canal, autor, resultados, `hasMore`, `loading`, `error`); `null` = painel fechado. `store/messages.ts`: `hasNewerHistory`, `jumpTarget`. |
| `components/chat/SearchPanel.tsx` | `SearchBox` (campo no cabeçalho) e `SearchPanel` (aside "Resultados da busca": contagem, "Só neste canal", X, erro, "Nenhum resultado", trecho com `<mark>`, "Carregar mais"). |
| `components/ChatView.tsx` | `jumpTarget` do canal → `scrollToMessage` (rola e pisca) e limpa; rolar perto do fim com `hasNewerHistory` carrega as mais novas; botão "Ir para as mensagens recentes". |

Regras: `query` sem espaços nas pontas, até 100 caracteres; vazia só com `authorId` ("Digite o que buscar").
Canal que a conta não vê, DM de outras pessoas (nem a dona) e ids inválidos dão lista vazia, sem erro. A busca é
no texto guardado: menção é `<@id>`, então "ana" não acha a menção a Ana; mensagem de ferramenta entra pelo
`content` por extenso.

## Fixar mensagens (B27)

| Arquivo | Papel |
|---|---|
| `src/shared/types/message.ts` | `PinMessagePayload { messageId, on }`, `MessagePinned { channelId, messageId, pinnedAt }` (`null` = desafixada), `PINS_PER_CHANNEL_MAX` (50), `canPinMessages` (tem `manageMessages`), `Message.pinnedAt?`, `kind: 'pin'`. |
| `server/modules/messages.ts` | `message:pin`: `view` (senão "Mensagem não encontrada", sem vazar), aviso não se fixa, em DM qualquer membro, fora dela `canPinMessages`; mesmo estado = `ok` sem evento; `LIMITS.pin`; 50 por canal. Avisa `message:pinned` por `emitToViewers` e, ao fixar, posta o aviso. `message:pins`: lista (sem `view`, vazia). |
| `src/renderer/src/lib/actions/pins.ts` | `loadPins`, `pinMessage` (lança o erro do servidor), listeners `message:pinned` (marca/desmarca a mensagem carregada; lista em cache: põe no topo, tira, ou descarta se a mensagem não está carregada) e `message:deleted` (tira da lista). `store/messages.ts`: `pins` por canal (`loadHistory` descarta a do canal). |
| `src/renderer/src/lib/permissions.ts` | `useCanPin(channelId)`: em DM sempre, fora dela `canPinMessages`. |
| `components/chat/MessageActions.tsx` | "Fixar mensagem" / "Desafixar mensagem" (erro vira aviso). O aviso `pin` não tem reagir/responder/fixar, só apagar. |
| `components/chat/PinnedMessages.tsx` | Alfinete "Mensagens fixadas" no cabeçalho do chat: popover com a lista (carrega ao abrir), "Nenhuma mensagem fixada aqui ainda.", clicar fecha e rola até a mensagem (`jumpToMessage`, o mesmo caminho da busca), "Desafixar" para quem pode. |
| `components/ChatView.tsx` | `PinNotice`: alfinete + "Fulano fixou uma mensagem." — "uma mensagem" leva até a original; a mensagem seguinte nunca fica compacta embaixo do aviso. |
| `lib/notifications.ts` | O aviso aparece como "Fixou uma mensagem" na notificação. |

Decisão do aviso: mensagem `kind: 'pin'` na mesma tabela, com autor = quem fixou, `content` vazio e a original em
`reply_to_id` (reaproveita o resumo e o "mensagem apagada" da B18). Assim fica no histórico na ordem certa, chega
pelo `message:new` de sempre e quem tem `manageMessages` (ou o autor) apaga como qualquer mensagem. Desafixar não
posta aviso. Apagar a mensagem fixada tira da lista (a linha some).

## Editar (A15)

- Só o **autor** (nem a dona edita a dos outros) e só `kind: 'text'` (resultado de ferramenta não edita) →
  "Você só pode editar as suas mensagens".
- Precisa ainda ver o canal (senão "Mensagem não encontrada", sem vazar) e poder mandar mensagem nele.
- Texto limpo (pontas), até 2000; vazio só se a mensagem tem anexos ("A mensagem não pode ficar vazia (para
  tirar, apague)"). Mesmo texto responde `ok` sem editar nem avisar. Gasta `LIMITS.message`.
- O app aplica na hora (sem esperar o evento) e o `message:edited` atualiza as outras janelas e as citações.
- Mensagem `kind: 'tool'` não é editada por ninguém, mas o **servidor** pode trocar o resultado dela: `updateToolMessage` (`server/repo/messages.ts`) grava `tool` + `content` e sai `message:edited` com `tool` e sem `editedAt` (o app troca `tool` e `content`, atualiza as citações e **não** marca "(editada)"). Uso hoje: a resposta do bot de música, postada em `searching` ("Procurando “q”…") e trocada pela resposta final ou por `failed` ("Não consegui tocar: …") quando a busca termina (`docs/areas/music.md`).

## Responder citando (B18)

- A mensagem guarda `reply_to_id`; o servidor devolve `replyTo: ReplyPreview` pronto (no `message:new` e no
  histórico), com o nome **atual** do autor da original e o começo do texto **atual** (editar a original muda a
  citação; o app troca ao vivo pelo `message:edited`).
- Original apagada: `replyTo: { id, deleted: true, ... }` → "Mensagem apagada" (ao vivo pelo `message:deleted`).
- Clicar na citação rola até a original se ela estiver carregada (senão não faz nada).

## Reações (A16)

Cada pessoa pode reagir com vários emojis diferentes na mesma mensagem (um de cada); mensagens de ferramenta também.

| Arquivo | Papel |
|---|---|
| `src/shared/types/reactions.ts` | `Reaction { emoji, accountIds }` (o tamanho é a contagem), `cleanReactionEmoji` (1–8 code points, sem espaços), `REACTIONS_PER_MESSAGE_MAX` (20), eventos. `Message.reactions?`. |
| `server/db/schema/reactions.ts` | Tabela `message_reactions` (mensagem, conta, emoji; chave nas três; cascade com mensagem e conta) — migration `0011_reactions`. |
| `server/repo/reactions.ts` | `reactionsByMessage` (no `listMessages`) e `setReaction` (transação: liga sem duplicar ou tira; devolve a lista inteira ou `'limit'`). |
| `server/modules/reactions.ts` | `message:react`: valida, `view` (senão "Mensagem não encontrada") e `send` ("Você não pode reagir neste canal"), `LIMITS.reaction` (20 seguidas, 2/s), 20 emojis diferentes por mensagem; `message:reactions` por `emitToViewers`. |
| `src/renderer/src/lib/actions/reactions.ts` | Listener `message:reactions` (lista vazia tira o campo), `toggleReaction` (liga o que não tenho, tira o que tenho), `hasReacted`, `openReactionPicker` (`reactionPickerFor` na store, um por vez). |
| `components/chat/Reactions.tsx` | Chips (emoji + contagem, o meu marcado, título "Ana e você reagiu"), "+" e o `EmojiPicker` do soundboard; Esc fecha; erro embaixo. Sem `send`: chips desligados e sem "+". |

| Evento | Payload | Resposta |
|---|---|---|
| `message:react` | `{ messageId, emoji, on }` | `OkResult` |
| `message:reactions` (servidor → app) | `{ channelId, messageId, reactions }` (lista inteira) | — |

Ordem: emojis na ordem em que apareceram na mensagem; contas na ordem em que reagiram. Testes:
`server/tests/reactions.test.ts` (lista para todos, ordem, histórico, sem duplicar, tirar, recusas, canal que não
vê sem vazar, limite de 20, sem `send`, cascade ao apagar) e `components/chat/reactions.test.tsx` (listener,
liga/tira, quem reagiu, chips, seletor pela barra e pelo "+", Esc, erro, sem permissão).

## Menções @nome (B19)

No texto a menção é **`<@id-da-conta>`** (o nome muda, o id não); `<@todos>` avisa todo mundo que vê o canal.
Na tela e nos campos a pessoa vê e digita "@Nome".

| Arquivo | Papel |
|---|---|
| `src/shared/types/mentions.ts` | `MENTION_SOURCE` (regex), `EVERYONE_TOKEN`, `mentionToken`, `parseMentions` (até 20 contas), `mentionsAccount`, `mentionsToPlain` ("@Nome"/"@alguém"), `Mention { accountId, name }`. `Message.mentions?` e `MessageEdited.mentions?`. |
| `src/shared/types/permissions.ts` | Permissão global nova `mentionEveryone` ("Mencionar @todos"); o @todos não começa com ela. |
| `server/modules/messages.ts` | `checkEveryone`: sem `mentionEveryone`, `<@todos>` vira texto comum "@todos" (no envio e na edição; em conversa privada sempre). O `message:new`/`message:edited` saem com `mentions` resolvidas. |
| `server/repo/messages.ts` / `accounts.ts` | `resolveMentions` e `withMentions` (no histórico), `accountNames` (nome atual de cada conta; inexistente fica de fora). |
| `src/renderer/src/lib/mentions.ts` | Puras: `splitMentions`, `candidatesFrom` (rótulo `@Nome`, ou `@Nome#tag` com nome repetido; `@todos` primeiro), `activeMentionQuery`, `filterCandidates`, `insertMention`, `fromEditable`/`toEditable` (campo ⇄ token). |
| `components/chat/MentionMenu.tsx` | Lista acima do campo (clique por `mousedown` para não perder o foco). |
| `components/chat/Composer.tsx` | Detecta o "@" antes do cursor, candidatos = online que veem o canal (menos eu; numa DM, a outra pessoa; `@todos` com permissão e fora de DM), setas/Enter/Tab/Esc, e no envio troca os rótulos escolhidos pelo token. Digitar "@Ana" sem escolher no menu fica texto comum. |
| `components/chat/MessageText.tsx` | Desenha os tokens como "@Nome" (nome do servidor, senão de quem está online, senão "@alguém"); a menção a mim ou @todos fica mais forte. |
| `components/ChatView.tsx` | Mensagem que me menciona (ou @todos, de outra pessoa) ganha a borda e o fundo de destaque. |
| `components/chat/MessageEditor.tsx` / `ReplyPreview.tsx` | O editor mostra "@Nome" e salva o token; a citação e a faixa mostram "@Nome". |
| `lib/notifications.ts` | Menção em canal da comunidade notifica fora de foco ("Ana em #geral"); clique abre o canal (alvo `channel`, B9). |

Testes: `src/shared/types/mentions.test.ts`, `src/renderer/src/lib/mentions.test.ts`, `server/tests/mentions.test.ts`
(nomes no envio, na edição e no histórico; id inexistente; @todos sem/com permissão e na edição) e
`components/chat/mentions.test.tsx` (menu, envio com token, @todos com permissão, setas/Esc, DM, "@Nome",
destaque, editar, notificação).

## Links clicáveis

Links no texto da mensagem viram `<a>` e abrem no **navegador padrão** do sistema. Nada muda no servidor nem
no contrato: o texto continua o mesmo, só a tela reconhece o link.

| Arquivo | Papel |
|---|---|
| `src/shared/links.ts` | Puras: `splitLinks(texto)` → pedaços `{ text }` / `{ url, href }` e `externalUrl(raw)` (só `http:`/`https:`, senão `null`). Compartilhado porque o processo principal usa a mesma checagem. |
| `components/chat/MessageText.tsx` | Cada nó de texto da formatação (B25) separa as menções e passa por `splitLinks`; link vira `<a target="_blank" rel="noreferrer noopener">` com `text-primary` sublinhado e o endereço no `title`. |
| `src/main/index.ts` | `setWindowOpenHandler`: o `target="_blank"` cai aqui e vai para `shell.openExternal` **só se `externalUrl` aceitar** (nunca `file:`, `javascript:`, `ms-settings:`...). `will-navigate`: link que tentasse trocar a página da janela é cancelado e (se http/https) aberto fora. |

Regras de reconhecimento:

- Começa com `http://`, `https://` ou `www.` (este abre como `https://`), em começo de palavra (`xhttps://a.com` não é link).
- Para no espaço, `<`, `>`, `"` e crase. Pontuação da frase no fim (`.,;:!?'*_~`) fica fora do link.
- `)` no fim só entra se tiver `(` correspondente no link (`https://pt.wikipedia.org/wiki/Java_(linguagem)` inteiro; `(ver https://a.com)` sem o `)`).
- `https://` ou `www.` sozinhos não são link.

Onde **não** vale (de propósito, por enquanto): a citação de resposta (`ReplyPreview`) e as mensagens de ferramenta
mostram texto puro. A prévia do site fica em "Prévia de links", abaixo.

Testes: `src/shared/links.test.ts` (reconhecimento, pontuação, parênteses, protocolos recusados) e
`components/chat/links.test.tsx` (`<a>` com `href`/`target`/`rel`, `www.`, link junto com menção, `javascript:` fica texto).

## Prévia de links

Depois que a mensagem sai (o envio **não espera** a prévia), o servidor busca o **primeiro link** do texto, lê o
Open Graph e grava a prévia na mensagem; quem vê o canal recebe `message:embed`. A imagem é baixada pelo servidor e
servida por ele: o app nunca carrega nada do site, então quem lê não vaza o IP. Segurança e alternativas
descartadas: ADR `docs/decisions/0015-previa-de-links.md`.

| Arquivo | Papel |
|---|---|
| `src/shared/types/message.ts` | `LinkEmbed { url, title?, description?, siteName?, imageUrl?, music? }`, `Message.embed?`, `MessageEmbedUpdate { channelId, messageId, embed: LinkEmbed \| null }`, eventos `message:embed` e `message:embed-remove`. |
| `server/embeds/first-link.ts` | `firstPreviewLink(texto)`: primeiro link de `splitLinks` no texto **visível** de `parseMarkdown` (ignora código, bloco de código e spoiler). |
| `server/embeds/address.ts` | `isPublicAddress(ip)` (pura): recusa privado, loopback, link-local, CGNAT, multicast, reservados, documentação, IPv6 equivalentes (ULA, link-local, multicast, NAT64, 6to4) e IPv4 mapeado em IPv6 (decide pelo IPv4 de dentro). |
| `server/embeds/safe-fetch.ts` | `createSafeFetcher({ allowAddress })`: só http/https; IP literal conferido antes; nome resolvido por um `lookup` próprio que só devolve IPs aceitos, e a conexão vai **nesse IP** (sem segunda resolução: nada de DNS rebinding); até 3 redirecionamentos, cada um conferido de novo; 3 s no total (`AbortController`); só status 2xx; tipo aceito pelo pedido; corpo cortado no limite (HTML) ou recusado (imagem). Toda falha vira `FetchRefused`. |
| `server/embeds/open-graph.ts` | `parseOpenGraph(html, url)` (pura): `og:title`/`og:description`/`og:image`/`og:site_name`, com `<title>` e `meta description` de reserva; entidades (`&amp;`, `&#8212;`, `&#x1F600;`...), espaços juntados, cortes (título 256, descrição 500, site 100), imagem só http(s) e absoluta. Sem título nem descrição = `null`. |
| `server/embeds/previewer.ts` | `LinkPreviewer`: página (até 512 KB, só `text/html`, lida como UTF-8) → metadados → imagem (até 2 MB, tipo pelos bytes com `sniffImage`; falhou = prévia sem imagem). `music: true` quando `parseMusicQuery` reconhece o link (YouTube/Spotify). Cache em memória por URL: 5 min, até 50 (guarda a promessa, então pedidos juntos buscam uma vez). |
| `server/embeds/ports.ts`, `drivers.ts` | Porta `WebFetcher` e a montagem: produção usa `createSafeFetcher({ allowAddress: isPublicAddress })`; `overrideWebFetcher` troca (só os testes, via `server/tests/fake-web.ts`). |
| `server/modules/embeds.ts` | `previewNewMessage` (chamado pelo `message:send` depois do `message:new`) e `previewEditedMessage` (pelo `message:edit`, só se o primeiro link mudou; sem link novo, tira a prévia). `message:embed-remove`. `GET /embeds/<messageId>` (imagem). Limpeza das imagens sem mensagem no boot e a cada `UPLOAD_SWEEP_INTERVAL_MS`. |
| `server/repo/messages.ts` | `findEmbedState`, `setEmbed`, `messagesWithEmbedImage`, `toLinkEmbed`/`embedImagePath`; `toMessages` devolve o `embed` no histórico, na busca e nas fixadas. |
| `server/db/schema/messages.ts` | Coluna `embed jsonb` (`StoredEmbed` = `LinkEmbed` sem `imageUrl`, com `imageType` quando há imagem). |
| `server/files-signing.ts` | `signMessage` também assina `embed.imageUrl` (`signEmbed`, amarrado ao id da mensagem). |
| `src/renderer/src/lib/actions/embeds.ts` | Listener `message:embed` (põe/tira `embed` da mensagem carregada), `removeEmbed(messageId)` (lança o erro do servidor), `playEmbedInBot(url, textChannelId)` (= `/play <url>` pelo `runMusicCommand`; nada duplicado do bot). |
| `components/chat/LinkEmbed.tsx` | Cartão abaixo do texto (`MessageBody` no `ChatView`; some durante a edição): barra `border-primary`, site, título que abre fora (mesmo `<a target="_blank">` dos links), descrição em até 3 linhas, imagem até 300 px de altura, "Tocar no bot" (link de música e eu numa sala de voz) e X "Remover prévia" (só o autor). |

Fluxo: `message:send` → `message:new` → `previewNewMessage` → (`LIMITS.embed` por conta: 10 seguidas, 1 a cada 3 s;
estourou = sem prévia) → `LinkPreviewer` → relê a mensagem: se o primeiro link mudou no meio ou ela foi apagada,
descarta → grava a imagem em `DATA_DIR/embeds/<messageId>` e o `embed` → `message:embed` por `emitToViewers`, com
`imageUrl` assinada por conta. Página sem metadados, lenta, não HTML ou recusada: sem prévia e sem evento.

Regras:

- `url` da prévia é o link escrito (não o destino do redirecionamento).
- Remover: só o autor (nem a dona); sem prévia = `ok` sem evento. Editar mantendo o mesmo primeiro link não traz de volta a prévia removida.
- Imagem: `GET /embeds/<messageId>?a=&e=&s=`; assinatura, validade e `view` no canal conferidos a cada pedido (perder o canal invalida o link); qualquer falha = 404. `content-type` = tipo confirmado pelos bytes, `nosniff` e CSP `sandbox`.

Como testar: `server/embeds/*.test.ts` (IP, primeiro link, parser com acentos/entidades/sem tags/gigante, buscador contra um
servidor HTTP local: loopback recusado por IP e por nome, redirecionamento conferido, protocolo, limite, tipo, tempo;
previewer com buscador falso: imagem pelos bytes, cache, música), `server/tests/embeds.test.ts` (servidor real com
`fake-web.ts` e um site falso local: prévia para quem vê, canal privado, sem OG, vazia/não HTML/lenta, redirecionamento,
editar, remover só o autor, histórico, imagem só para quem vê), `lib/actions/embeds.test.ts` e `components/chat/link-embed.test.tsx`.
Manual: mandar um link de notícia e um do YouTube estando numa sala de voz.

Problemas conhecidos: página em outra codificação que não UTF-8 pode mostrar acentos errados; site que só monta os
metadados com JavaScript ou que bloqueia robôs fica sem prévia; a limpeza pode, numa janela de milissegundos, apagar
a imagem de uma prévia que estava sendo gravada (a prévia fica sem imagem). Depuração: o servidor só loga erro
inesperado (`[message:embed]`); recusa de rede é silenciosa de propósito.

## Formatação (B25)

Subconjunto de markdown, **só na tela**: o servidor guarda e devolve o texto como veio (nada muda no contrato
nem no banco). Nunca vira HTML: o parser devolve nós e o React desenha elementos (`<b>` digitado continua texto;
nada de `dangerouslySetInnerHTML`).

| Marcação | Vira |
|---|---|
| `**negrito**` | `<strong>` |
| `*itálico*` | `<em>` |
| `~~riscado~~` | `<s>` |
| `` `código` `` | `<code>` com fundo `bg-muted`, texto como veio |
| ```` ```bloco``` ```` | `<code data-code-block>` em bloco (`bg-muted`, borda); sem destaque de linguagem |
| `> citação` | `<span data-quote>` com barra à esquerda |
| `\|\|spoiler\|\|` | Tarja (`bg-foreground`, texto transparente) até clicar ou Enter/Espaço |

| Arquivo | Papel |
|---|---|
| `src/shared/markdown.ts` | Pura `parseMarkdown(texto)` → `MarkdownNode[]` (`text`, `code`, `bold`, `italic`, `strike`, `spoiler`, `codeBlock`, `quote`). |
| `components/chat/MessageText.tsx` | Desenha os nós; cada nó `text` passa pelas menções (`splitMentions`) e links (`splitLinks`). `Spoiler` guarda o "revelado" por spoiler. API inalterada: `<MessageText message={...} />`. |

Regras do parser:

- Ordem: blocos de código primeiro, depois linhas de citação, depois o que está dentro da linha.
- Código (em linha ou bloco) é literal: **sem** formatação, menção nem link dentro. Marcação que atravessa um código
  não fecha (em `` **a `b** c` `` o `**` fica texto e `b** c` vira código).
- Bloco: ```` ``` ```` até o próximo ```` ``` ````; a 1ª linha some se for só um nome de linguagem (```` ```ts ````). Uma quebra de linha
  logo antes e logo depois do bloco é engolida (o bloco já quebra).
- Citação: linha que começa com `> ` (ou só `>`); linhas seguidas viram uma citação. `>oi` e `a > b` são texto.
  Marcação não atravessa a borda da citação.
- Não fechado ou vazio continua texto (`**sem fim`, `****`, `||||`, `` ` `` sozinho).
- Itálico não começa nem termina com espaço ou `*`: `2 * 3 * 4` é texto. `***x***` vira negrito com itálico dentro.
- Aninha: `**a *b***`, `||`código`||`, `*a **b** c*`. Menção e link dentro de negrito/itálico/spoiler funcionam.
- Spoiler escondido: o clique em qualquer coisa dentro (inclusive link) só revela (`preventDefault`); depois de
  revelado o link abre normalmente. Escondido tem `role="button"` "Spoiler: clique para ver".
- Sem escape com `\` e sem `_itálico_`/`__sublinhado__` (fora do escopo).

Onde **não** vale: a citação de resposta (`ReplyPreview`), as notificações e as mensagens de ferramenta mostram o
texto puro, com os marcadores.

Testes: `src/shared/markdown.test.ts` (cada marcação, aninhado, não fechado, vazio, asterisco solto, HTML, código
atravessando, bloco com linguagem, citação) e `components/chat/markdown.test.tsx` (elementos, HTML como texto,
código sem menção/link, menção/link no negrito, bloco, citação, spoiler por clique e teclado).

## Chat de texto da sala de voz

Como no Discord, cada sala de voz tem um chat de texto: as mensagens são do próprio canal `voice` (mesma tabela,
mesmos eventos). Quem **vê** a sala lê, e quem tem `send` escreve, mesmo sem entrar na voz. Editar, responder,
reações, menções, anexos e links funcionam igual ao canal de texto. Mensagens de ferramenta (`tools:*`) continuam
só em canal de texto/conversa.

| Arquivo | Papel |
|---|---|
| `server/modules/messages.ts` | `message:send` aceita canal `voice` (antes ignorava). A permissão é a mesma (`send`, `attach`); `message:new` vai só para quem vê a sala (`emitToViewers`). |
| `store/navigation.ts` + `lib/actions/navigation.ts` | `voiceChatOpen` (painel aberto; vale para a sala em `view` e continua aberto ao trocar de sala), `setVoiceChatOpen(open)` (abrir limpa o não lido da sala), `openVoiceChat(channelId)` (mostra a sala **sem entrar na voz**, com o painel aberto, e busca o histórico). `isChatOnScreen` conta a sala de voz só com o painel aberto. |
| `components/VoiceView.tsx` | Botão "Chat" (`MessageSquare`) no topo da sala, com bolinha vermelha quando há não lido e o painel fechado; `VoiceChatPanel` (360 px, `aside` "Chat da sala") com o `ChatView embedded`. |
| `components/ChatView.tsx` | `embedded`: sem o cabeçalho do canal (o painel tem o seu) e sem o painel de chamada. Boas-vindas próprias da sala ("Chat de Jogos"). |
| `components/ChannelSidebar.tsx` | Na linha da sala de voz: atalho de chat (aparece ao passar o mouse, ou sempre com não lido) que chama `openVoiceChat` sem entrar na voz; não lido deixa o nome em negrito com a marca à esquerda. |
| `lib/dms.ts` (`chatLabel`) e `lib/notifications.ts` | Nome da sala **sem "#"** (placeholder "Conversar em Jogos", "Ana em Jogos" na notificação). Clicar na notificação abre a sala com o chat (`openVoiceChat`). |

Testes: `server/tests/realtime.test.ts` (manda, quem não está na voz recebe, histórico, resposta `ok`/erro do envio), `lib/actions/navigation.test.ts`
(não lido com o painel fechado/aberto, `openVoiceChat`, voltar para a comunidade), `lib/actions/notifications.test.ts`
(clique abre a sala com o chat) e `components/voice-chat.test.tsx` (botão e painel, envio sem estar na voz, bolinha,
atalho da barra lateral).

## Não lido guardado no servidor (A18)

Antes o não lido (`unread` da store) vivia só na memória da janela: reiniciar o app perdia tudo e ler numa janela
não apagava nas outras. Agora o servidor guarda, por conta e canal (texto, sala de voz ou conversa), a **última
mensagem lida**. O não lido vem dele ao conectar e a leitura vai para ele.

| Arquivo | Papel |
|---|---|
| `src/shared/types/reads.ts` | `ChannelReadState { channelId, lastReadId, unread }`, `ChannelRead { channelId, messageId }`, `ChannelReadResult`, eventos. |
| `server/db/schema/reads.ts` | Tabela `channel_reads` (chave `account_id + channel_id`, `last_read_id`, `last_read_seq` = `messages.seq` da mensagem lida, `updated_at`); cascata com a conta e o canal. `last_read_id` sem chave estrangeira: a mensagem lida pode ser apagada e o ponto continua valendo pelo `seq`. Migration `0015`. |
| `server/repo/reads.ts` | `advanceRead` (upsert que só grava se o `seq` novo for maior: `'advanced' \| 'unchanged' \| 'missing'`) e `readStates` (o ponto de cada canal + maior `seq` de mensagem de **outra pessoa** por canal). |
| `server/modules/reads.ts` | `channel:reads` (canais que vejo, `visibleChannels`, + minhas conversas, `listDms`) e `channel:read` (valida, `LIMITS.read`, `view`, avança e avisa as outras janelas). |
| `src/renderer/src/lib/actions/reads.ts` | `loadReads` (depois do `hello`), `startReading` (abrir um chat), `markRead` (interna), listeners `channel:read-sync` e `message:new` (chat na tela lê na hora). |
| `src/renderer/src/store/channels.ts` | `unread`, `lastRead` (última lida por canal) e `readMarker` (onde parei, para a linha). |
| `components/ChatView.tsx` | Linha vermelha **"Novas mensagens"** (`role="separator"`) antes da primeira mensagem depois de `readMarker`; ela quebra o agrupamento. |

Eventos (tabela completa em `docs/areas/architecture.md`):

| Evento | Payload | Resposta | Regras |
|---|---|---|---|
| `channel:reads` | — | `ChannelReadState[]` | um item por canal visível e conversa minha. `unread` = existe mensagem de outra pessoa (ou de conta apagada) com `seq` maior que o lido. Nunca lido + mensagem de outra pessoa = não lido. |
| `channel:read` | `{ channelId, messageId }` | `ChannelReadResult` | **só avança**: mensagem mais antiga que o ponto responde `ok` sem mudar nada. Id inválido, mensagem de outro canal ou canal que não vê: "Mensagem não encontrada" (sem vazar). `LIMITS.read` (30 seguidas, depois 2/s): "Muitas leituras seguidas. Tente de novo em N s." |
| `channel:read-sync` (servidor → app) | `{ channelId, messageId }` | — | só quando o ponto avançou, para as **outras** conexões da mesma conta (não a que leu, nem outras contas). |

Fluxo no app:

1. `hello` zera `unread`/`lastRead`/`readMarker`; `loadReads` junta o que veio do servidor com o que chegou no
   meio (o local vence). Canal silenciado (`mutedChannels`) não vira não lido. Se o chat na tela está não lido,
   chama `startReading` nele.
2. Abrir um chat (`selectTextChannel`, `openDmChat`, `openVoiceChat`, `setVoiceChatOpen`, `showHome`,
   `showCommunity` → `startReading`): tira o não lido, guarda `readMarker = lastRead` **se** estava não lido (senão
   apaga a linha), espera o histórico (`loadHistory` devolve a mesma promise se já está carregando) e marca a
   última mensagem como lida.
3. `markRead`: só emite `channel:read` se a última mensagem carregada for diferente de `lastRead` (abrir de novo
   não reenvia).
4. `message:new` com o chat na tela: lê na hora (`isChatOnScreen`, a mesma regra do não lido).
5. `channel:read-sync`: tira o não lido e anda `lastRead` nesta janela.
6. **Menção não lida**: `message:new` fora da tela, de outra pessoa, que me menciona (`mentionsAccount`: eu ou
   `@todos`) liga `mentioned[channelId]` na store; a `ChannelSidebar` mostra uma bolinha vermelha
   (`bg-destructive`, "Você foi mencionado") ao lado do nome do canal de texto ou da sala de voz (chat da sala).
   Vale mesmo com o canal silenciado. Sai junto com o não lido (`startReading`, `channel:read-sync`) e quando o
   canal some. Só na memória da janela: reiniciar o app perde a bolinha (o servidor não guarda menção não lida).

Como testar: `server/tests/reads.test.ts` (servidor real: nunca lido, ler e mensagem nova, só avança, canais
escondidos e DMs, `channel:read-sync` só para as outras janelas, ler o mesmo ponto não avisa, recusas),
`server/tests/limits.test.ts` ("marcar como lido"), `lib/actions/reads.test.ts` (carregar, silenciado, não perder
o que chegou no meio, chat aberto ao conectar, abrir com/sem não lido, mensagem nova na tela e fora, sync) e
`components/chat/new-messages.test.tsx` (posição da linha e quando não aparece). À mão: duas janelas da mesma conta
(`docs/areas/dev-workflow.md`), ler numa e ver a bolinha sumir na outra; fechar e abrir o app e ver o não lido.

Limites conhecidos:

- Logo depois de subir esta versão, todo canal com mensagem de outra pessoa aparece não lido para todos (ninguém
  tem ponto de leitura ainda); abrir cada um resolve.
- A linha só aparece se a mensagem onde parei está na página carregada; mais antiga que isso, não há linha.
- Ler é "chat na tela", mesmo com a janela fora de foco (igual ao não lido de antes).
- Canal que fica visível depois (`channels:visible`) só traz o não lido do servidor na próxima conexão.

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tests/search.test.ts` | Servidor real: acha por trecho (maiúsculas, ordem), canal privado que não vê, DM alheio (nem a dona), filtros de canal/autor, `%`/`_` literais, páginas com `before`, recusas; `around`/`after` do histórico. |
| `server/tests/pins.test.ts` | Servidor real: fixar com `manageMessages` (evento, aviso, lista, histórico), desafixar, ordem, sem permissão, canal que não vê sem vazar, DM (os dois sim, a dona não), limite de 50, recusas, apagar tira da lista. |
| `src/renderer/src/lib/search.test.ts`, `lib/actions/search.test.ts`, `lib/actions/pins.test.ts` | Puras da busca; ações: busca, `de:`, erro, mais resultados, ir até a mensagem (carregada, fora do histórico, sumiu, DM, sala de voz, página atrasada), `message:new` com buraco, mais novas, voltar às recentes; fixar e listeners. |
| `components/chat/search.test.tsx`, `components/chat/pins.test.tsx` | Tela: campo, painel, destaque, "Só neste canal", erro, rolar até resultado carregado e fora do histórico, "Ir para as mensagens recentes", carregar as mais novas; Fixar/Desafixar por quem pode, DM, erro, lista pelo alfinete, vazia, desafixar pela lista, aviso "fixou". |
| `server/tests/edit-reply.test.ts` | Servidor real: editar (todos recebem, histórico, sem `editedAt` quando nunca editada, mesmo texto), recusas (outra pessoa/dona, vazia, longa, inexistente, ferramenta, canal que não vê sem vazar), responder (resumo, histórico, editar/apagar a original, outro canal/inexistente/inválido vão sem citação). |
| `src/renderer/src/lib/actions/edit-reply.test.ts` | App: resposta no envio e limpa, cancelar, apagada, `message:edited` com citações, `message:edited` de ferramenta (troca `tool` sem `editedAt`), editar (limpa, aplica, mesmo texto, erro), seta para cima. |
| `src/renderer/src/components/chat/edit-reply.test.tsx` | Tela: barra de ações por quem, editar no lugar (Enter, Esc, erro, seta para cima, "(editada)"), faixa de resposta (foco, envio, X, Esc), citação rola e pisca, "Mensagem apagada". |
| `src/renderer/src/lib/commands.test.ts`, `components/chat/command-menu.test.tsx` | Menu de comandos: filtro, parser, rascunho e bloco (`commandBlock`) do registro; na tela aparece com "/", filtra, setas+Enter, Tab, clique, Esc, não aparece no meio do texto e não atrapalha as menções. Bloco do `/play`: o campo vem depois do bloco no DOM e guarda só o argumento, digitar entra à direita, Backspace no vazio volta a `/play`, Enter envia `/play <argumento>`, Shift+Enter, menção e colar anexo dentro do argumento. |

## Problemas conhecidos / depuração

| Sintoma | Causa e solução |
|---|---|
| "(editada)" não aparece em outra janela | Ela não vê o canal agora ou o histórico não estava carregado (ao carregar, já vem). |
| Citação não rola | A original não está carregada (role para cima para carregar mais) ou foi apagada. |
| Resposta chegou sem citação | `replyToId` de outro canal ou inexistente: o servidor manda sem citação de propósito. |
| Não consigo reagir | Sem `send` no canal (os chips ficam desligados) ou a mensagem já tem 20 emojis diferentes. |
| Menção não avisou | Quem escreveu não escolheu no menu (ficou texto), a pessoa não vê o canal, ou é @todos sem a permissão `mentionEveryone` (vira texto). |
| Texto embaralhado logo depois de escolher uma menção ("do bem?tu") | Corrigido: o cursor ia para depois da menção num `requestAnimationFrame`, e o que se digitava antes desse quadro ficava fora de ordem (aparecia no CI lento). Agora o `Composer` guarda a posição em `pendingCaret` e aplica num `useLayoutEffect` assim que o texto novo está no campo. Não volte a usar `requestAnimationFrame` para o cursor; teste em `mentions.test.tsx` ("digitar logo depois de escolher"). |
| Link não ficou clicável | Não começa com `http://`, `https://` ou `www.` (ex.: `exemplo.com` sozinho não é reconhecido) ou está colado em outra palavra. |
| Link abre dentro do app / não abre | O clique tem de passar por `setWindowOpenHandler` (`target="_blank"`); protocolo que não é http/https é ignorado de propósito. |
| Mensagem no chat da sala de voz (ou em qualquer canal) some sem enviar | Causa: o servidor recusava o `message:send` em silêncio e o app, que já tinha limpado o campo, não avisava nada. O caso real foi um **servidor desatualizado** (anterior ao chat da sala de voz, que ainda ignorava canal `voice`) com o app novo — o app se atualiza sozinho, o servidor não. Corrigido: o `message:send` tem resposta (`OkResult`) e o app mostra "Mensagem não enviada: <motivo>"; com servidor antigo, "o servidor não respondeu" depois de 10 s. Solução no servidor antigo: atualizar (`docs/areas/deploy.md`). Testes em `lib/actions/actions.test.ts` e `server/tests/realtime.test.ts`. |
| Marcador (`**`, `\|\|`...) aparece em vez da formatação | Não fechou, ficou vazio, está dentro de código, atravessa a borda de uma citação ou é itálico com espaço na ponta (`* a *`). Regras em "Formatação (B25)". |
| Busca lenta | O `ILIKE '%q%'` usa o índice `pg_trgm` (ADR 0012). Medido no PGlite com 100 mil mensagens: termo raro 8–19 ms, termo comum ~100 ms, num canal só 20–25 ms; **1 ou 2 letras** não usam trigramas (~300 ms). Postgres próprio sem a extensão `pg_trgm` (contrib) falha na migration `0015`. |
| Resultado não rola até a mensagem | A mensagem foi apagada depois da busca ("Mensagem não encontrada") ou a conta perdeu `view`. |
| Mensagem nova não aparece depois de abrir um resultado antigo | De propósito: com `hasNewerHistory` o fim da lista não é o fim do canal. Role até o fim ou clique em "Ir para as mensagens recentes". |
| Pendente | Busca e alfinete no chat embutido da sala de voz, filtros por data/anexo, busca por relevância; links e formatação na citação, escape com ``, histórico de edições, editar anexos, responder já mencionando o autor e menção a cargo (@Moderadores). |
