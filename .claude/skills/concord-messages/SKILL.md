---
name: concord-messages
description: Como funcionam as mensagens do Concord — envio (message:send, fila por conexão, limites), histórico paginado (message:history), editar a própria mensagem (A15: message:edit/message:edited, edited_at, "(editada)", edição no lugar com Enter/Esc e seta para cima) responder citando (B18: replyToId, ReplyPreview pronto do servidor, faixa "Respondendo a", citação que rola até a original, "mensagem apagada") e reações (A16: message:react/message:reactions, tabela message_reactions, chips e seletor de emoji). Use ao mexer em server/modules/messages.ts, server/repo/messages.ts, server/db/schema/messages.ts, src/shared/types/message.ts, lib/actions/messages.ts, store/messages.ts, server/modules/reactions.ts, server/repo/reactions.ts, src/shared/types/reactions.ts, components/chat/{Composer,MessageActions,MessageEditor,ReplyPreview,Reactions}.tsx ou no MessageBody/MessageItem do ChatView, ou ao investigar mensagem que não chega, "(editada)" que não aparece, "Você só pode editar as suas mensagens" ou citação errada.
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
| `server/db/schema/reactions.ts` | Tabela `message_reactions` (mensagem, conta, emoji; chave nas três; cascade com mensagem e conta) — migration `0010_reactions`. |
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
| Pendente | Histórico de edições, editar anexos e responder com menção automática (B19). |
