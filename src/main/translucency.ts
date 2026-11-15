/**
 * Tema translúcido (vidro): liga/desliga o material do sistema na janela principal, a pedido da página
 * (IPC `window-translucency`, mandado pelo `applyTheme` quando o tema muda). Só a janela principal: o
 * overlay em jogos já é transparente e não pede. Onde o sistema não tem o efeito, não faz nada (o app
 * mostra o tema opaco). Contrato e regra de suporte em `src/shared/translucency.ts`.
 */
import { BrowserWindow, ipcMain } from 'electron'
import { release } from 'os'
import { supportsTranslucency } from '../shared/translucency'

/** O pedaço da janela que usamos (os testes trocam por um falso). */
export interface GlassWindow {
  setBackgroundMaterial?: (material: 'acrylic' | 'none') => void
  setVibrancy?: (type: 'under-window' | null) => void
  setBackgroundColor: (color: string) => void
}

/** Cor da janela sem o vidro (a mesma da criação, vista só antes da página pintar). */
export const OPAQUE_WINDOW_COLOR = '#1e1f22'

/** Aplica (ou tira) o vidro. Devolve se aplicou de fato (false = sistema sem o efeito). */
export function applyTranslucency(win: GlassWindow, on: boolean, platform: string, osRelease: string): boolean {
  if (!supportsTranslucency(platform, osRelease)) return false
  if (platform === 'darwin') win.setVibrancy?.(on ? 'under-window' : null)
  else win.setBackgroundMaterial?.(on ? 'acrylic' : 'none')
  // a página fica transparente; a cor da janela precisa ser transparente para o material aparecer
  win.setBackgroundColor(on ? '#00000000' : OPAQUE_WINDOW_COLOR)
  return true
}

export function setupTranslucency(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on('window-translucency', (event, on: unknown) => {
    const win = getMainWindow()
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return
    applyTranslucency(win, on === true, process.platform, release())
  })
}
