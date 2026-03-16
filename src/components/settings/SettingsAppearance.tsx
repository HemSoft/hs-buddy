import { useState, useEffect, useCallback, useReducer } from 'react'
import { useConfig } from '../../hooks/useConfig'
import { RefreshCw } from 'lucide-react'
import type { AppConfig } from '../../types/config'
import { DARK_DEFAULTS, LIGHT_DEFAULTS, type ColorDef, lightenColor } from './appearanceUtils'
import { AppearanceThemeSection } from './AppearanceThemeSection'
import { AppearanceColorsSection } from './AppearanceColorsSection'
import { AppearanceFontsSection } from './AppearanceFontsSection'
import './SettingsShared.css'
import './SettingsAppearance.css'

interface AppearanceState {
  theme: 'dark' | 'light'
  accentColor: string
  fontColor: string
  bgPrimary: string
  bgSecondary: string
  statusBarBg: string
  statusBarFg: string
  fontFamily: string
  monoFontFamily: string
}

interface FontsState {
  systemFonts: string[]
  loading: boolean
}

const INITIAL_STATE: AppearanceState = {
  theme: 'dark',
  accentColor: '#0e639c',
  fontColor: '#cccccc',
  bgPrimary: '#1e1e1e',
  bgSecondary: '#252526',
  statusBarBg: '#181818',
  statusBarFg: '#9d9d9d',
  fontFamily: 'Inter',
  monoFontFamily: 'Cascadia Code',
}

type AppearanceAction =
  | { type: 'SET_ALL'; payload: Partial<AppearanceState> }
  | { type: 'SET_FIELD'; field: keyof AppearanceState; value: string }

const CUSTOM_CSS_PROPS = [
  '--accent-primary',
  '--accent-primary-hover',
  '--border-focus',
  '--text-primary',
  '--text-heading',
  '--bg-primary',
  '--panel-bg',
  '--input-bg',
  '--bg-secondary',
  '--sidebar-bg',
  '--statusbar-bg',
  '--statusbar-fg',
] as const

function appearanceReducer(state: AppearanceState, action: AppearanceAction): AppearanceState {
  switch (action.type) {
    case 'SET_ALL':
      return { ...state, ...action.payload }
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value }
  }
}

function buildAppearanceState(config: AppConfig | null): AppearanceState {
  if (!config) {
    return INITIAL_STATE
  }

  return {
    theme: config.ui.theme,
    accentColor: config.ui.accentColor || '#0e639c',
    fontColor: config.ui.fontColor || '#cccccc',
    bgPrimary: config.ui.bgPrimary || '#1e1e1e',
    bgSecondary: config.ui.bgSecondary || '#252526',
    statusBarBg: config.ui.statusBarBg || '#181818',
    statusBarFg: config.ui.statusBarFg || '#9d9d9d',
    fontFamily: config.ui.fontFamily || 'Inter',
    monoFontFamily: config.ui.monoFontFamily || 'Cascadia Code',
  }
}

type ConfigApi = ReturnType<typeof useConfig>['api']

interface SettingsAppearanceEditorProps {
  api: ConfigApi
  initialState: AppearanceState
}

