import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import type { AppConfig } from '../../src/types/config'
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
