# Mensagens

Mensagens dos canais de texto, do **chat de texto das salas de voz** e das conversas privadas (`dm`). Anexos têm doc próprio (`docs/areas/attachments.md`),
apagar fica na moderação (`docs/areas/moderation.md`) e mensagens de ferramenta na `docs/areas/tools.md`.

Tipos (`Message.kind`): `text` (escrita por alguém) e `tool` (postada pelo servidor com `tool` tipado: ferramentas do grupo e, com `tool.tool === 'music'`, a **resposta do bot de música** — autor gravado = quem pediu, mas a tela mostra "Música" com o selo "BOT"; `docs/areas/music.md`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/message.ts` | `Message` (com `editedAt?` e `replyTo?`), `ReplyPreview`, `replyPreviewText` (mesmo resumo no servidor e na tela), `REPLY_PREVIEW_MAX` (100), `SendMessagePayload.replyToId?`, `EditMessagePayload`, `MessageEdited`, eventos. |
| `server/modules/messages.ts` | `message:history`, `message:send` (fila por conexão), `message:edit`, `typing`. |
| `server/repo/messages.ts` | `listMessages` (página + `editedAt` + citações), `insertMessage` (grava `reply_to_id`), `replyPreviews`, `findReplyTarget`, `findEditable`, `editMessage`. |
| `server/db/schema/messages.ts` | Colunas `edited_at` e `reply_to_id` (migration `0009_edit_reply`). `reply_to_id` **sem chave estrangeira** de propósito: se a original for apagada, o id fica e a leitura mostra "mensagem apagada". |
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
| `message:edited` (servidor → app) | `TextMessageEdited { channelId, messageId, content, editedAt, mentions? }` ou `ToolMessageUpdated { channelId, messageId, content, tool }` (`MessageEdited` = os dois) | — | por `emitToViewers`; a forma com `tool` é o servidor trocando o resultado de uma mensagem `kind: 'tool'` (hoje: o bot de música saindo de "procurando") |

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
mostram texto puro. Prévia do site (embed) está pendente.

Testes: `src/shared/links.test.ts` (reconhecimento, pontuação, parênteses, protocolos recusados) e
`components/chat/links.test.tsx` (`<a>` com `href`/`target`/`rel`, `www.`, link junto com menção, `javascript:` fica texto).

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

## Testes

| Arquivo | Cobre |
|---|---|
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
| Pendente | Prévia de link (embed), links e formatação na citação, escape com `\`, histórico de edições, editar anexos, responder já mencionando o autor e menção a cargo (@Moderadores). |
