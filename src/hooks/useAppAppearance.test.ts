import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAppAppearance } from './useAppAppearance'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset DOM state to avoid cross-test contamination
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.cssText = ''
  Object.defineProperty(window, 'ipcRenderer', {
    value: {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    writable: true,
    configurable: true,
  })
})

describe('useAppAppearance', () => {
  it('loads theme from IPC on mount', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-theme') return Promise.resolve('dark')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('applies accent color as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-accent-color') return Promise.resolve('#ff5500')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('#ff5500')
    })
  })

  it('applies font family as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-font-family') return Promise.resolve('Roboto')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--font-family-ui')).toContain(
        'Roboto'
      )
    })
  })

  it('applies zoom level', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-zoom-level') return Promise.resolve(120)
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.fontSize).toBe('120%')
    })
  })

  it('applies bgPrimary as CSS variables', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-bg-primary') return Promise.resolve('#1a1a2e')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--bg-primary')).toBe('#1a1a2e')
    })
    expect(document.documentElement.style.getPropertyValue('--panel-bg')).toBe('#1a1a2e')
    expect(document.documentElement.style.getPropertyValue('--input-bg')).toBe('#1a1a2e')
  })

  it('applies bgSecondary as CSS variables', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-bg-secondary') return Promise.resolve('#16213e')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--bg-secondary')).toBe('#16213e')
    })
    expect(document.documentElement.style.getPropertyValue('--sidebar-bg')).toBe('#16213e')
  })

  it('applies fontColor as CSS variables', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-font-color') return Promise.resolve('#e0e0e0')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe('#e0e0e0')
    })
    expect(document.documentElement.style.getPropertyValue('--text-heading')).toBe('#ffffff')
  })

  it('applies statusBarBg as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-statusbar-bg') return Promise.resolve('#0f3460')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--statusbar-bg')).toBe('#0f3460')
    })
  })

  it('applies statusBarFg as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-statusbar-fg') return Promise.resolve('#ffffff')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--statusbar-fg')).toBe('#ffffff')
    })
  })

  it('applies monoFontFamily as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-mono-font-family') return Promise.resolve('Fira Code')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--font-family-mono')).toContain(
        'Fira Code'
      )
    })
  })

  it('defaults to dark theme on error', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockRejectedValue(new Error('fail'))

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })
})
