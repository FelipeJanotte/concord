---
name: concord-attachments
description: Como funcionam os anexos do Concord (imagens e arquivos até 25 MB nas mensagens) — envio por POST /uploads com progresso, download por GET /files, tipo confirmado pelos bytes, storage em disco (FileStorage), limpeza de anexos soltos e a interface (clipe, colar, arrastar, prévia, lightbox). Use ao mexer em server/modules/uploads.ts, server/storage/**, server/repo/attachments.ts, shared/types/attachment.ts, lib/actions/uploads.ts, components/chat/{Composer,AttachmentPreview,MessageAttachments,ImageLightbox}.tsx, ou ao investigar envio que falha, imagem que não aparece, arquivo que some ou "Arquivo maior que 25 MB".
---

# Anexos (A2 servidor + A3 interface)

Mensagens podem levar até **10 anexos** de até **25 MB** cada. O arquivo **não** vai pelo Socket.IO: o app envia
por HTTP antes, recebe um `Attachment` e depois manda só os ids no `message:send`. Imagens PNG/JPEG/GIF/WebP
aparecem no chat; o resto vira um cartão de download.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/shared/types/attachment.ts` | Contrato: `Attachment`, `UploadResult`, limites (`ATTACHMENT_MAX_BYTES`, `ATTACHMENTS_PER_MESSAGE`, `ATTACHMENT_NAME_MAX`), `INLINE_IMAGE_TYPES`, `isInlineImage()`. |
| `server/modules/uploads.ts` | Rotas `POST /uploads` e `GET /files/<id>/<nome>`, `cleanFileName()`, limpeza (`sweepUnattached`, `sweepOrphanFiles`) no `init()`. |
| `server/storage/index.ts` | Interface `FileStorage` (`save`, `open`, `remove`, `list`) e `diskStorage(dir)` em `DATA_DIR/uploads/<id>`. |
| `server/storage/sniff.ts` | `sniffImage(head)`: tipo e dimensões da imagem pelos primeiros bytes. |
| `server/repo/attachments.ts` | Registro no banco: `insertAttachment`, `findPublishedAttachment`, `attachmentsByMessage`, `attachmentIdsInChannel`, `deleteStaleUnattached`, `existingAttachmentIds`. |
| `server/db/schema/attachments.ts` | Tabela `attachments` (`message_id` null = solto; `position` = ordem na mensagem; `check` de tamanho e nome). |
| `server/repo/messages.ts` | `insertMessage(message, attachmentIds)` liga os anexos à mensagem numa transação (tudo ou nada). |
| `src/renderer/src/lib/actions/uploads.ts` | `addFiles`, `removePendingUpload`, `clearDraft`, `isUploading`, `readyAttachmentIds`; envio por XHR em `transport.send`. |
| `src/renderer/src/store/uploads.ts` | `drafts: Record<channelId, PendingUpload[]>` (rascunho de anexos por canal). |
| `components/chat/Composer.tsx` | Botão de clipe e colar (Ctrl+V) arquivos. |
| `components/ChatView.tsx` | Área de soltar (arrastar arquivos sobre o chat). |
| `components/chat/AttachmentPreview.tsx` | Prévia no rascunho: miniatura, barra de progresso, erro, remover. |
| `components/chat/MessageAttachments.tsx` | Na mensagem: imagem inline (tamanho reservado com `fitImage`, até 400×300) ou cartão de download. |
| `components/chat/ImageLightbox.tsx` | Imagem em tamanho grande ao clicar. |

## Contrato

- **`POST /uploads`** (HTTP, não socket). Corpo = bytes do arquivo. Cabeçalhos: `Authorization: Bearer <token>`,
  `X-File-Name: <encodeURIComponent(nome)>`, `Content-Type` (só para exibir). Resposta `UploadResult`:
  `{ ok: true, attachment }` ou `{ ok: false, error }` com status 400 (vazio), 401 (sessão), 413 (> 25 MB) ou 429
  (limite, com `Retry-After`).
- **`message:send`** `{ channelId, content, attachmentIds? }`: até 10 ids (uuid, sem repetir). Texto pode ser vazio
  se houver anexo. Mensagem chega em `message:new` com `attachments: Attachment[]` na ordem enviada.
- **`GET /files/<id>/<nome>`**: devolve o arquivo. O `<nome>` é só cosmético; quem manda é o `<id>`.
- `Attachment.url` é um **caminho** (`/files/<id>/<nome>?a=…&e=…&s=…`, assinado para quem recebe); o app monta o
  endereço com `resolveServerUrl(url, serverUrl)` e nunca precisa mexer na query.

## Fluxo

```
escolhe/cola/arrasta ─► addFiles(channelId, files)
   recusa vazio, > 25 MB ou além de 10 (toast) ─► PendingUpload 'uploading' no drafts[channelId]
   ─► transport.send (XHR, progresso em upload.onprogress) ─► POST /uploads
servidor: token ─► limite 'upload' ─► Content-Length > 25 MB? 413
   ─► stream: LimitAndPeek conta bytes (413 se passar) e guarda os 256 KB iniciais
   ─► storage.save(id) grava em <id>.part e renomeia no fim (queda no meio = nada salvo)
   ─► sniffImage(começo) ─► insertAttachment (message_id null) ─► { ok, attachment }
app: PendingUpload 'done' ─► Enter ─► sendMessage espera não haver 'uploading'
   ─► message:send { attachmentIds: readyAttachmentIds } ─► insertMessage liga os anexos
   ─► message:new para todos ─► MessageAttachments
```

## Regras e limites (segurança)

- **Tamanho:** 25 MB contados nos bytes que chegam, não no `Content-Length` (que só serve para recusar cedo). O
  banco também tem `check` de 1 byte a 25 MB.
- **Tipo pelos bytes:** só PNG/JPEG/GIF/WebP confirmados por `sniffImage` viram `image/*` e são servidos
  `inline`. O `Content-Type` do app nunca decide nada (e um `image/*` declarado sem bytes de imagem vira
  `application/octet-stream`). Todo o resto sai como `application/octet-stream` + `Content-Disposition: attachment`,
  com `X-Content-Type-Options: nosniff` e `Content-Security-Policy: default-src 'none'; sandbox`: um `.html` ou
  `.svg` enviado nunca roda no app.
- **Nome:** `cleanFileName` decodifica, tira caracteres de controle e pastas (`../`), troca vazio por `arquivo` e
  corta em 200 caracteres preservando a extensão.
- **Dono e uso único:** `insertMessage` só aceita anexos do **próprio autor** que ainda não estão em mensagem
  nenhuma; se algum falhar, a mensagem inteira é descartada (nada gravado, nada emitido).
- **Download só de anexo publicado e só por link assinado (v2):** anexo solto dá 404. Cada pessoa recebe o
  `Attachment.url` com `?a=<conta>&e=<validade>&s=<assinatura>` (`server/files-signing.ts`: HMAC de
  id|conta|validade; `signMessage` no `message:new` — por pessoa, via `emitToViewers({ forAccount })` — e no
  `message:history`). No `GET /files` o servidor confere assinatura, validade (`FILE_URL_TTL_MS`, 24 h) e se **essa
  conta ainda vê o canal** da mensagem: perdeu o acesso, o link para na hora. Falha = 404. O segredo vem de
  `FILES_SIGNING_SECRET` (sem ela, sorteado no boot: links antigos param ao reiniciar e o app recebe novos ao
  reconectar). A resposta de `POST /uploads` traz o caminho sem assinatura (anexo solto não baixa mesmo).
- **Limite de requisições:** `limiters.upload` (10 de rajada, 1 a cada 6 s por conta) em
  `server/middleware/rate-limit.ts`; as mensagens seguem o limite `message`.
- **Limpeza:** anexo solto há mais de `UPLOAD_ORPHAN_TTL_MS` (1 h) é apagado a cada `UPLOAD_SWEEP_INTERVAL_MS`
  (10 min). No boot, arquivos em disco sem registro no banco são apagados. Apagar o canal apaga os arquivos das
  mensagens dele (`attachmentIdsInChannel` em `server/modules/channels.ts`).
- **Trocar o disco por S3/R2/MinIO:** implemente `FileStorage` e troque o `storage` exportado; o resto do servidor
  só usa a interface. Ids que não são uuid nunca viram caminho de arquivo (`isUuid`).
- **App:** o rascunho é por canal e sobrevive à troca de canal; `clearAllDrafts` no logout; envio cancelado
  (remover a prévia) aborta o XHR. Prévia de imagem usa `blob:` URL (revogada ao remover/enviar).

## Testes

| Arquivo | Cobre |
|---|---|
| `server/tests/uploads.test.ts` | Integração com o servidor real: envio (auth, 413 no stream e no Content-Length, vazio, nome, tipo pelos bytes, limite 429), mensagens com anexos (dono, uso único, 10 no máximo, tudo ou nada), download (inline × attachment, cabeçalhos de segurança, 404 de solto) e limpeza. |
| `server/modules/uploads.test.ts` | `cleanFileName` (decodificar, tirar pastas e controles, nome vazio, corte em 200 com extensão). |
| `server/storage/sniff.test.ts` | Assinaturas e dimensões de PNG/JPEG/GIF/WebP; arquivos truncados ou falsos. |
| `server/storage/storage.test.ts` | `diskStorage`: gravação atômica, falha no meio, ids inválidos, `list`. |
| `src/renderer/src/lib/actions/uploads.test.ts` | `addFiles` (recusas, progresso, erro, cancelar), `sendMessage` com anexos. |
| `src/renderer/src/lib/actions/xhr-upload.test.ts` | O envio por XHR (cabeçalhos, progresso, erros, abort). |
| `src/renderer/src/components/chat/chat.test.tsx` | Composer, prévia, soltar arquivos e exibição na mensagem (jsdom). |

À mão: duas janelas e duas contas; enviar imagem e PDF de ~20 MB, tentar 30 MB (recusa), colar um print com
Ctrl+V, arrastar 11 arquivos (aceita 10), reiniciar o servidor e conferir o histórico.

## Depuração

| Sintoma | Causa e solução |
|---|---|
| "Sessão inválida" no envio | Token vencido/revogado. Entre de novo. |
| "Arquivo maior que 25 MB" com arquivo menor | Proxy na frente do servidor alterando o corpo, ou `ATTACHMENT_MAX_BYTES` diferente entre app e servidor. |
| "Muitos envios seguidos" | `limiters.upload`. Em testes, `RATE_LIMIT_MULTIPLIER` relaxa os limites. |
| Imagem aparece como cartão de download | Os bytes não são PNG/JPEG/GIF/WebP de verdade (ex.: HEIC, AVIF, SVG). É o esperado. |
| Imagem quebrada no chat | O link assinado (com a query) deve dar 200; 404 = assinatura/validade inválida ou a pessoa não vê mais o canal (links também param se o servidor reiniciou sem `FILES_SIGNING_SECRET` — reconectar traz links novos). Confira o `img-src` da CSP em `src/renderer/index.html`. |
| Mensagem com anexo "sumiu" ao enviar | O servidor recusou o conjunto (anexo de outra pessoa, já usado ou apagado pela limpeza depois de 1 h solto). Nada é emitido; envie o arquivo de novo. |
| Arquivos acumulando em `DATA_DIR/uploads` | A limpeza roda no boot e a cada 10 min; veja `[uploads] ... apagado(s)` no log. `.part` são envios interrompidos. |
