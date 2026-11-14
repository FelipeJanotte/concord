import { contextBridge, ipcRenderer } from 'electron'
import type { ScreenShareBridge, ScreenSource } from '../shared/screen'

const screen: ScreenShareBridge = {
  getSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke('screen-sources'),
  select: (sourceId: string, audio: boolean): Promise<void> => ipcRenderer.invoke('screen-select', sourceId, audio),
  canShareAudio: process.platform === 'win32'
}

const api = {
  platform: process.platform,
  /** Abre o navegador para o login com Google e devolve o código (fluxo loopback + PKCE). */
  googleSignIn: (clientId: string): Promise<{ code: string; codeVerifier: string; redirectUri: string }> =>
    ipcRenderer.invoke('google-sign-in', clientId),
  /** Compartilhamento de tela: lista telas/janelas e escolhe a fonte (ver src/main/screen-share.ts). */
  screen
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (definido em index.d.ts)
  window.api = api
}
