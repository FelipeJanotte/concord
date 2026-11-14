/**
 * Compartilhamento de tela no Electron (task B3). Skill `concord-voice`.
 *
 * O Electron não tem o seletor de tela do Chrome. O fluxo é:
 * 1. o app pede as fontes (`screen-sources`) e mostra o seletor próprio (ScreenPicker);
 * 2. a pessoa escolhe; o app manda `screen-select(id, áudio)`, que fica guardado aqui;
 * 3. o LiveKit chama `getDisplayMedia`, e o handler entrega a fonte escolhida.
 * Sem escolha pendente (ou escolha velha), o pedido é recusado.
 */
import { desktopCapturer, ipcMain, session, type DesktopCapturerSource, type Streams } from 'electron'
import type { ScreenSource } from '../shared/screen'

/** A escolha vale só para o próximo getDisplayMedia, e só por alguns segundos. */
const SELECTION_TTL_MS = 15_000

export const canShareAudio = process.platform === 'win32'

interface Deps {
  getSources: () => Promise<DesktopCapturerSource[]>
  now: () => number
  canShareAudio: boolean
}

export function createScreenShareController(deps: Deps) {
  /** fontes da última listagem: só elas podem ser escolhidas */
  let known = new Map<string, DesktopCapturerSource>()
  let pending: { source: DesktopCapturerSource; audio: boolean; at: number } | null = null

  return {
    async listSources(): Promise<ScreenSource[]> {
      const sources = await deps.getSources()
      known = new Map(sources.map((s) => [s.id, s]))
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
      }))
    },

    select(sourceId: unknown, audio: unknown): void {
      const source = typeof sourceId === 'string' ? known.get(sourceId) : undefined
      if (!source) throw new Error('Essa tela ou janela não está mais disponível. Abra o seletor de novo.')
      pending = { source, audio: audio === true && deps.canShareAudio, at: deps.now() }
    },

    /** Resposta para o `setDisplayMediaRequestHandler`. Consome a escolha. */
    takeStreams(): Streams | null {
      const choice = pending
      pending = null
      if (!choice || deps.now() - choice.at > SELECTION_TTL_MS) return null
      // 'loopback' = áudio do sistema inteiro (Windows). Inclui o que o próprio Concord toca.
      return choice.audio ? { video: choice.source, audio: 'loopback' } : { video: choice.source }
    }
  }
}

export function setupScreenShare(): void {
  const controller = createScreenShareController({
    getSources: () =>
      desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true }),
    now: Date.now,
    canShareAudio
  })

  ipcMain.handle('screen-sources', () => controller.listSources())
  ipcMain.handle('screen-select', (_event, sourceId: unknown, audio: unknown) => controller.select(sourceId, audio))

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const streams = controller.takeStreams()
    // Sem fonte escolhida pelo seletor do Concord: recusa (o getDisplayMedia rejeita).
    callback(streams ?? {})
  })
}
