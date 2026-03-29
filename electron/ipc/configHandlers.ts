import { ipcMain, shell } from 'electron'
import { configManager } from '../config'

export function registerConfigHandlers(): void {
  // Theme
  ipcMain.handle('config:get-theme', () => {
    return configManager.getUiValue('theme')
  })

  ipcMain.handle('config:set-theme', (_event, theme) => {
    configManager.setUiValue('theme', theme)
    return { success: true }
  })

  // Accent Color
  ipcMain.handle('config:get-accent-color', () => {
    return configManager.getUiValue('accentColor')
  })

  ipcMain.handle('config:set-accent-color', (_event, color) => {
    configManager.setUiValue('accentColor', color)
    return { success: true }
  })

  // Background Colors
  ipcMain.handle('config:get-bg-primary', () => {
    return configManager.getUiValue('bgPrimary')
  })

  ipcMain.handle('config:set-bg-primary', (_event, color) => {
    configManager.setUiValue('bgPrimary', color)
    return { success: true }
  })

  ipcMain.handle('config:get-bg-secondary', () => {
    return configManager.getUiValue('bgSecondary')
  })

  ipcMain.handle('config:set-bg-secondary', (_event, color) => {
    configManager.setUiValue('bgSecondary', color)
    return { success: true }
  })

  // Status Bar Colors
  ipcMain.handle('config:get-statusbar-bg', () => {
    return configManager.getUiValue('statusBarBg')
  })

  ipcMain.handle('config:set-statusbar-bg', (_event, color) => {
    configManager.setUiValue('statusBarBg', color)
    return { success: true }
  })

  ipcMain.handle('config:get-statusbar-fg', () => {
    return configManager.getUiValue('statusBarFg')
  })

  ipcMain.handle('config:set-statusbar-fg', (_event, color) => {
    configManager.setUiValue('statusBarFg', color)
    return { success: true }
  })

  // Font Color
  ipcMain.handle('config:get-font-color', () => {
    return configManager.getUiValue('fontColor')
  })

  ipcMain.handle('config:set-font-color', (_event, color) => {
    configManager.setUiValue('fontColor', color)
    return { success: true }
  })

  // Font Family
  ipcMain.handle('config:get-font-family', () => {
    return configManager.getUiValue('fontFamily')
  })

  ipcMain.handle('config:set-font-family', (_event, font) => {
    configManager.setUiValue('fontFamily', font)
    return { success: true }
  })

  // Monospace Font Family
  ipcMain.handle('config:get-mono-font-family', () => {
    return configManager.getUiValue('monoFontFamily')
  })

  ipcMain.handle('config:set-mono-font-family', (_event, font) => {
    configManager.setUiValue('monoFontFamily', font)
    return { success: true }
  })

  // Zoom Level
  ipcMain.handle('config:get-zoom-level', () => {
    return configManager.getUiValue('zoomLevel')
  })

  ipcMain.handle('config:set-zoom-level', (_event, level) => {
    configManager.setUiValue('zoomLevel', level)
    return { success: true }
  })

  // Sidebar Width
  ipcMain.handle('config:get-sidebar-width', () => {
    return configManager.getUiValue('sidebarWidth')
  })

  ipcMain.handle('config:set-sidebar-width', (_event, width) => {
    configManager.setUiValue('sidebarWidth', width)
    return { success: true }
  })

  // Pane Sizes
  ipcMain.handle('config:get-pane-sizes', () => {
    return configManager.getUiValue('paneSizes')
  })

  ipcMain.handle('config:set-pane-sizes', (_event, sizes) => {
    configManager.setUiValue('paneSizes', sizes)
    return { success: true }
  })

  // Show Bookmarked Only
  ipcMain.handle('config:get-show-bookmarked-only', () => {
    return configManager.getUiValue('showBookmarkedOnly')
  })

  ipcMain.handle('config:set-show-bookmarked-only', (_event, value) => {
    configManager.setUiValue('showBookmarkedOnly', value)
    return { success: true }
  })

  // Favorite Users
  ipcMain.handle('config:get-favorite-users', () => {
    return configManager.getUiValue('favoriteUsers')
  })

  ipcMain.handle('config:set-favorite-users', (_event, users) => {
    configManager.setUiValue('favoriteUsers', users)
    return { success: true }
  })

  // Assistant Open
  ipcMain.handle('config:get-assistant-open', () => {
    return configManager.getUiValue('assistantOpen')
  })

  ipcMain.handle('config:set-assistant-open', (_event, value) => {
    if (typeof value !== 'boolean') return { success: false }
    configManager.setUiValue('assistantOpen', value)
    return { success: true }
  })

  // Schedule Forecast Days
  ipcMain.handle('config:get-schedule-forecast-days', () => {
    return configManager.getScheduleForecastDays()
  })

  ipcMain.handle('config:set-schedule-forecast-days', (_event, days) => {
    configManager.setScheduleForecastDays(days)
    return { success: true }
  })

  // Copilot PR Review Prompt Template
  ipcMain.handle('config:get-copilot-pr-review-prompt-template', () => {
    return configManager.getCopilotPRReviewPromptTemplate()
  })

  ipcMain.handle('config:set-copilot-pr-review-prompt-template', (_event, template: string) => {
    configManager.setCopilotPRReviewPromptTemplate(template)
    return { success: true }
  })

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
