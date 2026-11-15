---
name: concord-messages
description: Como funcionam as mensagens do Concord — envio (message:send, fila por conexão, limites), histórico paginado (message:history), editar a própria mensagem (A15: message:edit/message:edited, edited_at, "(editada)", edição no lugar com Enter/Esc e seta para cima) responder citando (B18: replyToId, ReplyPreview pronto do servidor, faixa "Respondendo a", citação que rola até a original, "mensagem apagada") reações (A16: message:react/message:reactions, tabela message_reactions, chips e seletor de emoji) menções @nome (B19: <@id>, autocompletar no campo, @todos com mentionEveryone, destaque e notificação em canal) e links clicáveis (src/shared/links.ts: splitLinks/externalUrl, abrem no navegador padrão, só http/https). Use ao mexer em server/modules/messages.ts, server/repo/messages.ts, server/db/schema/messages.ts, src/shared/types/message.ts, lib/actions/messages.ts, store/messages.ts, server/modules/reactions.ts, server/repo/reactions.ts, src/shared/types/reactions.ts, src/shared/types/mentions.ts, lib/mentions.ts, components/chat/{Composer,MessageActions,MessageEditor,ReplyPreview,Reactions,MessageText,MentionMenu}.tsx ou no MessageBody/MessageItem do ChatView, src/shared/links.ts, setWindowOpenHandler/will-navigate em src/main/index.ts, ou ao investigar link que não fica clicável, link que abre dentro do app, mensagem que não chega, "(editada)" que não aparece, "Você só pode editar as suas mensagens" ou citação errada.
---

# Mensagens

Mensagens dos canais de texto e das conversas privadas (`dm`). Anexos têm skill própria (`concord-attachments`),
apagar fica na moderação (`concord-moderation`) e mensagens de ferramenta na `concord-tools`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/message.ts` | `Message` (com `editedAt?` e `replyTo?`), `ReplyPreview`, `replyPreviewText` (mesmo resumo no servidor e na tela), `REPLY_PREVIEW_MAX` (100), `SendMessagePayload.replyToId?`, `EditMessagePayload`, `MessageEdited`, eventos. |
| `server/modules/messages.ts` | `message:history`, `message:send` (fila por conexão), `message:edit`, `typing`. |
| `server/repo/messages.ts` | `listMessages` (página + `editedAt` + citações), `insertMessage` (grava `reply_to_id`), `replyPreviews`, `findReplyTarget`, `findEditable`, `editMessage`. |
| `server/db/schema/messages.ts` | Colunas `edited_at` e `reply_to_id` (migration `0009_edit_reply`). `reply_to_id` **sem chave estrangeira** de propósito: se a original for apagada, o id fica e a leitura mostra "mensagem apagada". |
| `src/renderer/src/lib/actions/messages.ts` | `sendMessage` (leva a resposta e limpa), listeners `message:new`, `message:edited`, `message:deleted` (só as citações; a lista é da moderação), `startReply`/`cancelReply`, `startEdit`/`cancelEdit`/`editLastMessage`/`editMessage`. |
| `src/renderer/src/store/messages.ts` | `replyingTo` (por canal) e `editingMessageId` (uma por vez), além do histórico e do "digitando". |
| `components/chat/MessageActions.tsx` | Barra ao passar o mouse: Adicionar reação (quem pode `send`), Responder (quem pode `send`), Editar (autor, só texto), Apagar (autor ou `manageMessages`). |
| `components/chat/MessageEditor.tsx` | Edição no lugar: Enter salva, Shift+Enter quebra linha, Esc cancela; erro embaixo. |
| `components/chat/ReplyPreview.tsx` | `ReplyQuote` (citação clicável, "Mensagem apagada"), `ReplyBanner` ("Respondendo a Fulano" + X), `scrollToMessage` (rola e pisca com `data-highlight`), `messageElementId`. |
| `components/ChatView.tsx` | `MessageBody` troca o texto pelo editor e mostra "(editada)" (hora no título); `MessageItem` põe o id `msg-<id>`, a citação em cima do nome e nunca deixa uma resposta compacta. |
| `components/chat/Composer.tsx` | Faixa de resposta, Esc cancela a resposta, seta para cima no campo vazio edita a minha última mensagem. |

## Eventos

| Evento | Payload | Resposta | Regras |
|---|---|---|---|
| `message:send` | `{ channelId, content, attachmentIds?, replyToId? }` | — (chega como `message:new`) | texto ou anexo; até 2000; `send` (e `attach` com anexo); `replyToId` só de mensagem do **mesmo canal** (senão vai sem citação); `LIMITS.message` |
| `message:edit` | `{ messageId, content }` | `OkResult` | ver abaixo |
| `message:edited` (servidor → app) | `{ channelId, messageId, content, editedAt }` | — | por `emitToViewers` |

## Editar (A15)

- Só o **autor** (nem a dona edita a dos outros) e só `kind: 'text'` (resultado de ferramenta não edita) →
  "Você só pode editar as suas mensagens".
- Precisa ainda ver o canal (senão "Mensagem não encontrada", sem vazar) e poder mandar mensagem nele.
- Texto limpo (pontas), até 2000; vazio só se a mensagem tem anexos ("A mensagem não pode ficar vazia (para
  tirar, apague)"). Mesmo texto responde `ok` sem editar nem avisar. Gasta `LIMITS.message`.
- O app aplica na hora (sem esperar o evento) e o `message:edited` atualiza as outras janelas e as citações.

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
| `components/chat/MessageText.tsx` | Depois de separar as menções, cada pedaço de texto passa por `splitLinks`; link vira `<a target="_blank" rel="noreferrer noopener">` com `text-primary` sublinhado e o endereço no `title`. |
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

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tests/edit-reply.test.ts` | Servidor real: editar (todos recebem, histórico, sem `editedAt` quando nunca editada, mesmo texto), recusas (outra pessoa/dona, vazia, longa, inexistente, ferramenta, canal que não vê sem vazar), responder (resumo, histórico, editar/apagar a original, outro canal/inexistente/inválido vão sem citação). |
| `src/renderer/src/lib/actions/edit-reply.test.ts` | App: resposta no envio e limpa, cancelar, apagada, `message:edited` com citações, editar (limpa, aplica, mesmo texto, erro), seta para cima. |
| `src/renderer/src/components/chat/edit-reply.test.tsx` | Tela: barra de ações por quem, editar no lugar (Enter, Esc, erro, seta para cima, "(editada)"), faixa de resposta (foco, envio, X, Esc), citação rola e pisca, "Mensagem apagada". |

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
| Pendente | Prévia de link (embed), links na citação, histórico de edições, editar anexos, responder já mencionando o autor e menção a cargo (@Moderadores). |
