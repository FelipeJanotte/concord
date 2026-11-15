---
name: concord-attachments
description: Como funcionam os anexos do Concord (imagens e arquivos até 25 MB nas mensagens) — envio por POST /uploads com progresso, download por GET /files, tipo confirmado pelos bytes, storage em disco (FileStorage), limpeza de anexos soltos e a interface (clipe, colar, arrastar, prévia, lightbox). Use ao mexer em server/modules/uploads.ts, server/storage/**, server/repo/attachments.ts, shared/types/attachment.ts, lib/actions/uploads.ts, components/chat/{Composer,AttachmentPreview,MessageAttachments,ImageLightbox}.tsx, ou ao investigar envio que falha, imagem que não aparece, arquivo que some ou "Arquivo maior que 25 MB".
---

A documentação desta área fica em **`docs/areas/attachments.md`**. Leia esse arquivo antes de mexer no código.

Esta skill existe só para te trazer até lá: nada de conteúdo aqui, para não haver duas versões da mesma regra.