function SettingsAppearanceEditor({ api, initialState }: SettingsAppearanceEditorProps) {
  const [state, dispatch] = useReducer(appearanceReducer, initialState)
  const {
    theme,
    accentColor,
    fontColor,
    bgPrimary,
    bgSecondary,
    statusBarBg,
    statusBarFg,
    fontFamily,
    monoFontFamily,
  } = state
  const [fontsState, setFontsState] = useState<FontsState>({
    systemFonts: [],
    loading: true,
  })
  const { systemFonts, loading: fontsLoading } = fontsState

  useEffect(() => {
    api
      .getSystemFonts()
      .then(fonts =>
        setFontsState({
          systemFonts: fonts,
          loading: false,
        })
      )
      .catch(() =>
        setFontsState({
          systemFonts: [],
          loading: false,
        })
      )
  }, [api])

  const applyColors = useCallback(
    (colors: {
      accent: string
      fontColor: string
      primary: string
      secondary: string
      sbBg?: string
      sbFg?: string
    }) => {
      const root = document.documentElement
      const customColors: Partial<Record<(typeof CUSTOM_CSS_PROPS)[number], string>> = {
        '--accent-primary': colors.accent,
        '--accent-primary-hover': lightenColor(colors.accent, 15),
        '--border-focus': colors.accent,
        '--text-primary': colors.fontColor,
        '--text-heading': lightenColor(colors.fontColor, 20),
        '--bg-primary': colors.primary,
        '--panel-bg': colors.primary,
        '--input-bg': colors.primary,
        '--bg-secondary': colors.secondary,
        '--sidebar-bg': colors.secondary,
        ...(colors.sbBg ? { '--statusbar-bg': colors.sbBg } : {}),
        ...(colors.sbFg ? { '--statusbar-fg': colors.sbFg } : {}),
      }

      for (const [prop, value] of Object.entries(customColors)) {
        if (value) {
          root.style.setProperty(prop, value)
        }
      }
    },
    []
  )

  const handleThemeChange = async (newTheme: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', newTheme)

    const defaults = newTheme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS
    dispatch({
      type: 'SET_ALL',
      payload: {
        theme: newTheme,
        accentColor: defaults.accentColor,
        fontColor: defaults.fontColor,
        bgPrimary: defaults.bgPrimary,
        bgSecondary: defaults.bgSecondary,
        statusBarBg: defaults.statusBarBg,
        statusBarFg: defaults.statusBarFg,
      },
    })

    const root = document.documentElement
    for (const prop of CUSTOM_CSS_PROPS) {
      root.style.removeProperty(prop)
    }

    applyColors({
      accent: defaults.accentColor,
      fontColor: defaults.fontColor,
      primary: defaults.bgPrimary,
      secondary: defaults.bgSecondary,
      sbBg: defaults.statusBarBg,
      sbFg: defaults.statusBarFg,
    })

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

  const makeColorHandler = (
    field: 'accentColor' | 'fontColor' | 'bgPrimary' | 'bgSecondary',
    apiMethod: (color: string) => Promise<unknown>
  ) => async (color: string) => {
    dispatch({ type: 'SET_FIELD', field, value: color })
    applyColors({
      accent: field === 'accentColor' ? color : accentColor,
      fontColor: field === 'fontColor' ? color : fontColor,
      primary: field === 'bgPrimary' ? color : bgPrimary,
      secondary: field === 'bgSecondary' ? color : bgSecondary,
      sbBg: statusBarBg,
      sbFg: statusBarFg,
    })
    await apiMethod(color)
  }

  const handleAccentChange = makeColorHandler('accentColor', api.setAccentColor)
  const handleFontColorChange = makeColorHandler('fontColor', api.setFontColor)
  const handleBgPrimaryChange = makeColorHandler('bgPrimary', api.setBgPrimary)
  const handleBgSecondaryChange = makeColorHandler('bgSecondary', api.setBgSecondary)

  const handleStatusBarBgChange = async (color: string) => {
    dispatch({ type: 'SET_FIELD', field: 'statusBarBg', value: color })
    document.documentElement.style.setProperty('--statusbar-bg', color)
    await api.setStatusBarBg(color)
  }

  const handleStatusBarFgChange = async (color: string) => {
    dispatch({ type: 'SET_FIELD', field: 'statusBarFg', value: color })
    document.documentElement.style.setProperty('--statusbar-fg', color)
    await api.setStatusBarFg(color)
  }

  const handleResetColors = async () => {
    const defaults = theme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS
    dispatch({
      type: 'SET_ALL',
      payload: {
        accentColor: defaults.accentColor,
        fontColor: defaults.fontColor,
        bgPrimary: defaults.bgPrimary,
        bgSecondary: defaults.bgSecondary,
        statusBarBg: defaults.statusBarBg,
        statusBarFg: defaults.statusBarFg,
      },
    })
    applyColors({
      accent: defaults.accentColor,
      fontColor: defaults.fontColor,
      primary: defaults.bgPrimary,
      secondary: defaults.bgSecondary,
      sbBg: defaults.statusBarBg,
      sbFg: defaults.statusBarFg,
    })
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
    dispatch({ type: 'SET_FIELD', field: 'fontFamily', value: font })
    document.documentElement.style.setProperty(
      '--font-family-ui',
      `'${font}', system-ui, sans-serif`
    )
    await api.setFontFamily(font)
  }

  const handleMonoFontFamilyChange = async (font: string) => {
    dispatch({ type: 'SET_FIELD', field: 'monoFontFamily', value: font })
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

export function SettingsAppearance() {
  const { config, loading, api } = useConfig()

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

  const initialState = buildAppearanceState(config)
  const configKey = [
    initialState.theme,
    initialState.accentColor,
    initialState.fontColor,
    initialState.bgPrimary,
    initialState.bgSecondary,
    initialState.statusBarBg,
    initialState.statusBarFg,
    initialState.fontFamily,
    initialState.monoFontFamily,
  ].join('|')

  return <SettingsAppearanceEditor key={configKey} api={api} initialState={initialState} />
}
