if (import.meta.env.DEV) {
  import('react-grab')
    .then(({ getGlobalApi }) => {
      // A previous interrupted selection can leave React Grab's page freeze active.
      // Reset it on dev reload so the app and both grab controllers receive input.
      const reactGrab = getGlobalApi()
      reactGrab?.deactivate()
      reactGrab?.reset()
    })
    .catch((error) => {
      console.error('[React Grab] Failed to initialize. Run npm run dev and retry.', error)
    })
}

import React from 'react'
import ReactDOM from 'react-dom/client'

import '@fontsource-variable/inter'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'

import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
