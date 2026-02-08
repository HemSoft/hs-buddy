import { ipcMain, shell } from 'electron'
import { configManager } from '../config'

export function registerConfigHandlers(): void {
  // Theme
  ipcMain.handle('config:get-theme', () => {
    return configManager.getTheme()
  })

  ipcMain.handle('config:set-theme', (_event, theme) => {
    configManager.setTheme(theme)
    return { success: true }
  })

  // Accent Color
  ipcMain.handle('config:get-accent-color', () => {
    return configManager.getAccentColor()
  })

  ipcMain.handle('config:set-accent-color', (_event, color) => {
    configManager.setAccentColor(color)
    return { success: true }
  })

  // Background Colors
  ipcMain.handle('config:get-bg-primary', () => {
    return configManager.getBgPrimary()
  })

  ipcMain.handle('config:set-bg-primary', (_event, color) => {
    configManager.setBgPrimary(color)
    return { success: true }
  })

  ipcMain.handle('config:get-bg-secondary', () => {
    return configManager.getBgSecondary()
  })

  ipcMain.handle('config:set-bg-secondary', (_event, color) => {
    configManager.setBgSecondary(color)
    return { success: true }
  })

  // Font Color
  ipcMain.handle('config:get-font-color', () => {
    return configManager.getFontColor()
  })

  ipcMain.handle('config:set-font-color', (_event, color) => {
    configManager.setFontColor(color)
    return { success: true }
  })

  // Font Family
  ipcMain.handle('config:get-font-family', () => {
    return configManager.getFontFamily()
  })

  ipcMain.handle('config:set-font-family', (_event, font) => {
    configManager.setFontFamily(font)
    return { success: true }
  })

  // Monospace Font Family
  ipcMain.handle('config:get-mono-font-family', () => {
    return configManager.getMonoFontFamily()
  })

  ipcMain.handle('config:set-mono-font-family', (_event, font) => {
    configManager.setMonoFontFamily(font)
    return { success: true }
  })

  // Zoom Level
  ipcMain.handle('config:get-zoom-level', () => {
    return configManager.getZoomLevel()
  })

  ipcMain.handle('config:set-zoom-level', (_event, level) => {
    configManager.setZoomLevel(level)
    return { success: true }
  })

  // Sidebar Width
  ipcMain.handle('config:get-sidebar-width', () => {
    return configManager.getSidebarWidth()
  })

  ipcMain.handle('config:set-sidebar-width', (_event, width) => {
    configManager.setSidebarWidth(width)
    return { success: true }
  })

  // Pane Sizes
  ipcMain.handle('config:get-pane-sizes', () => {
    return configManager.getPaneSizes()
  })

  ipcMain.handle('config:set-pane-sizes', (_event, sizes) => {
    configManager.setPaneSizes(sizes)
    return { success: true }
  })

  // Show Bookmarked Only
  ipcMain.handle('config:get-show-bookmarked-only', () => {
    return configManager.getShowBookmarkedOnly()
  })

  ipcMain.handle('config:set-show-bookmarked-only', (_event, value) => {
    configManager.setShowBookmarkedOnly(value)
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
