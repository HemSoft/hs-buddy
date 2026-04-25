import { useEffect } from 'react'
import { lightenColor } from '../components/settings/appearanceUtils'

function applyColorProperties(
  root: HTMLElement,
  accentColor: string | null,
  bgPrimary: string | null,
  bgSecondary: string | null,
  fontColor: string | null
): void {
  if (accentColor) {
    root.style.setProperty('--accent-primary', accentColor)
    root.style.setProperty('--accent-primary-hover', lightenColor(accentColor, 15))
    root.style.setProperty('--border-focus', accentColor)
  }
  if (bgPrimary) {
    root.style.setProperty('--bg-primary', bgPrimary)
    root.style.setProperty('--panel-bg', bgPrimary)
    root.style.setProperty('--input-bg', bgPrimary)
  }
  if (bgSecondary) {
    root.style.setProperty('--bg-secondary', bgSecondary)
    root.style.setProperty('--sidebar-bg', bgSecondary)
  }
  if (fontColor) {
    root.style.setProperty('--text-primary', fontColor)
    root.style.setProperty('--text-heading', lightenColor(fontColor, 20))
  }
}

function applyMiscProperties(
  root: HTMLElement,
  statusBarBg: string | null,
  statusBarFg: string | null,
  fontFamily: string | null,
  monoFontFamily: string | null,
  zoomLevel: number | null
): void {
  if (statusBarBg) root.style.setProperty('--statusbar-bg', statusBarBg)
  if (statusBarFg) root.style.setProperty('--statusbar-fg', statusBarFg)
  if (fontFamily)
    root.style.setProperty('--font-family-ui', `'${fontFamily}', system-ui, sans-serif`)
  if (monoFontFamily)
    root.style.setProperty('--font-family-mono', `'${monoFontFamily}', Consolas, monospace`)
  if (zoomLevel && zoomLevel !== 100) root.style.fontSize = `${zoomLevel}%`
}

function applyAppearanceConfig(
  theme: string | null,
  accentColor: string | null,
  bgPrimary: string | null,
  bgSecondary: string | null,
  fontColor: string | null,
  statusBarBg: string | null,
  statusBarFg: string | null,
  fontFamily: string | null,
  monoFontFamily: string | null,
  zoomLevel: number | null
): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme || 'dark')
  applyColorProperties(root, accentColor, bgPrimary, bgSecondary, fontColor)
  applyMiscProperties(root, statusBarBg, statusBarFg, fontFamily, monoFontFamily, zoomLevel)
}

export function useAppAppearance(): void {
  useEffect(() => {
    Promise.all([
      window.ipcRenderer.invoke('config:get-theme'),
      window.ipcRenderer.invoke('config:get-accent-color'),
      window.ipcRenderer.invoke('config:get-bg-primary'),
      window.ipcRenderer.invoke('config:get-bg-secondary'),
      window.ipcRenderer.invoke('config:get-font-color'),
      window.ipcRenderer.invoke('config:get-statusbar-bg'),
      window.ipcRenderer.invoke('config:get-statusbar-fg'),
      window.ipcRenderer.invoke('config:get-font-family'),
      window.ipcRenderer.invoke('config:get-mono-font-family'),
      window.ipcRenderer.invoke('config:get-zoom-level'),
    ])
      .then(
        ([
          theme,
          accentColor,
          bgPrimary,
          bgSecondary,
          fontColor,
          statusBarBg,
          statusBarFg,
          fontFamily,
          monoFontFamily,
          zoomLevel,
        ]) => {
          applyAppearanceConfig(
            theme,
            accentColor,
            bgPrimary,
            bgSecondary,
            fontColor,
            statusBarBg,
            statusBarFg,
            fontFamily,
            monoFontFamily,
            zoomLevel
          )
        }
      )
      .catch(() => {
        document.documentElement.setAttribute('data-theme', 'dark')
      })
  }, [])
}
