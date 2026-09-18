if (import.meta.env.DEV) {
  import('react-grab').catch((error) => {
    console.error('[React Grab] Failed to initialize. Run npm run dev and retry.', error)
  })
}

import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
