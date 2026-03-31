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
})
