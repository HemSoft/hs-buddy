import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  dialog: { showMessageBox: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(template => ({ items: template })) },
}))

vi.mock('./zoom', () => ({
  saveZoomLevel: vi.fn(),
}))

vi.mock('../src/utils/shortcutMatching', () => ({
  matchesShortcut: vi.fn(() => false),
}))

import { buildMenu, registerKeyboardShortcuts } from './menu'

describe('menu', () => {
  const mockWin = {
    webContents: {
      getZoomFactor: vi.fn(() => 1.0),
      setZoomFactor: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    },
    setFullScreen: vi.fn(),
    isFullScreen: vi.fn(() => false),
  } as unknown as Electron.BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('buildMenu returns a menu object', () => {
    const menu = buildMenu(mockWin)
    expect(menu).toBeDefined()
    expect(menu).toHaveProperty('items')
  })

  it('registerKeyboardShortcuts attaches before-input-event listener', () => {
    registerKeyboardShortcuts(mockWin)
    expect(mockWin.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function))
  })

  it('keyboard handler ignores non-keyDown events', () => {
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    const event = { preventDefault: vi.fn() }
    handler(event, { type: 'keyUp', key: '+' })
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
