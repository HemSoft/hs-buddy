import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_SEND } from '../../src/ipc/contracts'

export function registerWindowHandlers(win: BrowserWindow): void {
  ipcMain.on(IPC_SEND.WINDOW_MINIMIZE, () => {
    win.minimize()
  })

  ipcMain.on(IPC_SEND.WINDOW_MAXIMIZE, () => {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(IPC_SEND.WINDOW_CLOSE, () => {
    win.close()
  })

  ipcMain.on(IPC_SEND.TOGGLE_DEVTOOLS, () => {
    win.webContents.toggleDevTools()
  })
}
