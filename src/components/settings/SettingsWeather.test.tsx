import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsWeather } from './SettingsWeather'
import { IPC_INVOKE } from '../../ipc/contracts'

describe('SettingsWeather', () => {
  const mockInvoke = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    window.ipcRenderer = { invoke: mockInvoke } as unknown as typeof window.ipcRenderer
  })

  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<SettingsWeather />)
    expect(screen.getByText('Loading weather settings…')).toBeInTheDocument()
  })

  it('loads and displays saved API key', async () => {
    mockInvoke.mockResolvedValue('test-api-key-123')
    render(<SettingsWeather />)

    await waitFor(() => {
      expect(screen.getByText(/Configured/)).toBeInTheDocument()
    })
    expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CONFIG_GET_POLLEN_API_KEY)
  })

  it('shows unconfigured status when no key', async () => {
    mockInvoke.mockResolvedValue('')
    render(<SettingsWeather />)

    await waitFor(() => {
      expect(screen.getByText(/Not configured/)).toBeInTheDocument()
    })
  })

  it('handles IPC error on load gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC unavailable'))
    render(<SettingsWeather />)

    await waitFor(() => {
      expect(screen.getByText(/Not configured/)).toBeInTheDocument()
    })
  })

  it('toggles key visibility', async () => {
    mockInvoke.mockResolvedValue('my-key')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByDisplayValue('my-key'))

    const input = screen.getByPlaceholderText(/Enter your Google Cloud API key/)
    expect(input).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByTitle('Show key'))
    expect(input).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByTitle('Hide key'))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('saves API key', async () => {
    mockInvoke.mockResolvedValue('')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByPlaceholderText(/Enter your Google Cloud API key/))

    const input = screen.getByPlaceholderText(/Enter your Google Cloud API key/)
    fireEvent.change(input, { target: { value: 'new-api-key' } })

    mockInvoke.mockResolvedValue(undefined)
    fireEvent.click(screen.getByText('Save Key'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CONFIG_SET_POLLEN_API_KEY, 'new-api-key')
    })
  })

  it('clears API key', async () => {
    mockInvoke.mockResolvedValue('existing-key')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByText('Clear Key'))

    mockInvoke.mockResolvedValue(undefined)
    fireEvent.click(screen.getByText('Clear Key'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CONFIG_SET_POLLEN_API_KEY, '')
    })
  })

  it('handles save error gracefully', async () => {
    mockInvoke.mockResolvedValue('')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByPlaceholderText(/Enter your Google Cloud API key/))

    const input = screen.getByPlaceholderText(/Enter your Google Cloud API key/)
    fireEvent.change(input, { target: { value: 'new-key' } })

    mockInvoke.mockRejectedValue(new Error('Save failed'))
    fireEvent.click(screen.getByText('Save Key'))

    // Should not crash - component remains interactive
    await waitFor(() => {
      expect(screen.getByText('Save Key')).not.toBeDisabled()
    })
  })

  it('handles clear error gracefully', async () => {
    mockInvoke.mockResolvedValue('existing-key')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByText('Clear Key'))

    mockInvoke.mockRejectedValue(new Error('Clear failed'))
    fireEvent.click(screen.getByText('Clear Key'))

    await waitFor(() => {
      expect(screen.getByText('Clear Key')).not.toBeDisabled()
    })
  })

  it('opens external link via IPC', async () => {
    mockInvoke.mockResolvedValue('')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByText(/Enable the Google Pollen API/))

    fireEvent.click(screen.getByText(/Enable the Google Pollen API/))

    expect(mockInvoke).toHaveBeenCalledWith(
      'shell:open-external',
      'https://console.cloud.google.com/apis/library/pollen.googleapis.com'
    )
  })

  it('disables save button when key is unchanged', async () => {
    mockInvoke.mockResolvedValue('existing-key')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByDisplayValue('existing-key'))

    expect(screen.getByText('Save Key')).toBeDisabled()
  })

  it('disables save button when input is empty', async () => {
    mockInvoke.mockResolvedValue('')
    render(<SettingsWeather />)

    await waitFor(() => screen.getByPlaceholderText(/Enter your Google Cloud API key/))

    expect(screen.getByText('Save Key')).toBeDisabled()
  })
})
