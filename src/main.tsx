import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installBrowserIpcMock } from './browser-ipc-mock'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ConvexClientProvider } from './providers/ConvexClientProvider'
import { dataCache } from './services/dataCache'
import { IPC_PUSH } from './ipc/contracts'
import './index.css'

// In non-Electron contexts (Lighthouse CI, browser testing), the preload bridge
// is absent. Install mock IPC APIs so the app renders its full UI shell.
// This is a no-op when window.ipcRenderer already exists (normal Electron use).
installBrowserIpcMock()

// Development-only: react-scan for render performance visibility
// Activate with: VITE_REACT_SCAN=1 bun run dev
if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === '1') {
  import('./dev/react-scan-init')
    .then(({ initReactScan }) => initReactScan())
    .catch((err: unknown) => console.warn('[react-scan] Failed to initialize:', err))
}

// Initialize the data cache from disk before rendering, so components
// can read cached PR data immediately on mount (no loading flash).
dataCache.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ConvexClientProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </ConvexClientProvider>
    </React.StrictMode>
  )

  // Remove Preload scripts loading
  postMessage({ payload: 'removeLoading' }, '*')
})

// Use contextBridge
window.ipcRenderer.on(IPC_PUSH.MAIN_PROCESS_MESSAGE, (_event, message) => {
  console.log('Message from main process:', message)
})

// Bridge Electron IPC tab events to DOM CustomEvents so React hooks can use
// standard addEventListener/removeEventListener (which works reliably with
// React StrictMode cleanup, unlike ipcRenderer.off through contextBridge).
window.ipcRenderer.on(IPC_PUSH.TAB_NEXT, () => window.dispatchEvent(new Event('app:tab-next')))
window.ipcRenderer.on(IPC_PUSH.TAB_PREV, () => window.dispatchEvent(new Event('app:tab-prev')))
window.ipcRenderer.on(IPC_PUSH.TAB_CLOSE, () => window.dispatchEvent(new Event('app:tab-close')))
