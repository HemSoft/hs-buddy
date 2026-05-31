import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsAppearance } from './SettingsAppearance'
import { DARK_DEFAULTS, LIGHT_DEFAULTS } from './appearanceUtils'
import type { AppConfig } from '../../types/config'

const mocks = vi.hoisted(() => ({
  useConfig: vi.fn(),
}))

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => mocks.useConfig(),
}))

type ColorControl = { value: string; onChange: (color: string) => void }

function getColorValue(controls: ColorControl[], index: number) {
  return controls[index]?.value
}

function setColorValue(controls: ColorControl[], index: number, color: string) {
  controls[index]?.onChange(color)
}

vi.mock('./AppearanceThemeSection', () => ({
  AppearanceThemeSection: ({
    theme,
    onThemeChange,
  }: {
    theme: 'dark' | 'light'
    onThemeChange: (theme: 'dark' | 'light') => Promise<void>
  }) => (
    <div data-testid="theme-section">
      <span data-testid="theme-value">{theme}</span>
      <button type="button" data-testid="theme-dark" onClick={() => onThemeChange('dark')}>
        Dark
      </button>
      <button type="button" data-testid="theme-light" onClick={() => onThemeChange('light')}>
        Light
      </button>
    </div>
  ),
}))

vi.mock('./AppearanceColorsSection', () => ({
  AppearanceColorsSection: ({
    brandColors,
    backgroundColors,
    statusBarColors,
    onReset,
  }: {
    brandColors: ColorControl[]
    backgroundColors: ColorControl[]
    statusBarColors: ColorControl[]
    onReset: () => Promise<void>
  }) => (
    <div data-testid="colors-section">
      <span data-testid="accent-color">{getColorValue(brandColors, 0)}</span>
      <span data-testid="font-color">{getColorValue(brandColors, 1)}</span>
      <span data-testid="bg-primary">{getColorValue(backgroundColors, 0)}</span>
      <span data-testid="bg-secondary">{getColorValue(backgroundColors, 1)}</span>
      <span data-testid="status-bg">{getColorValue(statusBarColors, 0)}</span>
      <span data-testid="status-fg">{getColorValue(statusBarColors, 1)}</span>
      <button
        type="button"
        data-testid="change-accent"
        onClick={() => setColorValue(brandColors, 0, '#123456')}
      >
        Accent
      </button>
      <button
        type="button"
        data-testid="change-font-color"
        onClick={() => setColorValue(brandColors, 1, '#654321')}
      >
        Font
      </button>
      <button
        type="button"
        data-testid="change-bg-primary"
        onClick={() => setColorValue(backgroundColors, 0, '#101010')}
      >
        Primary
      </button>
      <button
        type="button"
        data-testid="change-bg-secondary"
        onClick={() => setColorValue(backgroundColors, 1, '#202020')}
      >
        Secondary
      </button>
      <button
        type="button"
        data-testid="change-status-bg"
        onClick={() => setColorValue(statusBarColors, 0, '#303030')}
      >
        Status BG
      </button>
      <button
        type="button"
        data-testid="change-status-fg"
        onClick={() => setColorValue(statusBarColors, 1, '#f0f0f0')}
      >
        Status FG
      </button>
      <button type="button" data-testid="reset-colors" onClick={() => onReset()}>
        Reset
      </button>
    </div>
  ),
}))

vi.mock('./AppearanceFontsSection', () => ({
  AppearanceFontsSection: ({
    fontFamily,
    monoFontFamily,
    uiFonts,
    monoFonts,
    fontsLoading,
    onFontFamilyChange,
    onMonoFontFamilyChange,
  }: {
    fontFamily: string
    monoFontFamily: string
    uiFonts: string[]
    monoFonts: string[]
    fontsLoading: boolean
    onFontFamilyChange: (font: string) => Promise<void>
    onMonoFontFamilyChange: (font: string) => Promise<void>
  }) => (
    <div data-testid="fonts-section">
      <span data-testid="ui-font">{fontFamily}</span>
      <span data-testid="mono-font">{monoFontFamily}</span>
      <span data-testid="fonts-loading">{fontsLoading ? 'loading' : 'ready'}</span>
      <span data-testid="ui-font-options">{uiFonts.join(',')}</span>
      <span data-testid="mono-font-options">{monoFonts.join(',')}</span>
      <button
        type="button"
        data-testid="change-ui-font"
        onClick={() => onFontFamilyChange('Arial')}
      >
        UI Font
      </button>
      <button
        type="button"
        data-testid="change-mono-font"
        onClick={() => onMonoFontFamilyChange('Fira Code')}
      >
        Mono Font
      </button>
    </div>
  ),
}))

