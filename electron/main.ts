import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

// Zoom level persistence
const getZoomConfigPath = () => path.join(app.getPath('userData'), 'zoom-level.json')

function loadZoomLevel(): number {
  try {
    const configPath = getZoomConfigPath()
    if (existsSync(configPath)) {
      const data = JSON.parse(readFileSync(configPath, 'utf-8'))
      return data.zoomFactor || 1.0
    }
  } catch (err) {
    console.error('[zoom] Failed to load zoom level:', err)
  }
  return 1.0
}

function saveZoomLevel(zoomFactor: number): void {
  try {
    writeFileSync(getZoomConfigPath(), JSON.stringify({ zoomFactor }))
  } catch (err) {
    console.error('[zoom] Failed to save zoom level:', err)
  }
}

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

  // Build application menu
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+numadd',
          click: () => {
            if (win) {
              const currentZoom = win.webContents.getZoomFactor()
              const newZoom = Math.min(currentZoom + 0.1, 3.0)
              win.webContents.setZoomFactor(newZoom)
              saveZoomLevel(newZoom)
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+numsub',
          click: () => {
            if (win) {
              const currentZoom = win.webContents.getZoomFactor()
              const newZoom = Math.max(currentZoom - 0.1, 0.5)
              win.webContents.setZoomFactor(newZoom)
              saveZoomLevel(newZoom)
            }
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+num0',
          click: () => {
            if (win) {
              win.webContents.setZoomFactor(1.0)
              saveZoomLevel(1.0)
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => win?.setFullScreen(!win?.isFullScreen())
        },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Buddy',
          click: () => {
            if (win) {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'About Buddy',
                message: 'Buddy',
                detail: 'Your universal productivity companion\n\nVersion 0.1.0\n\n© HemSoft Developments',
              })
            }
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

  // Handle keyboard shortcuts only when app is focused (not global)
  win?.webContents.on('before-input-event', (event, input) => {
    if (!win) return

    const ctrlOrCmd = input.control || input.meta

    // Ctrl/Cmd + NumpadAdd/Plus: Zoom In
    if (ctrlOrCmd && input.key === '+') {
      const currentZoom = win.webContents.getZoomFactor()
      const newZoom = Math.min(currentZoom + 0.1, 3.0)
      win.webContents.setZoomFactor(newZoom)
      saveZoomLevel(newZoom)
      event.preventDefault()
    }
    // Ctrl/Cmd + NumpadSubtract/Minus: Zoom Out
    else if (ctrlOrCmd && input.key === '-') {
      const currentZoom = win.webContents.getZoomFactor()
      const newZoom = Math.max(currentZoom - 0.1, 0.5)
      win.webContents.setZoomFactor(newZoom)
      saveZoomLevel(newZoom)
      event.preventDefault()
    }
    // Ctrl/Cmd + 0: Reset Zoom
    else if (ctrlOrCmd && input.key === '0') {
      win.webContents.setZoomFactor(1.0)
      saveZoomLevel(1.0)
      event.preventDefault()
    }
    // F11: Toggle Fullscreen
    else if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    }
  })
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

// GitHub CLI authentication - supports per-account tokens
ipcMain.handle('github:get-cli-token', async (_event, username?: string) => {
  try {
    // Use --user flag to get account-specific token if username provided
    const command = username ? `gh auth token --user ${username}` : 'gh auth token'
    const { stdout, stderr } = await execAsync(command, {
      encoding: 'utf8',
      timeout: 5000,
    })
    
    if (stderr && !stderr.includes('Logging in to')) {
      console.warn('gh auth token stderr:', stderr)
    }
    
    const token = stdout.trim()
    if (!token || token.length === 0) {
      throw new Error(`GitHub CLI returned empty token${username ? ` for account '${username}'` : ''}`)
    }
    
    return token
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Failed to get GitHub CLI token:', errorMessage)
    
    // Provide helpful error message
    if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
      throw new Error('GitHub CLI (gh) is not installed. Install from: https://cli.github.com/')
    } else if (errorMessage.includes('not logged in')) {
      throw new Error(`Not logged in to GitHub CLI${username ? ` for account '${username}'` : ''}. Run: gh auth login`)
    } else if (errorMessage.includes('no account found')) {
      throw new Error(`GitHub account '${username}' not found in GitHub CLI. Run: gh auth login -h github.com`)
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

// Accent Color
ipcMain.handle('config:get-accent-color', () => {
  return configManager.getAccentColor()
})

ipcMain.handle('config:set-accent-color', (_event, color) => {
  configManager.setAccentColor(color)
  return { success: true }
})

// Background Colors
ipcMain.handle('config:get-bg-primary', () => {
  return configManager.getBgPrimary()
})

ipcMain.handle('config:set-bg-primary', (_event, color) => {
  configManager.setBgPrimary(color)
  return { success: true }
})

ipcMain.handle('config:get-bg-secondary', () => {
  return configManager.getBgSecondary()
})

ipcMain.handle('config:set-bg-secondary', (_event, color) => {
  configManager.setBgSecondary(color)
  return { success: true }
})

// Font Family
ipcMain.handle('config:get-font-family', () => {
  return configManager.getFontFamily()
})

ipcMain.handle('config:set-font-family', (_event, font) => {
  configManager.setFontFamily(font)
  return { success: true }
})

// Monospace Font Family
ipcMain.handle('config:get-mono-font-family', () => {
  return configManager.getMonoFontFamily()
})

ipcMain.handle('config:set-mono-font-family', (_event, font) => {
  configManager.setMonoFontFamily(font)
  return { success: true }
})

// Zoom Level
ipcMain.handle('config:get-zoom-level', () => {
  return configManager.getZoomLevel()
})

ipcMain.handle('config:set-zoom-level', (_event, level) => {
  configManager.setZoomLevel(level)
  return { success: true }
})

// System Fonts
ipcMain.handle('system:get-fonts', async () => {
  try {
    // Use PowerShell to get installed fonts on Windows
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Drawing\') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"',
      { encoding: 'utf8', timeout: 10000 }
    )
    const fonts = stdout.split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0)
      .sort()
    return fonts
  } catch (error) {
    console.error('Failed to get system fonts:', error)
    // Return a reasonable fallback list of common fonts
    return [
      'Arial', 'Calibri', 'Cambria', 'Cascadia Code', 'Cascadia Mono',
      'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact',
      'Inter', 'Lucida Console', 'Lucida Sans Unicode', 'Microsoft Sans Serif',
      'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
      'Verdana'
    ]
  }
})

ipcMain.handle('config:get-sidebar-width', () => {
  return configManager.getSidebarWidth()
})

ipcMain.handle('config:set-sidebar-width', (_event, width) => {
  configManager.setSidebarWidth(width)
  return { success: true }
})

ipcMain.handle('config:get-pane-sizes', () => {
  return configManager.getPaneSizes()
})

ipcMain.handle('config:set-pane-sizes', (_event, sizes) => {
  configManager.setPaneSizes(sizes)
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

ipcMain.handle('config:get-recently-merged-days', () => {
  return configManager.getRecentlyMergedDays()
})

ipcMain.handle('config:set-recently-merged-days', (_event, days) => {
  configManager.setRecentlyMergedDays(days)
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
