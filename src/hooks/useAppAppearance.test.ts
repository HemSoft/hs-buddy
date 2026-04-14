import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAppAppearance } from './useAppAppearance'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset DOM state to prevent leakage between tests
  document.documentElement.style.cssText = ''
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.fontSize = ''

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

afterEach(() => {
  document.documentElement.style.cssText = ''
  document.documentElement.removeAttribute('data-theme')
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

  it('sets data-theme to falsy theme value as dark', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-theme') return Promise.resolve('')
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

  it('applies primary background as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-bg-primary') return Promise.resolve('#1e1e1e')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--bg-primary')).toBe('#1e1e1e')
      expect(document.documentElement.style.getPropertyValue('--panel-bg')).toBe('#1e1e1e')
      expect(document.documentElement.style.getPropertyValue('--input-bg')).toBe('#1e1e1e')
    })
  })

  it('applies secondary background as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-bg-secondary') return Promise.resolve('#252526')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--bg-secondary')).toBe('#252526')
      expect(document.documentElement.style.getPropertyValue('--sidebar-bg')).toBe('#252526')
    })
  })

  it('applies font color and heading color as CSS variables', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-font-color') return Promise.resolve('#cccccc')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe('#cccccc')
      expect(document.documentElement.style.getPropertyValue('--text-heading')).toBeTruthy()
    })
  })

  it('applies statusbar background as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-statusbar-bg') return Promise.resolve('#181818')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--statusbar-bg')).toBe('#181818')
    })
  })

  it('applies statusbar foreground as CSS variable', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-statusbar-fg') return Promise.resolve('#9d9d9d')
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--statusbar-fg')).toBe('#9d9d9d')
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

  it('applies mono font family as CSS variable', async () => {
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

  it('does not set fontSize when zoom level is 100', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) => {
      if (channel === 'config:get-zoom-level') return Promise.resolve(100)
      return Promise.resolve(undefined)
    })

    renderHook(() => useAppAppearance())

    // Wait for the effect to complete
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBeTruthy()
    })

    expect(document.documentElement.style.fontSize).toBe('')
  })

  it('defaults to dark theme on error', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockRejectedValue(new Error('fail'))

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })
})
