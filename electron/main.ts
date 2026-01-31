import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import windowStateKeeper from 'electron-window-state'

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

// Zoom persistence
let zoomConfigPath: string
let currentZoomFactor = 1.0

async function loadZoomFactor(): Promise<number> {
  try {
    if (existsSync(zoomConfigPath)) {
      const data = await readFile(zoomConfigPath, 'utf-8')
      const config = JSON.parse(data)
      return config.zoomFactor || 1.0
    }
  } catch (err) {
    console.error('Failed to load zoom factor:', err)
  }
  return 1.0
}

async function saveZoomFactor(zoomFactor: number): Promise<void> {
  try {
    const configDir = path.dirname(zoomConfigPath)
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true })
    }
    await writeFile(zoomConfigPath, JSON.stringify({ zoomFactor }, null, 2))
    currentZoomFactor = zoomFactor
  } catch (err) {
    console.error('Failed to save zoom factor:', err)
  }
}

async function createWindow() {
  // Load zoom factor
  currentZoomFactor = await loadZoomFactor()

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'hs-buddy',
    backgroundColor: '#1e1e1e'
  })

  // Let window state manager track window state
  mainWindowState.manage(win)

  // Apply saved zoom factor
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date()).toLocaleString())
    if (win && currentZoomFactor !== 1.0) {
      win.webContents.setZoomFactor(currentZoomFactor)
    }
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
  // Set zoom config path
  zoomConfigPath = path.join(app.getPath('userData'), 'zoom-config.json')

  createWindow()

  // Register global shortcuts
  globalShortcut.register('F11', () => {
    if (win) {
      win.setFullScreen(!win.isFullScreen())
    }
  })

  // Zoom shortcuts
  globalShortcut.register('CommandOrControl+numadd', () => {
    if (win) {
      const newZoom = Math.min(currentZoomFactor + 0.1, 3.0)
      win.webContents.setZoomFactor(newZoom)
      saveZoomFactor(newZoom)
    }
  })

  globalShortcut.register('CommandOrControl+numsub', () => {
    if (win) {
      const newZoom = Math.max(currentZoomFactor - 0.1, 0.5)
      win.webContents.setZoomFactor(newZoom)
      saveZoomFactor(newZoom)
    }
  })

  globalShortcut.register('CommandOrControl+num0', () => {
    if (win) {
      win.webContents.setZoomFactor(1.0)
      saveZoomFactor(1.0)
    }
  })
})

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll()
})

// IPC handlers for window controls
ipcMain.on('window-minimize', () => {
  win?.minimize()
})

ipcMain.on('window-maximize', () => {
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
})

ipcMain.on('window-close', () => {
  win?.close()
})
