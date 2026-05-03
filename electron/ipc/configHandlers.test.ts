import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('../config', () => ({
  configManager: {
    getUiValue: vi.fn(),
    setUiValue: vi.fn(),
    getScheduleForecastDays: vi.fn(() => 3),
    setScheduleForecastDays: vi.fn(),
    getCopilotPRReviewPromptTemplate: vi.fn(() => ''),
    setCopilotPRReviewPromptTemplate: vi.fn(),
    getNotificationSoundEnabled: vi.fn(() => false),
    setNotificationSoundEnabled: vi.fn(),
    getNotificationSoundPath: vi.fn(() => ''),
    setNotificationSoundPath: vi.fn(),
    getFinanceWatchlist: vi.fn(() => ['AAPL']),
    setFinanceWatchlist: vi.fn(),
    getConfig: vi.fn(() => ({})),
    getStorePath: vi.fn(() => '/mock/config.json'),
    reset: vi.fn(),
  },
}))

vi.mock('../../src/utils/notificationSound', () => ({
  isSupportedNotificationSoundPath: vi.fn((p: string) => p.endsWith('.mp3') || p.endsWith('.wav')),
  getNotificationSoundMimeType: vi.fn(() => 'audio/mpeg'),
  MAX_NOTIFICATION_SOUND_BYTES: 10_000_000,
}))

vi.mock('../../src/ipc/contracts', () => ({
  CONFIG_UI_KEYS: ['theme', 'accent-color', 'zoom-level'] as const,
}))

import { ipcMain, dialog, shell } from 'electron'
import { registerConfigHandlers } from './configHandlers'
import { configManager } from '../config'

const mockConfigManager = vi.mocked(configManager)

