import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import type { AppConfig } from '../../src/types/config'
import {
  getNotificationSoundMimeType,
  isSupportedNotificationSoundPath,
  MAX_NOTIFICATION_SOUND_BYTES,
} from '../../src/utils/notificationSound'
import { CONFIG_UI_KEYS, IPC_INVOKE } from '../../src/ipc/contracts'
import { configManager } from '../config'

type UiConfigKey = keyof AppConfig['ui']
type ConfigUiChannelKey = (typeof CONFIG_UI_KEYS)[number]

// Maps each contract channel key to its AppConfig['ui'] property name.
// Record<ConfigUiChannelKey, …> ensures every key from CONFIG_UI_KEYS has an
// entry — adding/removing a key in contracts.ts will produce a compile error here.
const CHANNEL_TO_CONFIG_KEY: Record<ConfigUiChannelKey, UiConfigKey> = {
  theme: 'theme',
  'accent-color': 'accentColor',
  'bg-primary': 'bgPrimary',
  'bg-secondary': 'bgSecondary',
  'statusbar-bg': 'statusBarBg',
  'statusbar-fg': 'statusBarFg',
  'font-color': 'fontColor',
  'font-family': 'fontFamily',
  'mono-font-family': 'monoFontFamily',
  'zoom-level': 'zoomLevel',
  'sidebar-width': 'sidebarWidth',
  'pane-sizes': 'paneSizes',
  'show-bookmarked-only': 'showBookmarkedOnly',
  'favorite-users': 'favoriteUsers',
  'dashboard-cards': 'dashboardCards',
  'weather-location': 'weatherLocation',
}

// Derived from CONFIG_UI_KEYS — guaranteed to stay in sync with contracts.ts
const UI_VALUE_CHANNELS: Array<readonly [ConfigUiChannelKey, UiConfigKey]> = CONFIG_UI_KEYS.map(
  key => [key, CHANNEL_TO_CONFIG_KEY[key]] as const
)

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
  ipcMain.handle(IPC_INVOKE.CONFIG_GET_ASSISTANT_OPEN, () => {
    return configManager.getUiValue('assistantOpen')
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_ASSISTANT_OPEN,
    (_event: IpcMainInvokeEvent, value: boolean) => {
      if (typeof value !== 'boolean') return { success: false }
      configManager.setUiValue('assistantOpen', value)
      return { success: true }
    }
  )

  // Terminal Panel
  ipcMain.handle(IPC_INVOKE.CONFIG_GET_TERMINAL_OPEN, () => {
    return configManager.getUiValue('terminalOpen')
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_TERMINAL_OPEN,
    (_event: IpcMainInvokeEvent, value: boolean) => {
      if (typeof value !== 'boolean') return { success: false }
      configManager.setUiValue('terminalOpen', value)
      return { success: true }
    }
  )

  ipcMain.handle(IPC_INVOKE.CONFIG_GET_TERMINAL_PANEL_HEIGHT, () => {
    return configManager.getUiValue('terminalPanelHeight')
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_TERMINAL_PANEL_HEIGHT,
    (_event: IpcMainInvokeEvent, value: number) => {
      if (!Number.isFinite(value) || value < 100 || value > 1200) return { success: false }
      configManager.setUiValue('terminalPanelHeight', value)
      return { success: true }
    }
  )

  // Schedule Forecast Days
  ipcMain.handle(IPC_INVOKE.CONFIG_GET_SCHEDULE_FORECAST_DAYS, () => {
    return configManager.getScheduleForecastDays()
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_SCHEDULE_FORECAST_DAYS,
    (_event: IpcMainInvokeEvent, days: number) => {
      configManager.setScheduleForecastDays(days)
      return { success: true }
    }
  )

  // Copilot PR Review Prompt Template
  ipcMain.handle(IPC_INVOKE.CONFIG_GET_COPILOT_PR_REVIEW_PROMPT_TEMPLATE, () => {
    return configManager.getCopilotPRReviewPromptTemplate()
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_COPILOT_PR_REVIEW_PROMPT_TEMPLATE,
    (_event: IpcMainInvokeEvent, template: string) => {
      configManager.setCopilotPRReviewPromptTemplate(template)
      return { success: true }
    }
  )

  // Notification Settings
  ipcMain.handle(IPC_INVOKE.CONFIG_GET_NOTIFICATION_SOUND_ENABLED, () => {
    return configManager.getNotificationSoundEnabled()
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_NOTIFICATION_SOUND_ENABLED,
    (_event: IpcMainInvokeEvent, enabled: boolean) => {
      if (typeof enabled !== 'boolean') return { success: false }
      configManager.setNotificationSoundEnabled(enabled)
      return { success: true }
    }
  )

  ipcMain.handle(IPC_INVOKE.CONFIG_GET_NOTIFICATION_SOUND_PATH, () => {
    return configManager.getNotificationSoundPath()
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_NOTIFICATION_SOUND_PATH,
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

  ipcMain.handle(IPC_INVOKE.CONFIG_PICK_AUDIO_FILE, async () => {
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

  ipcMain.handle(IPC_INVOKE.CONFIG_PLAY_NOTIFICATION_SOUND, async () => {
    const soundPath = configManager.getNotificationSoundPath()
    if (!isSupportedNotificationSoundPath(soundPath)) return null
    return readNotificationSoundAsBase64(soundPath)
  })

  async function readNotificationSoundAsBase64(
    soundPath: string
  ): Promise<{ base64: string; mimeType: string } | null> {
    try {
      const soundFile = await stat(soundPath)
      if (!soundFile.isFile() || soundFile.size > MAX_NOTIFICATION_SOUND_BYTES) return null
      const buffer = await readFile(soundPath)
      if (buffer.length > MAX_NOTIFICATION_SOUND_BYTES) return null
      return {
        base64: buffer.toString('base64'),
        mimeType: getNotificationSoundMimeType(soundPath),
      }
    } catch (_: unknown) {
      return null
    }
  }

  // Finance Watchlist
  ipcMain.handle(IPC_INVOKE.CONFIG_GET_FINANCE_WATCHLIST, () => {
    return configManager.getFinanceWatchlist()
  })

  ipcMain.handle(
    IPC_INVOKE.CONFIG_SET_FINANCE_WATCHLIST,
    (_event: IpcMainInvokeEvent, symbols: unknown) => {
      if (!Array.isArray(symbols) || !symbols.every(s => typeof s === 'string')) {
        return { success: false }
      }
      configManager.setFinanceWatchlist(symbols)
      return { success: true }
    }
  )

  // Full Config
  ipcMain.handle(IPC_INVOKE.CONFIG_GET_CONFIG, () => {
    return configManager.getConfig()
  })

  ipcMain.handle(IPC_INVOKE.CONFIG_GET_STORE_PATH, () => {
    return configManager.getStorePath()
  })

  ipcMain.handle(IPC_INVOKE.CONFIG_OPEN_IN_EDITOR, () => {
    shell.openPath(configManager.getStorePath())
    return { success: true }
  })

  ipcMain.handle(IPC_INVOKE.CONFIG_RESET, () => {
    configManager.reset()
    return { success: true }
  })
}
