// Anexos que a pessoa está preparando no campo de mensagem (por canal).
import type { Attachment } from '@shared/types'

export interface PendingUpload {
  /** id local (antes de o servidor responder) */
  localId: string
  name: string
  size: number
  contentType: string
  /** blob: URL para miniatura de imagem, ou null */
  previewUrl: string | null
  /** 0 a 1 */
  progress: number
  status: 'uploading' | 'done' | 'error'
  error: string | null
  /** preenchido quando o envio termina */
  attachment: Attachment | null
}

export interface UploadsState {
  drafts: Record<string, PendingUpload[]>
}

export const uploadsInitial: UploadsState = {
  drafts: {}
}
