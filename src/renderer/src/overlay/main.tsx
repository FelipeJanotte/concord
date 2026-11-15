// Página da janela do overlay em jogos (B15). Recebe a sala e a configuração pelo preload
// (`window.api.overlayView`) e só desenha; não fala com o servidor.
import '../assets/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, loadLocalTheme } from '../lib/theme/apply'
import { OverlayApp } from './OverlayApp'

// as mesmas cores do app (último tema desta máquina)
applyTheme(loadLocalTheme(), { animate: false, windowEffects: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp bridge={window.api?.overlayView ?? null} />
  </StrictMode>
)
