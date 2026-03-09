import { useState, useEffect, useCallback } from 'react'
import { useConfig } from '../../hooks/useConfig'
import { RefreshCw } from 'lucide-react'
import { DARK_DEFAULTS, LIGHT_DEFAULTS, type ColorDef, lightenColor } from './appearanceUtils'
import { AppearanceThemeSection } from './AppearanceThemeSection'
import { AppearanceColorsSection } from './AppearanceColorsSection'
import { AppearanceFontsSection } from './AppearanceFontsSection'
import './SettingsShared.css'
import './SettingsAppearance.css'

export function SettingsAppearance() {
  const { config, loading, api } = useConfig()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [accentColor, setAccentColor] = useState('#0e639c')
  const [fontColor, setFontColor] = useState('#cccccc')
  const [bgPrimary, setBgPrimary] = useState('#1e1e1e')
  const [bgSecondary, setBgSecondary] = useState('#252526')
  const [statusBarBg, setStatusBarBg] = useState('#181818')
  const [statusBarFg, setStatusBarFg] = useState('#9d9d9d')
  const [fontFamily, setFontFamily] = useState('Inter')
  const [monoFontFamily, setMonoFontFamily] = useState('Cascadia Code')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [fontsLoading, setFontsLoading] = useState(true)

  useEffect(() => {
    api
      .getSystemFonts()
      .then(fonts => {
        setSystemFonts(fonts)
        setFontsLoading(false)
      })
      .catch(() => {
        setFontsLoading(false)
      })
  }, [api])

  useEffect(() => {
    if (config) {
      setTheme(config.ui.theme)
      setAccentColor(config.ui.accentColor || '#0e639c')
      setFontColor(config.ui.fontColor || '#cccccc')
      setBgPrimary(config.ui.bgPrimary || '#1e1e1e')
      setBgSecondary(config.ui.bgSecondary || '#252526')
      setStatusBarBg(config.ui.statusBarBg || '#181818')
      setStatusBarFg(config.ui.statusBarFg || '#9d9d9d')
      setFontFamily(config.ui.fontFamily || 'Inter')
      setMonoFontFamily(config.ui.monoFontFamily || 'Cascadia Code')
    }
  }, [config])

  // Apply colors to CSS variables
  const applyColors = useCallback(
    (
      accent: string,
      fontClr: string,
      primary: string,
      secondary: string,
      sbBg?: string,
      sbFg?: string
    ) => {
      const root = document.documentElement
      root.style.setProperty('--accent-primary', accent)
      root.style.setProperty('--accent-primary-hover', lightenColor(accent, 15))
      root.style.setProperty('--border-focus', accent)
      root.style.setProperty('--text-primary', fontClr)
      root.style.setProperty('--text-heading', lightenColor(fontClr, 20))
      root.style.setProperty('--bg-primary', primary)
      root.style.setProperty('--panel-bg', primary)
      root.style.setProperty('--input-bg', primary)
      root.style.setProperty('--bg-secondary', secondary)
      root.style.setProperty('--sidebar-bg', secondary)
      if (sbBg) root.style.setProperty('--statusbar-bg', sbBg)
      if (sbFg) root.style.setProperty('--statusbar-fg', sbFg)
    },
    []
  )

  const handleThemeChange = async (newTheme: 'dark' | 'light') => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)

    // Reset colors to theme defaults when switching themes
    const defaults = newTheme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS
    setAccentColor(defaults.accentColor)
    setFontColor(defaults.fontColor)
    setBgPrimary(defaults.bgPrimary)
    setBgSecondary(defaults.bgSecondary)
    setStatusBarBg(defaults.statusBarBg)
    setStatusBarFg(defaults.statusBarFg)

    // Clear inline styles so CSS variables take effect
    const root = document.documentElement
    root.style.removeProperty('--accent-primary')
    root.style.removeProperty('--accent-primary-hover')
    root.style.removeProperty('--border-focus')
    root.style.removeProperty('--text-primary')
    root.style.removeProperty('--text-heading')
    root.style.removeProperty('--bg-primary')
    root.style.removeProperty('--panel-bg')
    root.style.removeProperty('--input-bg')
    root.style.removeProperty('--bg-secondary')
    root.style.removeProperty('--sidebar-bg')
    root.style.removeProperty('--statusbar-bg')
    root.style.removeProperty('--statusbar-fg')

    await api.setTheme(newTheme)
    await Promise.all([
      api.setAccentColor(defaults.accentColor),
      api.setFontColor(defaults.fontColor),
      api.setBgPrimary(defaults.bgPrimary),
      api.setBgSecondary(defaults.bgSecondary),
      api.setStatusBarBg(defaults.statusBarBg),
      api.setStatusBarFg(defaults.statusBarFg),
    ])
  }

  const handleAccentChange = async (color: string) => {
    setAccentColor(color)
    applyColors(color, fontColor, bgPrimary, bgSecondary, statusBarBg, statusBarFg)
    await api.setAccentColor(color)
  }

  const handleFontColorChange = async (color: string) => {
    setFontColor(color)
    applyColors(accentColor, color, bgPrimary, bgSecondary, statusBarBg, statusBarFg)
    await api.setFontColor(color)
  }

  const handleBgPrimaryChange = async (color: string) => {
    setBgPrimary(color)
    applyColors(accentColor, fontColor, color, bgSecondary, statusBarBg, statusBarFg)
    await api.setBgPrimary(color)
  }

  const handleBgSecondaryChange = async (color: string) => {
    setBgSecondary(color)
    applyColors(accentColor, fontColor, bgPrimary, color, statusBarBg, statusBarFg)
    await api.setBgSecondary(color)
  }

  const handleStatusBarBgChange = async (color: string) => {
    setStatusBarBg(color)
    document.documentElement.style.setProperty('--statusbar-bg', color)
    await api.setStatusBarBg(color)
  }

  const handleStatusBarFgChange = async (color: string) => {
    setStatusBarFg(color)
    document.documentElement.style.setProperty('--statusbar-fg', color)
    await api.setStatusBarFg(color)
  }

  const handleResetColors = async () => {
    const defaults = theme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS
    setAccentColor(defaults.accentColor)
    setFontColor(defaults.fontColor)
    setBgPrimary(defaults.bgPrimary)
    setBgSecondary(defaults.bgSecondary)
    setStatusBarBg(defaults.statusBarBg)
    setStatusBarFg(defaults.statusBarFg)
    applyColors(
      defaults.accentColor,
      defaults.fontColor,
      defaults.bgPrimary,
      defaults.bgSecondary,
      defaults.statusBarBg,
      defaults.statusBarFg
    )
    await Promise.all([
      api.setAccentColor(defaults.accentColor),
      api.setFontColor(defaults.fontColor),
      api.setBgPrimary(defaults.bgPrimary),
      api.setBgSecondary(defaults.bgSecondary),
      api.setStatusBarBg(defaults.statusBarBg),
      api.setStatusBarFg(defaults.statusBarFg),
    ])
  }

  const handleFontFamilyChange = async (font: string) => {
    setFontFamily(font)
    document.documentElement.style.setProperty(
      '--font-family-ui',
      `'${font}', system-ui, sans-serif`
    )
    await api.setFontFamily(font)
  }

  const handleMonoFontFamilyChange = async (font: string) => {
    setMonoFontFamily(font)
    document.documentElement.style.setProperty(
      '--font-family-mono',
      `'${font}', Consolas, monospace`
    )
    await api.setMonoFontFamily(font)
  }

  const uiFonts = systemFonts.filter(
    f =>
      !f.toLowerCase().includes('emoji') &&
      !f.toLowerCase().includes('symbol') &&
      !f.toLowerCase().includes('webdings') &&
      !f.toLowerCase().includes('wingdings')
  )

  const monoFonts = systemFonts.filter(
    f =>
      f.toLowerCase().includes('mono') ||
      f.toLowerCase().includes('code') ||
      f.toLowerCase().includes('consola') ||
      f.toLowerCase().includes('courier') ||
      f.toLowerCase().includes('fixed') ||
      f.toLowerCase().includes('terminal') ||
      f.toLowerCase().includes('hack') ||
      f.toLowerCase().includes('fira') ||
      f.toLowerCase().includes('jetbrains') ||
      f.toLowerCase().includes('source code') ||
      f.toLowerCase().includes('roboto mono') ||
      f.toLowerCase().includes('ubuntu mono') ||
      f.toLowerCase().includes('droid sans mono') ||
      f.toLowerCase().includes('dejavu sans mono') ||
      f.toLowerCase().includes('inconsolata') ||
      f.toLowerCase().includes('menlo') ||
      f.toLowerCase().includes('sf mono')
  )

  const brandColors: ColorDef[] = [
    {
      id: 'accent-color',
      label: 'Accent',
      hint: 'Buttons, links, focus indicators',
      value: accentColor,
      onChange: handleAccentChange,
    },
    {
      id: 'font-color',
      label: 'Font',
      hint: 'Primary text and content',
      value: fontColor,
      onChange: handleFontColorChange,
    },
  ]

  const backgroundColors: ColorDef[] = [
    {
      id: 'bg-primary',
      label: 'Primary',
      hint: 'Main content area',
      value: bgPrimary,
      onChange: handleBgPrimaryChange,
    },
    {
      id: 'bg-secondary',
      label: 'Secondary',
      hint: 'Sidebar & cards',
      value: bgSecondary,
      onChange: handleBgSecondaryChange,
    },
  ]

  const statusBarColors: ColorDef[] = [
    {
      id: 'statusbar-bg',
      label: 'Background',
      hint: 'Status bar background',
      value: statusBarBg,
      onChange: handleStatusBarBgChange,
    },
    {
      id: 'statusbar-fg',
      label: 'Text',
      hint: 'Status bar text & icons',
      value: statusBarFg,
      onChange: handleStatusBarFgChange,
    },
  ]

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading appearance settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Appearance</h2>
        <p className="settings-page-description">
          Customize how Buddy looks and feels. All changes apply immediately.
        </p>
      </div>

      <div className="settings-page-content">
        <AppearanceThemeSection theme={theme} onThemeChange={handleThemeChange} />
        <AppearanceColorsSection
          brandColors={brandColors}
          backgroundColors={backgroundColors}
          statusBarColors={statusBarColors}
          onReset={handleResetColors}
        />
        <AppearanceFontsSection
          fontFamily={fontFamily}
          monoFontFamily={monoFontFamily}
          uiFonts={uiFonts}
          monoFonts={monoFonts}
          fontsLoading={fontsLoading}
          onFontFamilyChange={handleFontFamilyChange}
          onMonoFontFamilyChange={handleMonoFontFamilyChange}
        />
      </div>
    </div>
  )
}
