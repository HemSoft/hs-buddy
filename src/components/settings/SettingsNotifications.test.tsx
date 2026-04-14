import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsNotifications } from './SettingsNotifications'

const mockSetEnabled = vi.fn()
const mockSetSoundPath = vi.fn()
const mockPickSoundFile = vi.fn()
const mockInvoke = vi.fn()

const { mockNotificationSettings } = vi.hoisted(() => ({
  mockNotificationSettings: vi.fn(),
}))

vi.mock('../../hooks/useConfig', () => ({
  useNotificationSettings: mockNotificationSettings,
}))

class MockAudio {
  static instances: MockAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  pause = vi.fn()
  play = vi.fn().mockResolvedValue(undefined)

  constructor(public src = '') {
    MockAudio.instances.push(this)
  }
}

describe('SettingsNotifications', () => {
  const originalAudio = globalThis.Audio
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    MockAudio.instances = []
    mockInvoke.mockResolvedValue({ base64: 'AQID', mimeType: 'audio/wav' })

    mockNotificationSettings.mockReturnValue({
      enabled: true,
      soundPath: 'C:\\sounds\\ding.wav',
      loading: false,
      setEnabled: mockSetEnabled,
      setSoundPath: mockSetSoundPath,
      pickSoundFile: mockPickSoundFile,
    })

    Object.defineProperty(window, 'ipcRenderer', {
      value: { invoke: mockInvoke },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      writable: true,
      configurable: true,
    })

    createObjectURL.mockReturnValueOnce('blob:preview-1').mockReturnValueOnce('blob:preview-2')
    globalThis.Audio = MockAudio as unknown as typeof Audio
  })

  afterEach(() => {
    globalThis.Audio = originalAudio
  })

  it('requests preview audio from the configured IPC channel without sending a renderer path', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('config:play-notification-sound')
    })
  })

  it('revokes the current blob URL when clearing a preview', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob)))
    const previewUrl = createObjectURL.mock.results.at(-1)?.value

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(previewUrl))
  })

  it('revokes the current blob URL when the component unmounts', async () => {
    const { unmount } = render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob)))
    const previewUrl = createObjectURL.mock.results.at(-1)?.value

    unmount()

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(previewUrl))
  })

  it('shows an error when audio loading fails after preview starts', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => expect(MockAudio.instances).toHaveLength(1))
    await act(async () => {
      MockAudio.instances[0].onerror?.()
    })

    await waitFor(() => {
      expect(
        screen.getByText('Could not play this file. Make sure it is a valid audio file.')
      ).toBeInTheDocument()
    })
  })

  it('toggle calls setEnabled with the opposite value', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /enable sound notification/i }))

    await waitFor(() => {
      expect(mockSetEnabled).toHaveBeenCalledWith(false)
    })
  })

  it('browse calls pickSoundFile', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /browse/i }))

    await waitFor(() => {
      expect(mockPickSoundFile).toHaveBeenCalled()
    })
  })

  it('shows a loading spinner when loading is true', () => {
    mockNotificationSettings.mockReturnValue({
      enabled: false,
      soundPath: '',
      loading: true,
      setEnabled: mockSetEnabled,
      setSoundPath: mockSetSoundPath,
      pickSoundFile: mockPickSoundFile,
    })

    render(<SettingsNotifications />)

    expect(screen.getByText('Loading notification settings...')).toBeInTheDocument()
  })

  it('shows an error when IPC returns null for preview', async () => {
    mockInvoke.mockResolvedValue(null)

    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => {
      expect(screen.getByText('Could not read the audio file.')).toBeInTheDocument()
    })
  })

  it('audio onended cleans up blob URL', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => expect(MockAudio.instances).toHaveLength(1))
    const audio = MockAudio.instances[0]

    await act(async () => {
      audio.onended?.()
    })

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    })
  })

  it('hides preview and clear buttons when no sound path is set', () => {
    mockNotificationSettings.mockReturnValue({
      enabled: true,
      soundPath: '',
      loading: false,
      setEnabled: mockSetEnabled,
      setSoundPath: mockSetSoundPath,
      pickSoundFile: mockPickSoundFile,
    })

    render(<SettingsNotifications />)

    expect(screen.getByText('No sound file selected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument()
  })

  it('clear calls setSoundPath with empty string', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    await waitFor(() => {
      expect(mockSetSoundPath).toHaveBeenCalledWith('')
    })
  })

  it('shows error when audio.play() rejects', async () => {
    // Override MockAudio so play() rejects on any new instance
    const FailAudio = class extends MockAudio {
      play = vi.fn().mockRejectedValue(new Error('play failed'))
    }
    globalThis.Audio = FailAudio as unknown as typeof Audio

    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Could not play this file. Make sure it is a valid audio file.')
      ).toBeInTheDocument()
    })
  })
})
