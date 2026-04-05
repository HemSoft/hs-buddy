import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConvexClientProvider } from './providers/ConvexClientProvider'
import { dataCache } from './services/dataCache'
import './index.css'

// Initialize the data cache from disk before rendering, so components
// can read cached PR data immediately on mount (no loading flash).
dataCache.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ConvexClientProvider>
        <App />
      </ConvexClientProvider>
    </React.StrictMode>
  )

  // Remove Preload scripts loading
  postMessage({ payload: 'removeLoading' }, '*')
})

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log('Message from main process:', message)
})

// Bridge Electron IPC tab events to DOM CustomEvents so React hooks can use
// standard addEventListener/removeEventListener (which works reliably with
// React StrictMode cleanup, unlike ipcRenderer.off through contextBridge).
window.ipcRenderer.on('tab-next', () => window.dispatchEvent(new Event('app:tab-next')))
window.ipcRenderer.on('tab-prev', () => window.dispatchEvent(new Event('app:tab-prev')))
window.ipcRenderer.on('tab-close', () => window.dispatchEvent(new Event('app:tab-close')))
