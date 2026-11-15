import './assets/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startOverlay } from './lib/actions/overlay'
import { startUpdates } from './lib/actions/updates'
import { applyTheme, loadLocalTheme } from './lib/theme/apply'

// O último tema desta máquina já na abertura (antes do login); depois do login vale o da conta.
applyTheme(loadLocalTheme(), { animate: false })
// B15: overlay em jogos acompanha a minha sala de voz (só no Electron)
startOverlay()
// A13: aviso de versão nova baixada (só no app instalado)
startUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