describe('configHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerConfigHandlers()
  })

  it('registers UI value channels from CONFIG_UI_KEYS', () => {
    expect(handlers.has('config:get-theme')).toBe(true)
    expect(handlers.has('config:set-theme')).toBe(true)
    expect(handlers.has('config:get-accent-color')).toBe(true)
    expect(handlers.has('config:set-accent-color')).toBe(true)
    expect(handlers.has('config:get-zoom-level')).toBe(true)
    expect(handlers.has('config:set-zoom-level')).toBe(true)
  })

  it('registers assistant-open handlers', () => {
    expect(handlers.has('config:get-assistant-open')).toBe(true)
    expect(handlers.has('config:set-assistant-open')).toBe(true)
  })

  it('registers terminal handlers', () => {
    expect(handlers.has('config:get-terminal-open')).toBe(true)
    expect(handlers.has('config:set-terminal-open')).toBe(true)
    expect(handlers.has('config:get-terminal-panel-height')).toBe(true)
    expect(handlers.has('config:set-terminal-panel-height')).toBe(true)
  })

  it('registers notification handlers', () => {
    expect(handlers.has('config:get-notification-sound-enabled')).toBe(true)
    expect(handlers.has('config:set-notification-sound-enabled')).toBe(true)
    expect(handlers.has('config:get-notification-sound-path')).toBe(true)
    expect(handlers.has('config:set-notification-sound-path')).toBe(true)
    expect(handlers.has('config:pick-audio-file')).toBe(true)
    expect(handlers.has('config:play-notification-sound')).toBe(true)
  })

  it('registers full config handlers', () => {
    expect(handlers.has('config:get-config')).toBe(true)
    expect(handlers.has('config:get-store-path')).toBe(true)
    expect(handlers.has('config:open-in-editor')).toBe(true)
    expect(handlers.has('config:reset')).toBe(true)
  })

  describe('config:get-assistant-open', () => {
    it('returns the assistantOpen value', () => {
      mockConfigManager.getUiValue.mockReturnValue(true)
      const result = handlers.get('config:get-assistant-open')!()
      expect(mockConfigManager.getUiValue).toHaveBeenCalledWith('assistantOpen')
      expect(result).toBe(true)
    })
  })

  describe('config:set-assistant-open', () => {
    it('sets the value and returns success', () => {
      const result = handlers.get('config:set-assistant-open')!({}, true)
      expect(mockConfigManager.setUiValue).toHaveBeenCalledWith('assistantOpen', true)
      expect(result).toEqual({ success: true })
    })

    it('rejects non-boolean values', () => {
      const result = handlers.get('config:set-assistant-open')!({}, 'not-boolean')
      expect(result).toEqual({ success: false })
      expect(mockConfigManager.setUiValue).not.toHaveBeenCalled()
    })
  })

  describe('config:set-terminal-panel-height', () => {
    it('accepts valid height', () => {
      const result = handlers.get('config:set-terminal-panel-height')!({}, 300)
      expect(result).toEqual({ success: true })
      expect(mockConfigManager.setUiValue).toHaveBeenCalledWith('terminalPanelHeight', 300)
    })

    it('rejects height below minimum', () => {
      const result = handlers.get('config:set-terminal-panel-height')!({}, 50)
      expect(result).toEqual({ success: false })
    })

    it('rejects height above maximum', () => {
      const result = handlers.get('config:set-terminal-panel-height')!({}, 1500)
      expect(result).toEqual({ success: false })
    })

    it('rejects NaN', () => {
      const result = handlers.get('config:set-terminal-panel-height')!({}, NaN)
      expect(result).toEqual({ success: false })
    })
  })

  describe('config:set-notification-sound-enabled', () => {
    it('sets enabled to true', () => {
      const result = handlers.get('config:set-notification-sound-enabled')!({}, true)
      expect(result).toEqual({ success: true })
      expect(mockConfigManager.setNotificationSoundEnabled).toHaveBeenCalledWith(true)
    })

    it('rejects non-boolean', () => {
      const result = handlers.get('config:set-notification-sound-enabled')!({}, 'yes')
      expect(result).toEqual({ success: false })
    })
  })

  describe('config:set-notification-sound-path', () => {
    it('clears path when empty string provided', () => {
      const result = handlers.get('config:set-notification-sound-path')!({}, '  ')
      expect(result).toEqual({ success: true })
      expect(mockConfigManager.setNotificationSoundPath).toHaveBeenCalledWith('')
    })

    it('rejects unsupported file extension', () => {
      const result = handlers.get('config:set-notification-sound-path')!({}, '/some/file.exe')
      expect(result).toEqual({ success: false })
    })

    it('rejects non-string value', () => {
      const result = handlers.get('config:set-notification-sound-path')!({}, 123)
      expect(result).toEqual({ success: false })
    })
  })

  describe('config:pick-audio-file', () => {
    it('returns canceled when dialog is dismissed', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      })
      const result = await handlers.get('config:pick-audio-file')!()
      expect(result).toEqual({ success: false, canceled: true })
    })

    it('returns success with filePath for valid audio file', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/sound.mp3'],
      })
      const result = await handlers.get('config:pick-audio-file')!()
      expect(result).toEqual({ success: true, filePath: '/path/to/sound.mp3' })
    })
  })

  describe('config:set-finance-watchlist', () => {
    it('sets valid watchlist', () => {
      const result = handlers.get('config:set-finance-watchlist')!({}, ['AAPL', 'GOOG'])
      expect(result).toEqual({ success: true })
      expect(mockConfigManager.setFinanceWatchlist).toHaveBeenCalledWith(['AAPL', 'GOOG'])
    })

    it('rejects non-array', () => {
      const result = handlers.get('config:set-finance-watchlist')!({}, 'AAPL')
      expect(result).toEqual({ success: false })
    })

    it('rejects array with non-string elements', () => {
      const result = handlers.get('config:set-finance-watchlist')!({}, [1, 2, 3])
      expect(result).toEqual({ success: false })
    })
  })

  describe('config:get-config', () => {
    it('returns the full config', () => {
      const mockConfig = { ui: { theme: 'dark' } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockConfigManager.getConfig.mockReturnValue(mockConfig as any)
      const result = handlers.get('config:get-config')!()
      expect(result).toEqual(mockConfig)
    })
  })

  describe('config:reset', () => {
    it('calls configManager.reset and returns success', () => {
      const result = handlers.get('config:reset')!()
      expect(mockConfigManager.reset).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })
  })

  describe('config:open-in-editor', () => {
    it('opens the store path and returns success', () => {
      mockConfigManager.getStorePath.mockReturnValue('/mock/config.json')
      const result = handlers.get('config:open-in-editor')!()
      expect(shell.openPath).toHaveBeenCalledWith('/mock/config.json')
      expect(result).toEqual({ success: true })
    })
  })
})
