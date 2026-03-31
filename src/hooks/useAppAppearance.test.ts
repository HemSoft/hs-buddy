import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAppAppearance } from './useAppAppearance'

beforeEach(() => {
  vi.clearAllMocks()
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
      expect(document.documentElement.style.getPropertyValue('--font-family-ui')).toContain('Roboto')
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

  it('defaults to dark theme on error', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockRejectedValue(new Error('fail'))

    renderHook(() => useAppAppearance())

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })
})
