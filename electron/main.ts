import { app, BrowserWindow, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import windowStateKeeper from 'electron-window-state'
import { configManager } from './config'
import { loadZoomLevel } from './zoom'
import { buildMenu, registerKeyboardShortcuts } from './menu'
import { registerAllHandlers } from './ipc'
import { getDispatcher, runOfflineSync } from './workers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  // Load window state (position, size, etc.)
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900
  })

  win = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC || path.join(process.env.APP_ROOT!, 'public'), 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Use isolated partition to prevent zoom level bleeding to other Electron apps
      partition: 'persist:buddy',
      // Set initial zoom from saved config
      zoomFactor: loadZoomLevel()
    },
    title: 'Buddy',
    backgroundColor: '#1e1e1e'
  })

  // Let window state manager track window state
  mainWindowState.manage(win)

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date()).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // Initialize config manager and attempt migration from env vars
  configManager.migrateFromEnv()

  createWindow()

  // Set up application menu and keyboard shortcuts
  Menu.setApplicationMenu(buildMenu(win!))
  registerKeyboardShortcuts(win!)

  // Register all IPC handlers
  registerAllHandlers(win!)

  // Process missed schedules from when the app was closed, then start polling
  runOfflineSync()
    .then((result) => {
      if (result.runsCreated > 0) {
        console.log(`[Startup] Offline sync created ${result.runsCreated} catch-up run(s)`)
      }
    })
    .catch((err) => {
      console.warn('[Startup] Offline sync failed (non-fatal):', err)
    })
    .finally(() => {
      // Start the task dispatcher (polls Convex for pending runs)
      getDispatcher().start()
    })
})

// Stop the dispatcher when the app is quitting
app.on('before-quit', () => {
  getDispatcher().stop()
})
