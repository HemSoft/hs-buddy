import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsNotifications } from './SettingsNotifications'

const mockSetEnabled = vi.fn()
const mockSetSoundPath = vi.fn()
const mockPickSoundFile = vi.fn()
const mockInvoke = vi.fn()
let mockEnabled = true
let mockSoundPath = 'C:\\sounds\\ding.wav'
let mockLoading = false

vi.mock('../../hooks/useConfig', () => ({
  useNotificationSettings: () => ({
    enabled: mockEnabled,
    soundPath: mockSoundPath,
    loading: mockLoading,
    setEnabled: mockSetEnabled,
    setSoundPath: mockSetSoundPath,
    pickSoundFile: mockPickSoundFile,
  }),
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
    mockEnabled = true
    mockSoundPath = 'C:\\sounds\\ding.wav'
    mockLoading = false
    mockInvoke.mockResolvedValue({ base64: 'AQID', mimeType: 'audio/wav' })

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

  it('shows loading state', () => {
    mockLoading = true
    render(<SettingsNotifications />)
    expect(screen.getByText('Loading notification settings...')).toBeInTheDocument()
    expect(screen.queryByText('Notifications')).toBeFalsy()
  })

  it('toggles enabled state on click', async () => {
    render(<SettingsNotifications />)
    const toggle = screen.getByRole('button', { name: /enable sound/i })
    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(mockSetEnabled).toHaveBeenCalledWith(false)
  })

  it('calls pickSoundFile when Browse button is clicked', async () => {
    render(<SettingsNotifications />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /browse/i }))
    })
    expect(mockPickSoundFile).toHaveBeenCalled()
  })

  it('clears sound path and stops preview on Clear click', async () => {
    render(<SettingsNotifications />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    })
    expect(mockSetSoundPath).toHaveBeenCalledWith('')
  })

  it('shows "No sound file selected" when no sound path', () => {
    mockSoundPath = ''
    render(<SettingsNotifications />)
    expect(screen.getByText('No sound file selected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview/i })).toBeFalsy()
  })

  it('shows error when IPC invoke returns null', async () => {
    mockInvoke.mockResolvedValue(null)
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => {
      expect(screen.getByText('Could not read the audio file.')).toBeInTheDocument()
    })
  })

  it('shows error when IPC invoke rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC failed'))
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => {
      expect(screen.getByText('Could not play this file.')).toBeInTheDocument()
    })
  })

  it('shows error when audio.play() rejects', async () => {
    // Override Audio so the next instance's play() rejects
    globalThis.Audio = class extends MockAudio {
      play = vi.fn().mockRejectedValue(new Error('play failed'))
    } as unknown as typeof Audio

    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Could not play this file. Make sure it is a valid audio file.')
      ).toBeInTheDocument()
    })
  })

  it('cleans up audio reference on onended', async () => {
    render(<SettingsNotifications />)

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await waitFor(() => expect(MockAudio.instances).toHaveLength(1))

    const audio = MockAudio.instances[0]
    await act(async () => {
      audio.onended?.()
    })

    // After onended, clicking preview again should create a new instance
    mockInvoke.mockResolvedValue({ base64: 'AQID', mimeType: 'audio/wav' })
    createObjectURL.mockReturnValueOnce('blob:preview-4')
    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    await waitFor(() => expect(MockAudio.instances).toHaveLength(2))
  })

  it('does not trigger preview when soundPath is empty', () => {
    mockSoundPath = ''
    render(<SettingsNotifications />)
    // No preview button visible when no sound path
    expect(screen.queryByRole('button', { name: /preview/i })).toBeFalsy()
  })

  it('displays the basename of the sound path', () => {
    mockSoundPath = 'C:\\Users\\test\\sounds\\alert.mp3'
    render(<SettingsNotifications />)
    expect(screen.getByText('alert.mp3')).toBeInTheDocument()
  })

  it('renders toggle with correct aria-pressed state', () => {
    mockEnabled = false
    render(<SettingsNotifications />)
    const toggle = screen.getByRole('button', { name: /enable sound/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })
})
