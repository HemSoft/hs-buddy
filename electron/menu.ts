import { dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
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
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+numadd',
          click: () => zoomIn(win),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+numsub',
          click: () => zoomOut(win),
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+num0',
          click: () => resetZoom(win),
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => win.setFullScreen(!win.isFullScreen()),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
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
              detail:
                'Your universal productivity companion\n\nVersion 0.1.0\n\n© HemSoft Developments',
            })
          },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(menuTemplate)
}

type ShortcutEntry = {
  key: string
  ctrlOrCmd?: boolean
  shift?: boolean
  action: (win: BrowserWindow) => void
}

const SHORTCUTS: ShortcutEntry[] = [
  { key: '+', ctrlOrCmd: true, action: win => zoomIn(win) },
  { key: '-', ctrlOrCmd: true, action: win => zoomOut(win) },
  { key: '0', ctrlOrCmd: true, action: win => resetZoom(win) },
  {
    key: 'A',
    ctrlOrCmd: true,
    shift: true,
    action: win => win.webContents.send('toggle-assistant'),
  },
  { key: 'Tab', ctrlOrCmd: true, shift: true, action: win => win.webContents.send('tab-prev') },
  { key: 'Tab', ctrlOrCmd: true, action: win => win.webContents.send('tab-next') },
  { key: 'F4', ctrlOrCmd: true, action: win => win.webContents.send('tab-close') },
  { key: 'F11', action: win => win.setFullScreen(!win.isFullScreen()) },
]

function matchesShortcut(entry: ShortcutEntry, input: Electron.Input): boolean {
  const ctrlOrCmd = input.control || input.meta
  if (entry.ctrlOrCmd && !ctrlOrCmd) return false
  if (entry.shift && !input.shift) return false
  return input.key === entry.key
}

export function registerKeyboardShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const matched = SHORTCUTS.find(s => matchesShortcut(s, input))
    if (matched) {
      matched.action(win)
      event.preventDefault()
    }
  })
}
