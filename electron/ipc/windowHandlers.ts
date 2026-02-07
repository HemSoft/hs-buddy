import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'

export function registerWindowHandlers(win: BrowserWindow): void {
  ipcMain.on('window-minimize', () => {
    win.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    win.close()
  })

  ipcMain.on('toggle-devtools', () => {
    win.webContents.toggleDevTools()
  })
}
