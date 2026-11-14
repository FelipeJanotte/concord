import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,
  /** Abre o navegador para o login com Google e devolve o código (fluxo loopback + PKCE). */
  googleSignIn: (clientId: string): Promise<{ code: string; codeVerifier: string; redirectUri: string }> =>
    ipcRenderer.invoke('google-sign-in', clientId)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (definido em index.d.ts)
  window.api = api
}
