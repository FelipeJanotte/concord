/**
 * Anexos (imagens e arquivos) das mensagens.
 *
 * Fluxo: o app envia o arquivo por HTTP (`POST /uploads`, corpo = bytes do arquivo,
 * `Authorization: Bearer <token>`, `X-File-Name: <nome codificado com encodeURIComponent>`)
 * e recebe um `Attachment`. Depois manda `message:send` com `attachmentIds`.
 * Anexo que não entra numa mensagem em 1 hora é apagado.
 */

/** Tamanho máximo de um arquivo (25 MB). */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024
/** Quantos anexos cabem numa mensagem. */
export const ATTACHMENTS_PER_MESSAGE = 10
/** Tamanho máximo do nome do arquivo. */
export const ATTACHMENT_NAME_MAX = 200

/** Imagens que o app mostra direto no chat (o servidor confere pelos bytes, não pela extensão). */
export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

export interface Attachment {
  id: string
  name: string
  /** tamanho em bytes */
  size: number
  /** tipo confirmado pelos bytes para imagens; nos demais, o informado pelo app (só para exibir) */
  contentType: string
  /** caminho no servidor (`/files/<id>/<nome>`); monte o endereço com o servidor atual */
  url: string
  /** dimensões, só para imagens */
  width: number | null
  height: number | null
}

/** Resposta de `POST /uploads`. */
export type UploadResult = { ok: true; attachment: Attachment } | { ok: false; error: string }

export function isInlineImage(contentType: string): boolean {
  return (INLINE_IMAGE_TYPES as readonly string[]).includes(contentType)
}
