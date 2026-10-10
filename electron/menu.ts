import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { saveZoomLevel } from './zoom'
import { matchesShortcut } from '../src/utils/shortcutMatching'
import { IPC_PUSH } from '../src/ipc/contracts'

const ZOOM_STEP = 0.1
const MAX_ZOOM = 3.0
const MIN_ZOOM = 0.5
const DEFAULT_ZOOM = 1.0

export type ZoomAction = 'in' | 'out' | 'reset'

// Round to whole percent so repeated steps do not drift (1.1 + 0.1 = 1.2000000000000002).
function roundZoom(factor: number): number {
  return Math.round(factor * 100) / 100
}

/** Apply one zoom step to the window and persist the result. */
export function applyZoom(win: BrowserWindow, action: ZoomAction): void {
  const current = win.webContents.getZoomFactor()
  const target =
    action === 'reset'
      ? DEFAULT_ZOOM
      : action === 'in'
        ? Math.min(current + ZOOM_STEP, MAX_ZOOM)
        : Math.max(current - ZOOM_STEP, MIN_ZOOM)
  const zoom = roundZoom(target)
  win.webContents.setZoomFactor(zoom)
  saveZoomLevel(zoom)
}

type ShortcutEntry = {
  key: string
  ctrlOrCmd?: boolean
  shift?: boolean
  action: (win: BrowserWindow) => void
}

const SHORTCUTS: ShortcutEntry[] = [
  // Ctrl+= is the unshifted zoom-in key on most layouts; Ctrl++ and numpad + report '+'.
  {
    key: '=',
    ctrlOrCmd: true,
    action: win => {
      applyZoom(win, 'in')
    },
  },
  {
    key: '+',
    ctrlOrCmd: true,
    action: win => {
      applyZoom(win, 'in')
    },
  },
  {
    key: '-',
    ctrlOrCmd: true,
    action: win => {
      applyZoom(win, 'out')
    },
  },
  {
    key: '0',
    ctrlOrCmd: true,
    action: win => {
      applyZoom(win, 'reset')
    },
  },
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

/**
 * Explicit application menu installed at boot so Electron's default menu
 * never appears. macOS still needs the app and Edit roles: they supply the
 * standard ⌘Q/Hide/Quit accelerators and clipboard actions (⌘C/⌘V/⌘X/⌘A)
 * that the before-input-event shortcut list does not cover. Other platforms
 * get an empty menu; the frameless window hides the bar anyway.
 */
export function applicationMenuTemplate(platform: NodeJS.Platform): MenuItemConstructorOptions[] {
  return platform === 'darwin' ? [{ role: 'appMenu' }, { role: 'editMenu' }] : []
}

/** Ctrl/Cmd + mouse wheel (and trackpad pinch) arrive as zoom-changed requests. */
function registerWheelZoom(win: BrowserWindow): void {
  win.webContents.on('zoom-changed', (_event, direction) => {
    applyZoom(win, direction)
  })
}

export function bindWindowBehavior(win: BrowserWindow): void {
  registerKeyboardShortcuts(win)
  registerWheelZoom(win)
}
