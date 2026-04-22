import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import type { AppConfig } from '../../src/types/config'
import {
  getNotificationSoundMimeType,
  isSupportedNotificationSoundPath,
  MAX_NOTIFICATION_SOUND_BYTES,
} from '../../src/utils/notificationSound'
import { configManager } from '../config'

type UiConfigKey = keyof AppConfig['ui']

const UI_VALUE_CHANNELS: Array<readonly [string, UiConfigKey]> = [
  ['theme', 'theme'],
  ['accent-color', 'accentColor'],
  ['bg-primary', 'bgPrimary'],
  ['bg-secondary', 'bgSecondary'],
  ['statusbar-bg', 'statusBarBg'],
  ['statusbar-fg', 'statusBarFg'],
  ['font-color', 'fontColor'],
  ['font-family', 'fontFamily'],
  ['mono-font-family', 'monoFontFamily'],
  ['zoom-level', 'zoomLevel'],
  ['sidebar-width', 'sidebarWidth'],
  ['pane-sizes', 'paneSizes'],
  ['show-bookmarked-only', 'showBookmarkedOnly'],
  ['favorite-users', 'favoriteUsers'],
  ['dashboard-cards', 'dashboardCards'],
]

function registerUiValueHandler<K extends UiConfigKey>(channel: string, key: K): void {
  ipcMain.handle(`config:get-${channel}`, () => {
    return configManager.getUiValue(key)
  })

  ipcMain.handle(
    `config:set-${channel}`,
    (_event: IpcMainInvokeEvent, value: AppConfig['ui'][K]) => {
      configManager.setUiValue(key, value)
      return { success: true }
    }
  )
}

export function registerConfigHandlers(): void {
  let lastPickedNotificationSoundPath: string | null = null

  for (const [channel, key] of UI_VALUE_CHANNELS) {
    registerUiValueHandler(channel, key)
  }

  // Assistant Open
  ipcMain.handle('config:get-assistant-open', () => {
    return configManager.getUiValue('assistantOpen')
  })

  ipcMain.handle('config:set-assistant-open', (_event: IpcMainInvokeEvent, value: boolean) => {
    if (typeof value !== 'boolean') return { success: false }
    configManager.setUiValue('assistantOpen', value)
    return { success: true }
  })

  // Terminal Panel
  ipcMain.handle('config:get-terminal-open', () => {
    return configManager.getUiValue('terminalOpen')
  })

  ipcMain.handle('config:set-terminal-open', (_event: IpcMainInvokeEvent, value: boolean) => {
    if (typeof value !== 'boolean') return { success: false }
    configManager.setUiValue('terminalOpen', value)
    return { success: true }
  })

  ipcMain.handle('config:get-terminal-panel-height', () => {
    return configManager.getUiValue('terminalPanelHeight')
  })

  ipcMain.handle(
    'config:set-terminal-panel-height',
    (_event: IpcMainInvokeEvent, value: number) => {
      if (!Number.isFinite(value) || value < 100 || value > 1200) return { success: false }
      configManager.setUiValue('terminalPanelHeight', value)
      return { success: true }
    }
  )

  // Schedule Forecast Days
  ipcMain.handle('config:get-schedule-forecast-days', () => {
    return configManager.getScheduleForecastDays()
  })

  ipcMain.handle(
    'config:set-schedule-forecast-days',
    (_event: IpcMainInvokeEvent, days: number) => {
      configManager.setScheduleForecastDays(days)
      return { success: true }
    }
  )

  // Copilot PR Review Prompt Template
  ipcMain.handle('config:get-copilot-pr-review-prompt-template', () => {
    return configManager.getCopilotPRReviewPromptTemplate()
  })

  ipcMain.handle(
    'config:set-copilot-pr-review-prompt-template',
    (_event: IpcMainInvokeEvent, template: string) => {
      configManager.setCopilotPRReviewPromptTemplate(template)
      return { success: true }
    }
  )

  // Notification Settings
  ipcMain.handle('config:get-notification-sound-enabled', () => {
    return configManager.getNotificationSoundEnabled()
  })

  ipcMain.handle(
    'config:set-notification-sound-enabled',
    (_event: IpcMainInvokeEvent, enabled: boolean) => {
      if (typeof enabled !== 'boolean') return { success: false }
      configManager.setNotificationSoundEnabled(enabled)
      return { success: true }
    }
  )

  ipcMain.handle('config:get-notification-sound-path', () => {
    return configManager.getNotificationSoundPath()
  })

  ipcMain.handle(
    'config:set-notification-sound-path',
    (_event: IpcMainInvokeEvent, filePath: string) => {
      if (typeof filePath !== 'string') return { success: false }

      const normalizedFilePath = filePath.trim()
      if (!normalizedFilePath) {
        lastPickedNotificationSoundPath = null
        configManager.setNotificationSoundPath('')
        return { success: true }
      }

      if (!isSupportedNotificationSoundPath(normalizedFilePath)) {
        return { success: false }
      }

      if (lastPickedNotificationSoundPath !== normalizedFilePath) {
        return { success: false }
      }

      configManager.setNotificationSoundPath(normalizedFilePath)
      lastPickedNotificationSoundPath = null
      return { success: true }
    }
  )

  ipcMain.handle('config:pick-audio-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select notification sound',
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      lastPickedNotificationSoundPath = null
      return { success: false, canceled: true }
    }

    const [filePath] = result.filePaths
    if (!isSupportedNotificationSoundPath(filePath)) {
      lastPickedNotificationSoundPath = null
      return { success: false }
    }

    lastPickedNotificationSoundPath = filePath
    return { success: true, filePath }
  })

  ipcMain.handle('config:play-notification-sound', async () => {
    const soundPath = configManager.getNotificationSoundPath()
    if (!isSupportedNotificationSoundPath(soundPath)) return null

    try {
      const soundFile = await stat(soundPath)
      if (!soundFile.isFile() || soundFile.size > MAX_NOTIFICATION_SOUND_BYTES) {
        return null
      }

      const buffer = await readFile(soundPath)
      if (buffer.length > MAX_NOTIFICATION_SOUND_BYTES) return null

      return {
        base64: buffer.toString('base64'),
        mimeType: getNotificationSoundMimeType(soundPath),
      }
    } catch {
      return null
    }
  })

  // Finance Watchlist
  ipcMain.handle('config:get-finance-watchlist', () => {
    return configManager.getFinanceWatchlist()
  })

  ipcMain.handle(
    'config:set-finance-watchlist',
    (_event: IpcMainInvokeEvent, symbols: unknown) => {
      if (!Array.isArray(symbols) || !symbols.every(s => typeof s === 'string')) {
        return { success: false }
      }
      configManager.setFinanceWatchlist(symbols)
      return { success: true }
    }
  )

  // Full Config
  ipcMain.handle('config:get-config', () => {
    return configManager.getConfig()
  })

  ipcMain.handle('config:get-store-path', () => {
    return configManager.getStorePath()
  })

  ipcMain.handle('config:open-in-editor', () => {
    shell.openPath(configManager.getStorePath())
    return { success: true }
  })

  ipcMain.handle('config:reset', () => {
    configManager.reset()
    return { success: true }
  })
}