function createApi(overrides: Partial<ReturnType<typeof buildApi>> = {}) {
  return { ...buildApi(), ...overrides }
}

function buildApi() {
  return {
    setTheme: vi.fn().mockResolvedValue({ success: true }),
    setAccentColor: vi.fn().mockResolvedValue({ success: true }),
    setFontColor: vi.fn().mockResolvedValue({ success: true }),
    setBgPrimary: vi.fn().mockResolvedValue({ success: true }),
    setBgSecondary: vi.fn().mockResolvedValue({ success: true }),
    setStatusBarBg: vi.fn().mockResolvedValue({ success: true }),
    setStatusBarFg: vi.fn().mockResolvedValue({ success: true }),
    setFontFamily: vi.fn().mockResolvedValue({ success: true }),
    setMonoFontFamily: vi.fn().mockResolvedValue({ success: true }),
    getSystemFonts: vi.fn().mockResolvedValue([]),
  }
}

function createConfig(overrides: Partial<AppConfig['ui']> = {}): AppConfig {
  return {
    github: { accounts: [] },
    ui: {
      theme: 'dark',
      accentColor: '#0e639c',
      fontColor: '#cccccc',
      bgPrimary: '#1e1e1e',
      bgSecondary: '#252526',
      statusBarBg: '#181818',
      statusBarFg: '#9d9d9d',
      fontFamily: 'Inter',
      monoFontFamily: 'Cascadia Code',
      zoomLevel: 100,
      sidebarWidth: 300,
      paneSizes: [300, 900],
      displayId: 0,
      displayBounds: { x: 0, y: 0, width: 100, height: 100 },
      displayWorkArea: { x: 0, y: 0, width: 100, height: 100 },
      showBookmarkedOnly: false,
      assistantOpen: false,
      favoriteUsers: [],
      dashboardCards: {},
      weatherLocation: null,
      pollenApiKey: '',
      terminalOpen: false,
      terminalPanelHeight: 300,
      ...overrides,
    },
    pr: { refreshInterval: 15, autoRefresh: true, recentlyMergedDays: 7 },
    copilot: {
      ghAccount: '',
      model: 'claude-sonnet-4.5',
      premiumModel: 'claude-opus-4.6',
      prReviewPromptTemplate: '',
    },
    automation: { scheduleForecastDays: 3 },
    notifications: { playSoundOnReviewComplete: false, reviewCompleteSoundPath: '' },
    finance: { watchlist: [] },
  }
}

function renderAppearance({
  config = createConfig(),
  loading = false,
  api = createApi(),
}: {
  config?: AppConfig | null
  loading?: boolean
  api?: ReturnType<typeof buildApi>
} = {}) {
  mocks.useConfig.mockReturnValue({
    config,
    loading,
    api,
  })

  return {
    api,
    ...render(<SettingsAppearance />),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('style')
})

