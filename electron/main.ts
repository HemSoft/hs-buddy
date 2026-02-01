import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import windowStateKeeper from 'electron-window-state'
import { configManager } from './config'

const execAsync = promisify(exec)

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

  // Initialize config manager and attempt migration from env vars
  configManager.migrateFromEnv()

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

// GitHub CLI authentication
ipcMain.handle('github:get-cli-token', async () => {
  try {
    const { stdout, stderr } = await execAsync('gh auth token', {
      encoding: 'utf8',
      timeout: 5000,
    })
    
    if (stderr && !stderr.includes('Logging in to')) {
      console.warn('gh auth token stderr:', stderr)
    }
    
    const token = stdout.trim()
    if (!token || token.length === 0) {
      throw new Error('GitHub CLI returned empty token')
    }
    
    return token
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Failed to get GitHub CLI token:', errorMessage)
    
    // Provide helpful error message
    if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
      throw new Error('GitHub CLI (gh) is not installed. Install from: https://cli.github.com/')
    } else if (errorMessage.includes('not logged in')) {
      throw new Error('Not logged in to GitHub CLI. Run: gh auth login')
    }
    
    throw error
  }
})

// IPC handlers for configuration
// GitHub Accounts
ipcMain.handle('config:get-github-accounts', () => {
  return configManager.getGitHubAccounts()
})

ipcMain.handle('config:add-github-account', (_event, account) => {
  try {
    configManager.addGitHubAccount(account)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('config:remove-github-account', (_event, username, org) => {
  try {
    configManager.removeGitHubAccount(username, org)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('config:update-github-account', (_event, username, org, updates) => {
  try {
    configManager.updateGitHubAccount(username, org, updates)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Bitbucket Workspaces
ipcMain.handle('config:get-bitbucket-workspaces', () => {
  return configManager.getBitbucketWorkspaces()
})

ipcMain.handle('config:add-bitbucket-workspace', (_event, workspace) => {
  try {
    configManager.addBitbucketWorkspace(workspace)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('config:remove-bitbucket-workspace', (_event, workspace) => {
  try {
    configManager.removeBitbucketWorkspace(workspace)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// UI Settings
ipcMain.handle('config:get-theme', () => {
  return configManager.getTheme()
})

ipcMain.handle('config:set-theme', (_event, theme) => {
  configManager.setTheme(theme)
  return { success: true }
})

ipcMain.handle('config:get-sidebar-width', () => {
  return configManager.getSidebarWidth()
})

ipcMain.handle('config:set-sidebar-width', (_event, width) => {
  configManager.setSidebarWidth(width)
  return { success: true }
})

// PR Settings
ipcMain.handle('config:get-pr-refresh-interval', () => {
  return configManager.getPRRefreshInterval()
})

ipcMain.handle('config:set-pr-refresh-interval', (_event, minutes) => {
  configManager.setPRRefreshInterval(minutes)
  return { success: true }
})

ipcMain.handle('config:get-pr-auto-refresh', () => {
  return configManager.getPRAutoRefresh()
})

ipcMain.handle('config:set-pr-auto-refresh', (_event, enabled) => {
  configManager.setPRAutoRefresh(enabled)
  return { success: true }
})

// Full Config
ipcMain.handle('config:get-config', () => {
  return configManager.getConfig()
})

ipcMain.handle('config:get-store-path', () => {
  return configManager.getStorePath()
})

ipcMain.handle('config:open-in-editor', () => {
  shell.openPath(configManager.getStorePath())
  return { success: true }
})

ipcMain.handle('config:reset', () => {
  configManager.reset()
  return { success: true }
})

// Open external links in default browser
ipcMain.handle('shell:open-external', async (_event, url: string) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.on('window-close', () => {
  win?.close()
})
