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

vi.mock('../../src/ipc/contracts', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/ipc/contracts')>()
  return {
    ...actual,
    CONFIG_UI_KEYS: ['theme', 'accent-color', 'zoom-level'] as const,
  }
})

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

  describe('UI value getters and setters', () => {
    it('config:get-theme returns theme value', () => {
      mockConfigManager.getUiValue.mockReturnValue('dark')
      const result = handlers.get('config:get-theme')!()
      expect(mockConfigManager.getUiValue).toHaveBeenCalledWith('theme')
      expect(result).toBe('dark')
    })

    it('config:set-theme sets theme and returns success', () => {
      const result = handlers.get('config:set-theme')!({}, 'light')
      expect(mockConfigManager.setUiValue).toHaveBeenCalledWith('theme', 'light')
      expect(result).toEqual({ success: true })
    })

    it('config:get-zoom-level returns zoom-level value', () => {
      mockConfigManager.getUiValue.mockReturnValue(1.5)
      const result = handlers.get('config:get-zoom-level')!()
      expect(mockConfigManager.getUiValue).toHaveBeenCalledWith('zoomLevel')
      expect(result).toBe(1.5)
    })

    it('config:set-zoom-level sets zoom-level and returns success', () => {
      const result = handlers.get('config:set-zoom-level')!({}, 1.2)
      expect(mockConfigManager.setUiValue).toHaveBeenCalledWith('zoomLevel', 1.2)
      expect(result).toEqual({ success: true })
    })
  })

  describe('terminal-open handlers', () => {
    it('config:get-terminal-open returns terminalOpen value', () => {
      mockConfigManager.getUiValue.mockReturnValue(false)
      const result = handlers.get('config:get-terminal-open')!()
      expect(mockConfigManager.getUiValue).toHaveBeenCalledWith('terminalOpen')
      expect(result).toBe(false)
    })

    it('config:set-terminal-open sets value and returns success', () => {
      const result = handlers.get('config:set-terminal-open')!({}, true)
      expect(mockConfigManager.setUiValue).toHaveBeenCalledWith('terminalOpen', true)
      expect(result).toEqual({ success: true })
    })

    it('config:set-terminal-open rejects non-boolean', () => {
      const result = handlers.get('config:set-terminal-open')!({}, 'yes')
      expect(result).toEqual({ success: false })
    })
  })

  describe('config:get-terminal-panel-height', () => {
    it('returns terminal panel height', () => {
      mockConfigManager.getUiValue.mockReturnValue(250)
      const result = handlers.get('config:get-terminal-panel-height')!()
      expect(mockConfigManager.getUiValue).toHaveBeenCalledWith('terminalPanelHeight')
      expect(result).toBe(250)
    })
  })

  describe('schedule forecast days', () => {
    it('config:get-schedule-forecast-days returns value', () => {
      const result = handlers.get('config:get-schedule-forecast-days')!()
      expect(mockConfigManager.getScheduleForecastDays).toHaveBeenCalled()
      expect(result).toBe(3)
    })

    it('config:set-schedule-forecast-days sets value', () => {
      const result = handlers.get('config:set-schedule-forecast-days')!({}, 7)
      expect(mockConfigManager.setScheduleForecastDays).toHaveBeenCalledWith(7)
      expect(result).toEqual({ success: true })
    })
  })

  describe('copilot PR review prompt template', () => {
    it('config:get-copilot-pr-review-prompt-template returns template', () => {
      const result = handlers.get('config:get-copilot-pr-review-prompt-template')!()
      expect(mockConfigManager.getCopilotPRReviewPromptTemplate).toHaveBeenCalled()
      expect(result).toBe('')
    })

    it('config:set-copilot-pr-review-prompt-template sets template', () => {
      const result = handlers.get('config:set-copilot-pr-review-prompt-template')!({}, 'template')
      expect(mockConfigManager.setCopilotPRReviewPromptTemplate).toHaveBeenCalledWith('template')
      expect(result).toEqual({ success: true })
    })
  })

  describe('notification sound path validation', () => {
    it('rejects valid path when lastPickedNotificationSoundPath does not match', () => {
      // The path is supported but doesn't match lastPickedNotificationSoundPath
      const result = handlers.get('config:set-notification-sound-path')!({}, '/sound.mp3')
      expect(result).toEqual({ success: false })
    })

    it('accepts path when it matches lastPickedNotificationSoundPath', async () => {
      // First pick the file via dialog
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/sound.mp3'],
      })
      await handlers.get('config:pick-audio-file')!()

      // Now set the path - should work because it matches
      const result = handlers.get('config:set-notification-sound-path')!({}, '/sound.mp3')
      expect(result).toEqual({ success: true })
      expect(mockConfigManager.setNotificationSoundPath).toHaveBeenCalledWith('/sound.mp3')
    })

    it('pick-audio-file rejects unsupported file type', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/document.pdf'],
      })
      const result = await handlers.get('config:pick-audio-file')!()
      expect(result).toEqual({ success: false })
    })
  })

  describe('config:get-notification-sound-enabled', () => {
    it('returns enabled value', () => {
      const result = handlers.get('config:get-notification-sound-enabled')!()
      expect(mockConfigManager.getNotificationSoundEnabled).toHaveBeenCalled()
      expect(result).toBe(false)
    })
  })

  describe('config:get-notification-sound-path', () => {
    it('returns sound path', () => {
      const result = handlers.get('config:get-notification-sound-path')!()
      expect(mockConfigManager.getNotificationSoundPath).toHaveBeenCalled()
      expect(result).toBe('')
    })
  })

  describe('config:play-notification-sound', () => {
    it('returns null when path is unsupported', async () => {
      mockConfigManager.getNotificationSoundPath.mockReturnValue('/file.txt')
      const result = await handlers.get('config:play-notification-sound')!()
      expect(result).toBeNull()
    })

    it('reads and returns base64 audio for supported path', async () => {
      const { stat, readFile } = await import('node:fs/promises')
      mockConfigManager.getNotificationSoundPath.mockReturnValue('/sound.mp3')
      vi.mocked(stat).mockResolvedValue({ isFile: () => true, size: 1000 } as never)
      vi.mocked(readFile).mockResolvedValue(Buffer.from('audio data'))
      const result = await handlers.get('config:play-notification-sound')!()
      expect(result).toEqual({
        base64: Buffer.from('audio data').toString('base64'),
        mimeType: 'audio/mpeg',
      })
    })

    it('returns null when file is too large', async () => {
      const { stat } = await import('node:fs/promises')
      mockConfigManager.getNotificationSoundPath.mockReturnValue('/sound.mp3')
      vi.mocked(stat).mockResolvedValue({ isFile: () => true, size: 20_000_000 } as never)
      const result = await handlers.get('config:play-notification-sound')!()
      expect(result).toBeNull()
    })

    it('returns null when stat fails', async () => {
      const { stat } = await import('node:fs/promises')
      mockConfigManager.getNotificationSoundPath.mockReturnValue('/sound.mp3')
      vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))
      const result = await handlers.get('config:play-notification-sound')!()
      expect(result).toBeNull()
    })

    it('returns null when path is not a file', async () => {
      const { stat } = await import('node:fs/promises')
      mockConfigManager.getNotificationSoundPath.mockReturnValue('/sound.mp3')
      vi.mocked(stat).mockResolvedValue({ isFile: () => false, size: 100 } as never)
      const result = await handlers.get('config:play-notification-sound')!()
      expect(result).toBeNull()
    })
  })

  describe('config:get-finance-watchlist', () => {
    it('returns the watchlist', () => {
      const result = handlers.get('config:get-finance-watchlist')!()
      expect(mockConfigManager.getFinanceWatchlist).toHaveBeenCalled()
      expect(result).toEqual(['AAPL'])
    })
  })

  describe('config:get-store-path', () => {
    it('returns the store path', () => {
      const result = handlers.get('config:get-store-path')!()
      expect(mockConfigManager.getStorePath).toHaveBeenCalled()
      expect(result).toBe('/mock/config.json')
    })
  })
})
