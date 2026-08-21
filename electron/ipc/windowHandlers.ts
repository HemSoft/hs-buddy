import { ipcMain } from 'electron'
import { IPC_SEND } from '../../src/ipc/contracts'
import { getSenderWindow } from './windowProvider'

export function registerWindowHandlers(): void {
  ipcMain.on(IPC_SEND.WINDOW_MINIMIZE, event => {
    getSenderWindow(event.sender)?.minimize()
  })

  ipcMain.on(IPC_SEND.WINDOW_MAXIMIZE, event => {
    const win = getSenderWindow(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(IPC_SEND.WINDOW_CLOSE, event => {
    getSenderWindow(event.sender)?.close()
  })

  ipcMain.on(IPC_SEND.TOGGLE_DEVTOOLS, event => {
    getSenderWindow(event.sender)?.webContents.toggleDevTools()
  })
}
