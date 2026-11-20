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

applyTheme(loadLocalTheme(), { animate: false })
startOverlay()
startUpdates()
startPushToTalk()
startWindowControls()
startThumbar()
void loadStartup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
