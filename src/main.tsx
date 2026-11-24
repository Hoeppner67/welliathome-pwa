import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import { initializeDatabase } from './data/database/appDatabase'
import { captureInstallPrompt } from './features/pwa/installPrompt'
import './styles/tokens.css'
import './styles/global.css'

window.addEventListener('beforeinstallprompt', captureInstallPrompt)

try {
  sessionStorage.removeItem('welliathome.pcloudAccessToken')
  sessionStorage.removeItem('welliathome.pcloudOAuthState')
  sessionStorage.removeItem('welliathome.googleAccessToken')
  sessionStorage.removeItem('welliathome.googleOAuthState')
} catch {
  // Session storage is optional and is no longer used for cloud sync.
}

void initializeDatabase().catch((error) => {
  console.error('[Welli@Home] Die lokale Datenbank konnte nicht initialisiert werden.', error)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
