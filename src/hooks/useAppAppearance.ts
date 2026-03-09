import { useEffect } from 'react'
import { lightenColor } from '../components/settings/appearanceUtils'

export function useAppAppearance(): void {
  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-theme')
      .then((theme: 'dark' | 'light') => {
        document.documentElement.setAttribute('data-theme', theme || 'dark')
      })
      .catch(() => {
        document.documentElement.setAttribute('data-theme', 'dark')
      })
  }, [])

  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-accent-color')
      .then((color: string) => {
        if (!color) {
          return
        }

        const root = document.documentElement
        root.style.setProperty('--accent-primary', color)
        root.style.setProperty('--accent-primary-hover', lightenColor(color, 15))
        root.style.setProperty('--border-focus', color)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      window.ipcRenderer.invoke('config:get-bg-primary'),
      window.ipcRenderer.invoke('config:get-bg-secondary'),
      window.ipcRenderer.invoke('config:get-font-color'),
      window.ipcRenderer.invoke('config:get-statusbar-bg'),
      window.ipcRenderer.invoke('config:get-statusbar-fg'),
    ])
      .then(([bgPrimary, bgSecondary, fontColor, statusBarBg, statusBarFg]) => {
        const root = document.documentElement
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
        if (statusBarBg) {
          root.style.setProperty('--statusbar-bg', statusBarBg)
        }
        if (statusBarFg) {
          root.style.setProperty('--statusbar-fg', statusBarFg)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      window.ipcRenderer.invoke('config:get-font-family'),
      window.ipcRenderer.invoke('config:get-mono-font-family'),
      window.ipcRenderer.invoke('config:get-zoom-level'),
    ])
      .then(([fontFamily, monoFontFamily, zoomLevel]) => {
        if (fontFamily) {
          document.documentElement.style.setProperty(
            '--font-family-ui',
            `'${fontFamily}', system-ui, sans-serif`
          )
        }
        if (monoFontFamily) {
          document.documentElement.style.setProperty(
            '--font-family-mono',
            `'${monoFontFamily}', Consolas, monospace`
          )
        }
        if (zoomLevel && zoomLevel !== 100) {
          document.documentElement.style.fontSize = `${zoomLevel}%`
        }
      })
      .catch(() => {
        // Use defaults on error
      })
  }, [])
}
