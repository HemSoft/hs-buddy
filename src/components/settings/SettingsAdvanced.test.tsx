import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SettingsAdvanced } from './SettingsAdvanced'

const { mockUseConfig } = vi.hoisted(() => ({
  mockUseConfig: vi.fn(),
}))

vi.mock('../../hooks/useConfig', () => ({
  useConfig: mockUseConfig,
}))

function defaultMockValues() {
  return {
    api: {
      getStorePath: vi.fn().mockResolvedValue('/path/to/config.json'),
      openInEditor: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
    refresh: vi.fn().mockResolvedValue(undefined),
    loading: false,
  }
}

describe('SettingsAdvanced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseConfig.mockReturnValue(defaultMockValues())
  })

  it('renders Advanced heading', () => {
    render(<SettingsAdvanced />)
    expect(screen.getByText('Advanced')).toBeTruthy()
  })

  it('renders Configuration File section', () => {
    render(<SettingsAdvanced />)
    expect(screen.getByText('Configuration File')).toBeTruthy()
  })

  it('renders Reset Configuration section', () => {
    render(<SettingsAdvanced />)
    expect(screen.getByText('Reset Configuration')).toBeTruthy()
  })

  it('renders Open in Editor button', () => {
    render(<SettingsAdvanced />)
    expect(screen.getByText('Open in Editor')).toBeTruthy()
  })

  it('renders Reset to Defaults button', () => {
    render(<SettingsAdvanced />)
    expect(screen.getByText('Reset to Defaults')).toBeTruthy()
  })

  it('shows first-click confirmation on reset', () => {
    render(<SettingsAdvanced />)
    fireEvent.click(screen.getByText('Reset to Defaults'))
    expect(screen.getByText('Click Again to Confirm')).toBeTruthy()
  })

  it('shows About Storage section', () => {
    render(<SettingsAdvanced />)
    expect(screen.getByText('About Storage')).toBeTruthy()
  })

  it('shows security note about keychain', () => {
    render(<SettingsAdvanced />)
    expect(screen.getByText(/tokens are stored securely/)).toBeTruthy()
  })

  it('shows loading spinner when loading is true', () => {
    mockUseConfig.mockReturnValue({ ...defaultMockValues(), loading: true })
    render(<SettingsAdvanced />)
    expect(screen.getByText('Loading advanced settings...')).toBeTruthy()
  })

  it('shows "Opened!" after clicking Open in Editor', async () => {
    render(<SettingsAdvanced />)
    fireEvent.click(screen.getByText('Open in Editor'))
    await waitFor(() => {
      expect(screen.getByText('Opened!')).toBeTruthy()
    })
  })

  it('executes reset on second click of Reset to Defaults', async () => {
    const mock = defaultMockValues()
    mockUseConfig.mockReturnValue(mock)
    render(<SettingsAdvanced />)

    fireEvent.click(screen.getByText('Reset to Defaults'))
    expect(screen.getByText('Click Again to Confirm')).toBeTruthy()

    fireEvent.click(screen.getByText('Click Again to Confirm'))
    await waitFor(() => {
      expect(mock.api.reset).toHaveBeenCalled()
      expect(mock.refresh).toHaveBeenCalled()
    })
  })

  it('displays the config store path', async () => {
    render(<SettingsAdvanced />)
    await waitFor(() => {
      expect(screen.getByText('/path/to/config.json')).toBeTruthy()
    })
  })

  it('hides "Opened!" message after 2 seconds', async () => {
    vi.useFakeTimers()
    render(<SettingsAdvanced />)

    await act(async () => {
      fireEvent.click(screen.getByText('Open in Editor'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Opened!')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.queryByText('Opened!')).toBeNull()
    expect(screen.getByText('Open in Editor')).toBeTruthy()

    vi.useRealTimers()
  })

  it('auto-cancels reset confirmation after 3 seconds', async () => {
    vi.useFakeTimers()
    render(<SettingsAdvanced />)

    await act(async () => {
      fireEvent.click(screen.getByText('Reset to Defaults'))
    })
    expect(screen.getByText('Click Again to Confirm')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.queryByText('Click Again to Confirm')).toBeNull()
    expect(screen.getByText('Reset to Defaults')).toBeTruthy()

    vi.useRealTimers()
  })
})
