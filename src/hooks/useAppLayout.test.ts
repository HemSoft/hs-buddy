import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAppLayout } from './useAppLayout'

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

describe('useAppLayout', () => {
  it('starts with default pane sizes', () => {
    const { result } = renderHook(() => useAppLayout())
    expect(result.current.paneSizes).toEqual([300, 900])
  })

  it('starts with assistant closed', () => {
    const { result } = renderHook(() => useAppLayout())
    expect(result.current.assistantOpen).toBe(false)
  })

  it('returns loaded false initially', () => {
    const { result } = renderHook(() => useAppLayout())
    expect(result.current.loaded).toBe(false)
  })

  it('loads layout from IPC', async () => {
    vi.mocked(window.ipcRenderer.invoke)
      .mockResolvedValueOnce([400, 800, 300]) // pane sizes
      .mockResolvedValueOnce(true) // assistant open

    const { result } = renderHook(() => useAppLayout())

    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    expect(result.current.paneSizes).toEqual([400, 800, 300])
    expect(result.current.assistantOpen).toBe(true)
  })

  it('toggles assistant open state', async () => {
    const { result } = renderHook(() => useAppLayout())

    act(() => {
      result.current.toggleAssistant()
    })

    expect(result.current.assistantOpen).toBe(true)
  })

  it('still toggles assistant when IPC invoke rejects', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockRejectedValue(new Error('IPC down'))
    const { result } = renderHook(() => useAppLayout())

    act(() => {
      result.current.toggleAssistant()
    })

    expect(result.current.assistantOpen).toBe(true)
  })

  it('handles pane size changes', async () => {
    const { result } = renderHook(() => useAppLayout())

    act(() => {
      result.current.handlePaneChange([25, 75])
    })

    expect(result.current.paneSizes[0]).toBe(25)
    expect(result.current.paneSizes[1]).toBe(75)
  })

  it('registers IPC listener for toggle-assistant', () => {
    renderHook(() => useAppLayout())
    expect(window.ipcRenderer.on).toHaveBeenCalledWith('toggle-assistant', expect.any(Function))
  })

  it('cleans up IPC listener on unmount', () => {
    const { unmount } = renderHook(() => useAppLayout())
    unmount()
    expect(window.ipcRenderer.off).toHaveBeenCalledWith('toggle-assistant', expect.any(Function))
  })

  it('rejects invalid pane changes with fewer than 2 sizes', () => {
    const { result } = renderHook(() => useAppLayout())
    const panesBefore = result.current.paneSizes

    act(() => {
      result.current.handlePaneChange([100])
    })

    expect(result.current.paneSizes).toEqual(panesBefore)
  })

  it('rejects pane changes with zero-value sizes', () => {
    const { result } = renderHook(() => useAppLayout())
    const panesBefore = result.current.paneSizes

    act(() => {
      result.current.handlePaneChange([0, 100])
    })

    expect(result.current.paneSizes).toEqual(panesBefore)
  })

  it('debounces and coalesces rapid pane size changes', async () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useAppLayout())

    act(() => {
      result.current.handlePaneChange([200, 600])
    })

    // Second rapid change should replace the first
    act(() => {
      result.current.handlePaneChange([350, 500])
    })

    // Not saved yet (debounce)
    expect(window.ipcRenderer.invoke).not.toHaveBeenCalledWith(
      'config:set-pane-sizes',
      expect.anything()
    )

    // Advance past debounce delay
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    // Should only save once with the final sizes
    const setPaneCalls = vi
      .mocked(window.ipcRenderer.invoke)
      .mock.calls.filter(([channel]) => channel === 'config:set-pane-sizes')
    expect(setPaneCalls).toHaveLength(1)
    expect(setPaneCalls[0]![1][0]).toBe(350)
    expect(setPaneCalls[0]![1][1]).toBe(500)

    vi.useRealTimers()
  })

  it('toggles assistant via Ctrl+Shift+A keyboard shortcut', () => {
    const { result } = renderHook(() => useAppLayout())
    expect(result.current.assistantOpen).toBe(false)

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true })
      )
    })

    expect(result.current.assistantOpen).toBe(true)
  })

  it('ignores keydown events that are not Ctrl+Shift+A', () => {
    const { result } = renderHook(() => useAppLayout())

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'B', ctrlKey: true, shiftKey: true })
      )
    })

    expect(result.current.assistantOpen).toBe(false)
  })

  it('falls back to defaults when IPC calls are rejected', async () => {
    vi.mocked(window.ipcRenderer.invoke)
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useAppLayout())

    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })

    expect(result.current.paneSizes).toEqual([300, 900])
    expect(result.current.assistantOpen).toBe(false)
  })

  it('preserves saved assistant size when pane change has only 2 sizes', () => {
    const { result } = renderHook(() => useAppLayout())

    act(() => {
      result.current.handlePaneChange([200, 500, 300])
    })

    act(() => {
      result.current.handlePaneChange([250, 550])
    })

    expect(result.current.paneSizes).toEqual([250, 550, 300])
  })
})
