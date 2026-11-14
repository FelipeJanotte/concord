/**
 * Anexos no campo de mensagem: escolher/colar/arrastar arquivos, enviar para o
 * servidor (`POST /uploads`) com progresso e, no `sendMessage`, mandar os ids.
 * O envio HTTP fica em `transport.send` (XHR, por causa do progresso), que os
 * testes substituem.
 */
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_PER_MESSAGE,
  isInlineImage,
  type Attachment,
  type UploadResult
} from '@shared/types'
import type { PendingUpload } from '@/store'
import { baseUrl, get, notify, sessionToken, set } from '../core'

export interface SendArgs {
  serverUrl: string
  token: string
  file: File
  onProgress: (fraction: number) => void
  signal: AbortSignal
}

/** Envia um arquivo com XMLHttpRequest (fetch não informa o progresso do envio). */
function xhrUpload({ serverUrl, token, file, onProgress, signal }: SendArgs): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${baseUrl(serverUrl)}/uploads`)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name))
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let body: UploadResult | null = null
      try {
        body = JSON.parse(xhr.responseText) as UploadResult
      } catch {
        // resposta sem JSON
      }
      if (xhr.status === 200 && body?.ok) resolve(body.attachment)
      else reject(new Error(body && !body.ok ? body.error : `Falha no envio (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Falha de conexão no envio'))
    xhr.onabort = () => reject(new DOMException('cancelado', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
}

export const transport = { send: xhrUpload }

const controllers = new Map<string, AbortController>()
let nextId = 0

function updateDraft(channelId: string, fn: (list: PendingUpload[]) => PendingUpload[]): void {
  set((st) => {
    const list = fn(st.drafts[channelId] ?? [])
    const drafts = { ...st.drafts }
    if (list.length) drafts[channelId] = list
    else delete drafts[channelId]
    return { drafts }
  })
}

function patchUpload(channelId: string, localId: string, patch: Partial<PendingUpload>): void {
  updateDraft(channelId, (list) => list.map((u) => (u.localId === localId ? { ...u, ...patch } : u)))
}

function previewFor(file: File): string | null {
  if (!isInlineImage(file.type) || typeof URL.createObjectURL !== 'function') return null
  return URL.createObjectURL(file)
}

function revoke(upload: PendingUpload): void {
  if (upload.previewUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(upload.previewUrl)
}

/**
 * Adiciona arquivos ao rascunho do canal e começa a enviar cada um.
 * Recusa (com aviso) arquivo vazio, acima de 25 MB ou além de 10 por mensagem.
 */
export function addFiles(channelId: string, files: Iterable<File>): void {
  const serverUrl = get().serverUrl
  const token = sessionToken()
  if (!serverUrl || !token) {
    notify('Sem conexão com o servidor')
    return
  }

  const current = get().drafts[channelId]?.length ?? 0
  const accepted: File[] = []
  for (const file of files) {
    if (file.size === 0) notify(`"${file.name}" está vazio`)
    else if (file.size > ATTACHMENT_MAX_BYTES) notify(`"${file.name}" é maior que 25 MB`)
    else if (current + accepted.length >= ATTACHMENTS_PER_MESSAGE) {
      notify(`Até ${ATTACHMENTS_PER_MESSAGE} anexos por mensagem`)
      break
    } else accepted.push(file)
  }
  if (accepted.length === 0) return

  const added: [PendingUpload, File][] = accepted.map((file) => [
    {
      localId: `up-${++nextId}`,
      name: file.name,
      size: file.size,
      contentType: file.type,
      previewUrl: previewFor(file),
      progress: 0,
      status: 'uploading',
      error: null,
      attachment: null
    },
    file
  ])
  updateDraft(channelId, (list) => [...list, ...added.map(([u]) => u)])

  for (const [upload, file] of added) {
    const controller = new AbortController()
    controllers.set(upload.localId, controller)
    transport
      .send({
        serverUrl,
        token,
        file,
        signal: controller.signal,
        onProgress: (progress) => patchUpload(channelId, upload.localId, { progress })
      })
      .then(
        (attachment) => patchUpload(channelId, upload.localId, { status: 'done', progress: 1, attachment }),
        (err: unknown) => {
          if (controller.signal.aborted) return // removido pela pessoa
          const error = err instanceof Error ? err.message : 'Falha no envio'
          patchUpload(channelId, upload.localId, { status: 'error', error })
        }
      )
      .finally(() => controllers.delete(upload.localId))
  }
}

/** Tira um anexo do rascunho (cancela o envio se ainda estiver subindo). */
export function removePendingUpload(channelId: string, localId: string): void {
  controllers.get(localId)?.abort()
  controllers.delete(localId)
  const upload = get().drafts[channelId]?.find((u) => u.localId === localId)
  if (upload) revoke(upload)
  updateDraft(channelId, (list) => list.filter((u) => u.localId !== localId))
}

/** Esvazia o rascunho do canal. `cancel` aborta envios em andamento (ex.: canal apagado). */
export function clearDraft(channelId: string, { cancel = true } = {}): void {
  for (const upload of get().drafts[channelId] ?? []) {
    if (cancel) controllers.get(upload.localId)?.abort()
    revoke(upload)
  }
  updateDraft(channelId, () => [])
}

export function clearAllDrafts(): void {
  for (const channelId of Object.keys(get().drafts)) clearDraft(channelId)
}

/** Ainda há arquivo subindo no rascunho (a mensagem espera terminar). */
export function isUploading(channelId: string): boolean {
  return (get().drafts[channelId] ?? []).some((u) => u.status === 'uploading')
}

/** Ids dos anexos já enviados, na ordem em que foram adicionados. */
export function readyAttachmentIds(channelId: string): string[] {
  return (get().drafts[channelId] ?? []).flatMap((u) => (u.status === 'done' && u.attachment ? [u.attachment.id] : []))
}