describe('SettingsAppearance', () => {
  it('renders a loading state while config is loading', () => {
    renderAppearance({ config: null, loading: true })

    expect(screen.getByText('Loading appearance settings…')).toBeInTheDocument()
  })

  it('maps config values into the section props and filters system fonts', async () => {
    const api = createApi({
      getSystemFonts: vi
        .fn()
        .mockResolvedValue(['Arial', 'Segoe UI Emoji', 'JetBrains Mono', 'Wingdings', 'Fira Code']),
    })

    renderAppearance({
      api,
      config: createConfig({
        theme: 'light',
        accentColor: '#ff00ff',
        fontColor: '#111111',
        bgPrimary: '#fefefe',
        bgSecondary: '#eeeeee',
        statusBarBg: '#dddddd',
        statusBarFg: '#222222',
        fontFamily: 'Arial',
        monoFontFamily: 'JetBrains Mono',
      }),
    })

    expect(screen.getByTestId('theme-value')).toHaveTextContent('light')
    expect(screen.getByTestId('accent-color')).toHaveTextContent('#ff00ff')
    expect(screen.getByTestId('font-color')).toHaveTextContent('#111111')
    expect(screen.getByTestId('bg-primary')).toHaveTextContent('#fefefe')
    expect(screen.getByTestId('bg-secondary')).toHaveTextContent('#eeeeee')
    expect(screen.getByTestId('status-bg')).toHaveTextContent('#dddddd')
    expect(screen.getByTestId('status-fg')).toHaveTextContent('#222222')

    await waitFor(() => expect(screen.getByTestId('fonts-loading')).toHaveTextContent('ready'))
    expect(screen.getByTestId('ui-font')).toHaveTextContent('Arial')
    expect(screen.getByTestId('mono-font')).toHaveTextContent('JetBrains Mono')
    expect(screen.getByTestId('ui-font-options')).toHaveTextContent('Arial')
    expect(screen.getByTestId('ui-font-options')).not.toHaveTextContent('Emoji')
    expect(screen.getByTestId('mono-font-options')).toHaveTextContent('JetBrains Mono')
    expect(screen.getByTestId('mono-font-options')).toHaveTextContent('Fira Code')
    expect(screen.getByTestId('mono-font-options')).not.toHaveTextContent('Wingdings')
  })

  it('falls back to defaults when config is missing and font loading fails', async () => {
    const api = createApi({
      getSystemFonts: vi.fn().mockRejectedValue(new Error('fonts unavailable')),
    })

    renderAppearance({ api, config: null })

    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark')
    expect(screen.getByTestId('accent-color')).toHaveTextContent(DARK_DEFAULTS.accentColor)

    await waitFor(() => expect(screen.getByTestId('fonts-loading')).toHaveTextContent('ready'))
    expect(screen.getByTestId('ui-font-options')).toHaveTextContent('')
    expect(screen.getByTestId('mono-font-options')).toHaveTextContent('')
  })

  it('applies light theme defaults and persists them through the config api', async () => {
    const api = createApi()
    renderAppearance({ api, config: createConfig({ theme: 'dark' }) })

    fireEvent.click(screen.getByTestId('theme-light'))

    await waitFor(() => expect(api.setTheme).toHaveBeenCalledWith('light'))
    expect(api.setAccentColor).toHaveBeenCalledWith(LIGHT_DEFAULTS.accentColor)
    expect(api.setFontColor).toHaveBeenCalledWith(LIGHT_DEFAULTS.fontColor)
    expect(api.setBgPrimary).toHaveBeenCalledWith(LIGHT_DEFAULTS.bgPrimary)
    expect(api.setBgSecondary).toHaveBeenCalledWith(LIGHT_DEFAULTS.bgSecondary)
    expect(api.setStatusBarBg).toHaveBeenCalledWith(LIGHT_DEFAULTS.statusBarBg)
    expect(api.setStatusBarFg).toHaveBeenCalledWith(LIGHT_DEFAULTS.statusBarFg)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe(
      LIGHT_DEFAULTS.accentColor
    )
  })

  it('updates colors and status bar styles through the generated handlers', async () => {
    const api = createApi()
    renderAppearance({ api })

    fireEvent.click(screen.getByTestId('change-accent'))
    fireEvent.click(screen.getByTestId('change-font-color'))
    fireEvent.click(screen.getByTestId('change-bg-primary'))
    fireEvent.click(screen.getByTestId('change-bg-secondary'))
    fireEvent.click(screen.getByTestId('change-status-bg'))
    fireEvent.click(screen.getByTestId('change-status-fg'))

    await waitFor(() => expect(api.setAccentColor).toHaveBeenCalledWith('#123456'))
    expect(api.setFontColor).toHaveBeenCalledWith('#654321')
    expect(api.setBgPrimary).toHaveBeenCalledWith('#101010')
    expect(api.setBgSecondary).toHaveBeenCalledWith('#202020')
    expect(api.setStatusBarBg).toHaveBeenCalledWith('#303030')
    expect(api.setStatusBarFg).toHaveBeenCalledWith('#f0f0f0')
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('#123456')
    expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe('#654321')
    expect(document.documentElement.style.getPropertyValue('--bg-primary')).toBe('#101010')
    expect(document.documentElement.style.getPropertyValue('--bg-secondary')).toBe('#202020')
    expect(document.documentElement.style.getPropertyValue('--statusbar-bg')).toBe('#303030')
    expect(document.documentElement.style.getPropertyValue('--statusbar-fg')).toBe('#f0f0f0')
  })

  it('resets colors using the current theme defaults', async () => {
    const api = createApi()
    renderAppearance({ api, config: createConfig({ theme: 'light' }) })

    fireEvent.click(screen.getByTestId('reset-colors'))

    await waitFor(() => expect(api.setAccentColor).toHaveBeenCalledWith(LIGHT_DEFAULTS.accentColor))
    expect(api.setFontColor).toHaveBeenCalledWith(LIGHT_DEFAULTS.fontColor)
    expect(api.setBgPrimary).toHaveBeenCalledWith(LIGHT_DEFAULTS.bgPrimary)
    expect(api.setBgSecondary).toHaveBeenCalledWith(LIGHT_DEFAULTS.bgSecondary)
    expect(api.setStatusBarBg).toHaveBeenCalledWith(LIGHT_DEFAULTS.statusBarBg)
    expect(api.setStatusBarFg).toHaveBeenCalledWith(LIGHT_DEFAULTS.statusBarFg)
  })

  it('updates font css variables and persists font changes', async () => {
    const api = createApi({
      getSystemFonts: vi.fn().mockResolvedValue(['Arial', 'Fira Code']),
    })
    renderAppearance({ api })

    await waitFor(() => expect(screen.getByTestId('fonts-loading')).toHaveTextContent('ready'))

    fireEvent.click(screen.getByTestId('change-ui-font'))
    fireEvent.click(screen.getByTestId('change-mono-font'))

    await waitFor(() => expect(api.setFontFamily).toHaveBeenCalledWith('Arial'))
    expect(api.setMonoFontFamily).toHaveBeenCalledWith('Fira Code')
    expect(document.documentElement.style.getPropertyValue('--font-family-ui')).toBe(
      "'Arial', system-ui, sans-serif"
    )
    expect(document.documentElement.style.getPropertyValue('--font-family-mono')).toBe(
      "'Fira Code', Consolas, monospace"
    )
  })

  it('falls back to defaults for empty config UI fields', () => {
    renderAppearance({
      config: createConfig({
        accentColor: '',
        fontColor: '',
        bgPrimary: '',
        bgSecondary: '',
        statusBarBg: '',
        statusBarFg: '',
        fontFamily: '',
        monoFontFamily: '',
      }),
    })

    expect(screen.getByTestId('accent-color')).toHaveTextContent('#0e639c')
    expect(screen.getByTestId('font-color')).toHaveTextContent('#cccccc')
    expect(screen.getByTestId('bg-primary')).toHaveTextContent('#1e1e1e')
    expect(screen.getByTestId('bg-secondary')).toHaveTextContent('#252526')
    expect(screen.getByTestId('status-bg')).toHaveTextContent('#181818')
    expect(screen.getByTestId('status-fg')).toHaveTextContent('#9d9d9d')
    expect(screen.getByTestId('ui-font')).toHaveTextContent('Inter')
    expect(screen.getByTestId('mono-font')).toHaveTextContent('Cascadia Code')
  })

  it('applies dark theme defaults when switching from light to dark', async () => {
    const api = createApi()
    renderAppearance({ api, config: createConfig({ theme: 'light' }) })

    fireEvent.click(screen.getByTestId('theme-dark'))

    await waitFor(() => expect(api.setTheme).toHaveBeenCalledWith('dark'))
    expect(api.setAccentColor).toHaveBeenCalledWith(DARK_DEFAULTS.accentColor)
    expect(api.setFontColor).toHaveBeenCalledWith(DARK_DEFAULTS.fontColor)
    expect(api.setBgPrimary).toHaveBeenCalledWith(DARK_DEFAULTS.bgPrimary)
    expect(api.setBgSecondary).toHaveBeenCalledWith(DARK_DEFAULTS.bgSecondary)
    expect(api.setStatusBarBg).toHaveBeenCalledWith(DARK_DEFAULTS.statusBarBg)
    expect(api.setStatusBarFg).toHaveBeenCalledWith(DARK_DEFAULTS.statusBarFg)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('resets colors using dark theme defaults when theme is dark', async () => {
    const api = createApi()
    renderAppearance({ api, config: createConfig({ theme: 'dark' }) })

    fireEvent.click(screen.getByTestId('reset-colors'))

    await waitFor(() => expect(api.setAccentColor).toHaveBeenCalledWith(DARK_DEFAULTS.accentColor))
    expect(api.setFontColor).toHaveBeenCalledWith(DARK_DEFAULTS.fontColor)
    expect(api.setBgPrimary).toHaveBeenCalledWith(DARK_DEFAULTS.bgPrimary)
    expect(api.setBgSecondary).toHaveBeenCalledWith(DARK_DEFAULTS.bgSecondary)
    expect(api.setStatusBarBg).toHaveBeenCalledWith(DARK_DEFAULTS.statusBarBg)
    expect(api.setStatusBarFg).toHaveBeenCalledWith(DARK_DEFAULTS.statusBarFg)
  })
})
