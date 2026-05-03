import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
  },
}))

import { ipcMain, type BrowserWindow } from 'electron'
import { registerWindowHandlers } from './windowHandlers'

describe('windowHandlers', () => {
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
    registerWindowHandlers(mockWin as unknown as BrowserWindow)
  })

  it('registers all expected IPC channels', () => {
    expect(handlers.has('window-minimize')).toBe(true)
    expect(handlers.has('window-maximize')).toBe(true)
    expect(handlers.has('window-close')).toBe(true)
    expect(handlers.has('toggle-devtools')).toBe(true)
  })

  describe('window-minimize', () => {
    it('calls win.minimize()', () => {
      handlers.get('window-minimize')!()
      expect(mockWin.minimize).toHaveBeenCalled()
    })
  })

  describe('window-maximize', () => {
    it('maximizes when not maximized', () => {
      mockWin.isMaximized.mockReturnValue(false)
      handlers.get('window-maximize')!()
      expect(mockWin.maximize).toHaveBeenCalled()
      expect(mockWin.unmaximize).not.toHaveBeenCalled()
    })

    it('unmaximizes when already maximized', () => {
      mockWin.isMaximized.mockReturnValue(true)
      handlers.get('window-maximize')!()
      expect(mockWin.unmaximize).toHaveBeenCalled()
      expect(mockWin.maximize).not.toHaveBeenCalled()
    })
  })

  describe('window-close', () => {
    it('calls win.close()', () => {
      handlers.get('window-close')!()
      expect(mockWin.close).toHaveBeenCalled()
    })
  })

  describe('toggle-devtools', () => {
    it('calls win.webContents.toggleDevTools()', () => {
      handlers.get('toggle-devtools')!()
      expect(mockWin.webContents.toggleDevTools).toHaveBeenCalled()
    })
  })
})
