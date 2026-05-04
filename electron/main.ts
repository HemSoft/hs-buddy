import { app, BrowserWindow, Menu, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import windowStateKeeper from 'electron-window-state'
import { initTelemetry, shutdownTelemetry, emitLog } from './telemetry'
import { configManager } from './config'
import { loadZoomLevel } from './zoom'
import { buildMenu, registerKeyboardShortcuts } from './menu'
import { registerAllHandlers } from './ipc'
import { getDispatcher, runOfflineSync } from './workers'
import { stopSharedClient } from './services/copilotClient'
import { initRalphService, shutdownRalphService } from './services/ralphService'
import {
  resolveWindowBounds as resolveWindowBoundsPure,
  type DisplayInfo,
} from '../src/utils/windowGeometry'
import { startupTimer } from '../perf/startup-timing'

// Initialize OpenTelemetry before anything else touches HTTP/DNS
await initTelemetry()

// Enable CDP remote debugging when BUDDY_DEBUG_PORT is set (e.g. via runApp.debug.ps1)
const debugPort = process.env.BUDDY_DEBUG_PORT
if (debugPort) {
  app.commandLine.appendSwitch('remote-debugging-port', debugPort)
  console.log(`[Debug] CDP remote debugging enabled on port ${debugPort}`)
}

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

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

function resolveWindowBounds(state: { x?: number; y?: number; width: number; height: number }): {
  x?: number
  y?: number
  width: number
  height: number
} {
  const savedDisplayId = configManager.getUiValue('displayId')
  const savedDisplayBounds = configManager.getUiValue('displayBounds')
  const allDisplays: DisplayInfo[] = screen.getAllDisplays().map(d => ({
    id: d.id,
    bounds: d.bounds,
    workArea: d.workArea,
  }))
  const primaryDisplay = screen.getPrimaryDisplay()

  return resolveWindowBoundsPure(state, {
    savedDisplayId,
    savedDisplayBounds,
    allDisplays,
    primaryWorkArea: primaryDisplay.workArea,
    getMatchingDisplay: bounds => {
      const d = screen.getDisplayMatching(bounds)
      return { id: d.id, bounds: d.bounds, workArea: d.workArea }
    },
  })
}

function createWindow() {
  // Load window state (position, size, etc.)
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  })

  const {
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
  } = resolveWindowBounds(mainWindowState)

  win = new BrowserWindow({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    icon: path.join(
      process.env.VITE_PUBLIC || path.join(process.env.APP_ROOT!, 'public'),
      process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      // Use isolated partition to prevent zoom level bleeding to other Electron apps
      partition: 'persist:buddy',
      // Set initial zoom from saved config
      zoomFactor: loadZoomLevel(),
    },
    title: 'Buddy',
    backgroundColor: '#1e1e1e',
  })

  // Let window state manager track window state
  mainWindowState.manage(win)

  // Track which display the window is on when it moves or the user stops resizing
  const saveCurrentDisplay = () => {
    if (!win) return
    const bounds = win.getBounds()
    const currentDisplay = screen.getDisplayMatching(bounds)
    configManager.setUiValue('displayId', currentDisplay.id)
    configManager.setUiValue('displayBounds', currentDisplay.bounds)
    configManager.setUiValue('displayWorkArea', currentDisplay.workArea)
  }

  // Save display on user-initiated moves/resizes (not immediately at startup
  // to avoid cementing a bad placement as the new source of truth)
  win.on('moved', saveCurrentDisplay)
  win.on('resize', saveCurrentDisplay)

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
    startupTimer.mark('content-loaded')
    startupTimer.report()
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
  startupTimer.mark('app-ready')

  // Initialize config manager and attempt migration from env vars
  configManager.migrateFromEnv()

  createWindow()
  startupTimer.mark('window-created')

  // Set up application menu and keyboard shortcuts
  Menu.setApplicationMenu(buildMenu(win!))
  registerKeyboardShortcuts(win!)

  // Register all IPC handlers
  registerAllHandlers(win!)

  // Recover orphaned ralph loops from a previous session
  initRalphService()

  emitLog('INFO', 'Application started', { 'app.version': app.getVersion() })

  // Process missed schedules from when the app was closed, then start polling
  runOfflineSync()
    .then(result => {
      if (result.runsCreated > 0) {
        console.log(`[Startup] Offline sync created ${result.runsCreated} catch-up run(s)`)
        emitLog('INFO', 'Offline sync completed', { 'sync.runs_created': result.runsCreated })
      }
    })
    .catch(err => {
      console.warn('[Startup] Offline sync failed (non-fatal):', err)
      emitLog('WARN', 'Offline sync failed', { 'error.message': String(err) })
    })
    .finally(() => {
      // Start the task dispatcher (polls Convex for pending runs)
      getDispatcher().start()
    })
})

// Stop the dispatcher and shared Copilot client when the app is quitting
let isQuitting = false
app.on('before-quit', event => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()

  try {
    getDispatcher().stop()
    stopSharedClient()
    shutdownRalphService()
  } catch (err: unknown) {
    console.error('[Main] Sync shutdown error:', err)
  }

  const timeout = new Promise<void>(resolve => setTimeout(resolve, 5_000))
  Promise.race([shutdownTelemetry(), timeout]).finally(() => app.quit())
})
