import { app, BrowserWindow, Menu, MenuItemConstructorOptions, globalShortcut } from 'electron'
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

function createMenu() {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
          { type: 'separator' as const },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' as const },
              { role: 'stopSpeaking' as const }
            ]
          }
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const }
        ])
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+numadd',
          click: () => {
            if (win) {
              const newZoom = Math.min(currentZoomFactor + 0.1, 3.0)
              win.webContents.setZoomFactor(newZoom)
              saveZoomFactor(newZoom)
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+numsub',
          click: () => {
            if (win) {
              const newZoom = Math.max(currentZoomFactor - 0.1, 0.5)
              win.webContents.setZoomFactor(newZoom)
              saveZoomFactor(newZoom)
            }
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+num0',
          click: () => {
            if (win) {
              win.webContents.setZoomFactor(1.0)
              saveZoomFactor(1.0)
            }
          }
        },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
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

  createMenu()
  createWindow()

  // Register global shortcuts
  globalShortcut.register('F11', () => {
    if (win) {
      win.setFullScreen(!win.isFullScreen())
    }
  })
})

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll()
})
