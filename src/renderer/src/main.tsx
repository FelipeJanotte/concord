import './assets/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startOverlay } from './lib/actions/overlay'
import { startPushToTalk } from './lib/actions/push-to-talk'
import { loadStartup } from './lib/actions/startup'
import { startThumbar } from './lib/actions/thumbar'
import { startUpdates } from './lib/actions/updates'
import { startWindowControls } from './lib/actions/window'
import { installDesktopApi } from './lib/desktop/install'
import { applyTheme, loadLocalTheme } from './lib/theme/apply'

installDesktopApi()

// O último tema desta máquina já na abertura (antes do login); depois do login vale o da conta.
applyTheme(loadLocalTheme(), { animate: false })
// B15: overlay em jogos acompanha a minha sala de voz (só no Electron)
startOverlay()
// A13: aviso de versão nova baixada (só no app instalado)
startUpdates()
// B20: pressione para falar (a tecla é ouvida pelo processo principal)
startPushToTalk()
startWindowControls()
startThumbar()
void loadStartup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
