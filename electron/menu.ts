import type { BrowserWindow } from 'electron'
import { saveZoomLevel } from './zoom'
import { matchesShortcut } from '../src/utils/shortcutMatching'
import { IPC_PUSH } from '../src/ipc/contracts'

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
    action: win => win.webContents.send(IPC_PUSH.TOGGLE_ASSISTANT),
  },
  {
    key: 'Tab',
    ctrlOrCmd: true,
    shift: true,
    action: win => win.webContents.send(IPC_PUSH.TAB_PREV),
  },
  { key: 'Tab', ctrlOrCmd: true, action: win => win.webContents.send(IPC_PUSH.TAB_NEXT) },
  { key: 'F4', ctrlOrCmd: true, action: win => win.webContents.send(IPC_PUSH.TAB_CLOSE) },
  { key: 'F11', action: win => win.setFullScreen(!win.isFullScreen()) },
]

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

export function bindWindowBehavior(win: BrowserWindow): void {
  registerKeyboardShortcuts(win)
}
