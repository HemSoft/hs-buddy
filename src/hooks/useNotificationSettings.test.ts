import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotificationSettings } from './useConfig'

const mockInvoke = vi.fn()

Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
})

describe('useNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockImplementation((channel: string) => {
      switch (channel) {
        case 'config:get-notification-sound-enabled':
          return Promise.resolve(false)
        case 'config:get-notification-sound-path':
          return Promise.resolve('')
        case 'config:set-notification-sound-enabled':
          return Promise.resolve({ success: true })
        case 'config:set-notification-sound-path':
          return Promise.resolve({ success: true })
        case 'config:pick-audio-file':
          return Promise.resolve({ success: true, filePath: 'C:\\sounds\\ding.mp3' })
        default:
          return Promise.resolve(null)
      }
    })
  })

  it('loads initial state from IPC', async () => {
    mockInvoke
      .mockResolvedValueOnce(true) // enabled
      .mockResolvedValueOnce('/path/to/sound.mp3') // soundPath

    const { result } = renderHook(() => useNotificationSettings())
    // Wait for initial load
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(true)
    expect(result.current.soundPath).toBe('/path/to/sound.mp3')
  })

  it('toggles enabled via IPC', async () => {
    const { result } = renderHook(() => useNotificationSettings())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setEnabled(true)
    })

    expect(mockInvoke).toHaveBeenCalledWith('config:set-notification-sound-enabled', true)
    expect(result.current.enabled).toBe(true)
  })

  it('does not update enabled state when the IPC write fails', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      switch (channel) {
        case 'config:get-notification-sound-enabled':
          return Promise.resolve(false)
        case 'config:get-notification-sound-path':
          return Promise.resolve('')
        case 'config:set-notification-sound-enabled':
          return Promise.resolve({ success: false })
        default:
          return Promise.resolve(null)
      }
    })

    const { result } = renderHook(() => useNotificationSettings())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setEnabled(true)
    })

    expect(result.current.enabled).toBe(false)
  })

  it('sets sound path via IPC', async () => {
    const { result } = renderHook(() => useNotificationSettings())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setSoundPath('/new/path.wav')
    })

    expect(mockInvoke).toHaveBeenCalledWith('config:set-notification-sound-path', '/new/path.wav')
    expect(result.current.soundPath).toBe('/new/path.wav')
  })

  it('does not update sound path when persistence fails', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      switch (channel) {
        case 'config:get-notification-sound-enabled':
          return Promise.resolve(false)
        case 'config:get-notification-sound-path':
          return Promise.resolve('')
        case 'config:set-notification-sound-path':
          return Promise.resolve({ success: false })
        default:
          return Promise.resolve(null)
      }
    })

    const { result } = renderHook(() => useNotificationSettings())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setSoundPath('/new/path.wav')
    })

    expect(result.current.soundPath).toBe('')
  })

  it('picks a sound file via IPC dialog', async () => {
    const { result } = renderHook(() => useNotificationSettings())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    let picked: string | null = null
    await act(async () => {
      picked = await result.current.pickSoundFile()
    })

    expect(mockInvoke).toHaveBeenCalledWith('config:pick-audio-file')
    expect(picked).toBe('C:\\sounds\\ding.mp3')
    expect(result.current.soundPath).toBe('C:\\sounds\\ding.mp3')
  })

  it('returns null when file picker is cancelled', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:pick-audio-file') {
        return Promise.resolve({ success: false, canceled: true })
      }
      return Promise.resolve(false)
    })

    const { result } = renderHook(() => useNotificationSettings())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))

    let picked: string | null = null
    await act(async () => {
      picked = await result.current.pickSoundFile()
    })

    expect(picked).toBeNull()
  })
})
