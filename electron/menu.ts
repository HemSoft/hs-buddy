import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { dialog, Menu } from 'electron'
import { saveZoomLevel } from './zoom'

export function buildMenu(win: BrowserWindow): Electron.Menu {
  const menuTemplate: MenuItemConstructorOptions[] = [
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
            const currentZoom = win.webContents.getZoomFactor()
            const newZoom = Math.min(currentZoom + 0.1, 3.0)
            win.webContents.setZoomFactor(newZoom)
            saveZoomLevel(newZoom)
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+numsub',
          click: () => {
            const currentZoom = win.webContents.getZoomFactor()
            const newZoom = Math.max(currentZoom - 0.1, 0.5)
            win.webContents.setZoomFactor(newZoom)
            saveZoomLevel(newZoom)
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+num0',
          click: () => {
            win.webContents.setZoomFactor(1.0)
            saveZoomLevel(1.0)
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => win.setFullScreen(!win.isFullScreen())
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
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'About Buddy',
              message: 'Buddy',
              detail: 'Your universal productivity companion\n\nVersion 0.1.0\n\n© HemSoft Developments',
            })
          }
        }
      ]
    }
  ]

  return Menu.buildFromTemplate(menuTemplate)
}

export function registerKeyboardShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
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
}
