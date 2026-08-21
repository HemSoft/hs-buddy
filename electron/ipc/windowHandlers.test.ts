import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: {
    on: vi.fn(),
  },
}))

import { BrowserWindow, ipcMain } from 'electron'
import { registerWindowHandlers } from './windowHandlers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handlers: Map<string, (...args: any[]) => any>
let mockWin: {
  minimize: ReturnType<typeof vi.fn>
  maximize: ReturnType<typeof vi.fn>
  unmaximize: ReturnType<typeof vi.fn>
  isMaximized: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  webContents: { toggleDevTools: ReturnType<typeof vi.fn> }
}
const sender = {} as Electron.WebContents

function send(channel: string): void {
  handlers.get(channel)!({ sender })
}

beforeEach(() => {
  vi.clearAllMocks()
  handlers = new Map()
  vi.mocked(ipcMain.on).mockImplementation((channel, handler) => {
    handlers.set(channel, handler)
    return ipcMain
  })
  mockWin = {
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    close: vi.fn(),
    webContents: { toggleDevTools: vi.fn() },
  }
  vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(
    mockWin as unknown as Electron.BrowserWindow
  )
  registerWindowHandlers()
})

describe('window handlers', () => {
  it('registers all expected IPC channels', () => {
    expect(handlers.has('window-minimize')).toBe(true)
    expect(handlers.has('window-maximize')).toBe(true)
    expect(handlers.has('window-close')).toBe(true)
    expect(handlers.has('toggle-devtools')).toBe(true)
  })

  describe('window-minimize', () => {
    it('calls win.minimize()', () => {
      send('window-minimize')
      expect(mockWin.minimize).toHaveBeenCalled()
    })
  })

  describe('window-maximize', () => {
    it('maximizes when not maximized', () => {
      mockWin.isMaximized.mockReturnValue(false)
      send('window-maximize')
      expect(mockWin.maximize).toHaveBeenCalled()
      expect(mockWin.unmaximize).not.toHaveBeenCalled()
    })

    it('unmaximizes when already maximized', () => {
      mockWin.isMaximized.mockReturnValue(true)
      send('window-maximize')
      expect(mockWin.unmaximize).toHaveBeenCalled()
      expect(mockWin.maximize).not.toHaveBeenCalled()
    })
  })

  describe('window-close', () => {
    it('calls win.close()', () => {
      send('window-close')
      expect(mockWin.close).toHaveBeenCalled()
    })
  })

  describe('toggle-devtools', () => {
    it('calls win.webContents.toggleDevTools()', () => {
      send('toggle-devtools')
      expect(mockWin.webContents.toggleDevTools).toHaveBeenCalled()
    })
  })
})

describe('window sender resolution', () => {
  it('ignores window events whose sender is not attached to a window', () => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

    send('window-minimize')
    send('window-maximize')
    send('window-close')
    send('toggle-devtools')

    expect(mockWin.minimize).not.toHaveBeenCalled()
    expect(mockWin.maximize).not.toHaveBeenCalled()
    expect(mockWin.close).not.toHaveBeenCalled()
    expect(mockWin.webContents.toggleDevTools).not.toHaveBeenCalled()
  })
})
