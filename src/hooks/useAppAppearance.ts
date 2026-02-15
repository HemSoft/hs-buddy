import { useEffect } from 'react'

function brightenHex(color: string, amount: number): string {
  const num = parseInt(color.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0x00ff) + amount)
  const b = Math.min(255, (num & 0x0000ff) + amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

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
        root.style.setProperty('--accent-primary-hover', brightenHex(color, 38))
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
          root.style.setProperty('--text-heading', brightenHex(fontColor, Math.round((255 * 20) / 100)))
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
