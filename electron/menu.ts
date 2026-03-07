import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { dialog, Menu } from 'electron'
import { saveZoomLevel } from './zoom'

const ZOOM_STEP = 0.1
const MAX_ZOOM = 3.0
const MIN_ZOOM = 0.5
const DEFAULT_ZOOM = 1.0

function zoomIn(win: BrowserWindow): void {
  const currentZoom = win.webContents.getZoomFactor()
  const newZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM)
  win.webContents.setZoomFactor(newZoom)
  saveZoomLevel(newZoom)
}

function zoomOut(win: BrowserWindow): void {
  const currentZoom = win.webContents.getZoomFactor()
  const newZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM)
  win.webContents.setZoomFactor(newZoom)
  saveZoomLevel(newZoom)
}

function resetZoom(win: BrowserWindow): void {
  win.webContents.setZoomFactor(DEFAULT_ZOOM)
  saveZoomLevel(DEFAULT_ZOOM)
}

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
          click: () => zoomIn(win)
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+numsub',
          click: () => zoomOut(win)
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+num0',
          click: () => resetZoom(win)
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
      zoomIn(win)
      event.preventDefault()
    }
    // Ctrl/Cmd + NumpadSubtract/Minus: Zoom Out
    else if (ctrlOrCmd && input.key === '-') {
      zoomOut(win)
      event.preventDefault()
    }
    // Ctrl/Cmd + 0: Reset Zoom
    else if (ctrlOrCmd && input.key === '0') {
      resetZoom(win)
      event.preventDefault()
    }
    // Ctrl/Cmd + Shift + A: Toggle Assistant
    else if (ctrlOrCmd && input.shift && input.key === 'A') {
      win.webContents.send('toggle-assistant')
      event.preventDefault()
    }
    // F11: Toggle Fullscreen
    else if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    }
  })
}
