import { ipcMain } from 'electron'
import { IPC_SEND } from '../../src/ipc/contracts'
import { applyZoom, type ZoomAction } from '../menu'
import { getSenderWindow } from './windowProvider'

const ZOOM_CHANNELS: [string, ZoomAction][] = [
  [IPC_SEND.ZOOM_IN, 'in'],
  [IPC_SEND.ZOOM_OUT, 'out'],
  [IPC_SEND.ZOOM_RESET, 'reset'],
]

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

  for (const [channel, action] of ZOOM_CHANNELS) {
    ipcMain.on(channel, event => {
      const win = getSenderWindow(event.sender)
      if (win) applyZoom(win, action)
    })
  }
}
