import '../assets/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installDesktopApi } from '../lib/desktop/install'
import { applyTheme, loadLocalTheme } from '../lib/theme/apply'
import { OverlayApp } from './OverlayApp'

installDesktopApi()

applyTheme(loadLocalTheme(), { animate: false, windowEffects: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp bridge={window.api?.overlayView ?? null} />
  </StrictMode>
)
