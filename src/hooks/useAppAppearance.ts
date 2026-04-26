import { useEffect } from 'react'
import { lightenColor } from '../components/settings/appearanceUtils'

interface AppearanceConfig {
  theme: string | null
  accentColor: string | null
  bgPrimary: string | null
  bgSecondary: string | null
  fontColor: string | null
  statusBarBg: string | null
  statusBarFg: string | null
  fontFamily: string | null
  monoFontFamily: string | null
  zoomLevel: number | null
}

const APPEARANCE_IPC_CHANNELS: ReadonlyArray<{ key: keyof AppearanceConfig; channel: string }> = [
  { key: 'theme', channel: 'config:get-theme' },
  { key: 'accentColor', channel: 'config:get-accent-color' },
  { key: 'bgPrimary', channel: 'config:get-bg-primary' },
  { key: 'bgSecondary', channel: 'config:get-bg-secondary' },
  { key: 'fontColor', channel: 'config:get-font-color' },
  { key: 'statusBarBg', channel: 'config:get-statusbar-bg' },
  { key: 'statusBarFg', channel: 'config:get-statusbar-fg' },
  { key: 'fontFamily', channel: 'config:get-font-family' },
  { key: 'monoFontFamily', channel: 'config:get-mono-font-family' },
  { key: 'zoomLevel', channel: 'config:get-zoom-level' },
]

function applyColorProperties(root: HTMLElement, config: AppearanceConfig): void {
  if (config.accentColor) {
    root.style.setProperty('--accent-primary', config.accentColor)
    root.style.setProperty('--accent-primary-hover', lightenColor(config.accentColor, 15))
    root.style.setProperty('--border-focus', config.accentColor)
  }
  if (config.bgPrimary) {
    root.style.setProperty('--bg-primary', config.bgPrimary)
    root.style.setProperty('--panel-bg', config.bgPrimary)
    root.style.setProperty('--input-bg', config.bgPrimary)
  }
  if (config.bgSecondary) {
    root.style.setProperty('--bg-secondary', config.bgSecondary)
    root.style.setProperty('--sidebar-bg', config.bgSecondary)
  }
  if (config.fontColor) {
    root.style.setProperty('--text-primary', config.fontColor)
    root.style.setProperty('--text-heading', lightenColor(config.fontColor, 20))
  }
}

function applyMiscProperties(root: HTMLElement, config: AppearanceConfig): void {
  if (config.statusBarBg) root.style.setProperty('--statusbar-bg', config.statusBarBg)
  if (config.statusBarFg) root.style.setProperty('--statusbar-fg', config.statusBarFg)
  if (config.fontFamily)
    root.style.setProperty('--font-family-ui', `'${config.fontFamily}', system-ui, sans-serif`)
  if (config.monoFontFamily)
    root.style.setProperty('--font-family-mono', `'${config.monoFontFamily}', Consolas, monospace`)
  if (config.zoomLevel && config.zoomLevel !== 100) root.style.fontSize = `${config.zoomLevel}%`
}

function applyAppearanceConfig(config: AppearanceConfig): void {
  const root = document.documentElement
  root.setAttribute('data-theme', config.theme || 'dark')
  applyColorProperties(root, config)
  applyMiscProperties(root, config)
}

export function useAppAppearance(): void {
  useEffect(() => {
    Promise.all(APPEARANCE_IPC_CHANNELS.map(({ channel }) => window.ipcRenderer.invoke(channel)))
      .then(results => {
        const entries = APPEARANCE_IPC_CHANNELS.map(({ key }, i) => [key, results[i]])
        applyAppearanceConfig(Object.fromEntries(entries) as AppearanceConfig)
      })
      .catch(() => {
        document.documentElement.setAttribute('data-theme', 'dark')
      })
  }, [])
}
