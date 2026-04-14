import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { SettingsAdvanced } from './SettingsAdvanced'

const mockGetStorePath = vi.fn().mockResolvedValue('/path/to/config.json')
const mockOpenInEditor = vi.fn().mockResolvedValue(undefined)
const mockReset = vi.fn().mockResolvedValue(undefined)
const mockRefresh = vi.fn().mockResolvedValue(undefined)
let mockLoading = false

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({
    api: {
      getStorePath: mockGetStorePath,
      openInEditor: mockOpenInEditor,
      reset: mockReset,
    },
    refresh: mockRefresh,
    loading: mockLoading,
  }),
}))

describe('SettingsAdvanced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockLoading = false
    mockGetStorePath.mockResolvedValue('/path/to/config.json')
    mockOpenInEditor.mockResolvedValue(undefined)
    mockReset.mockResolvedValue(undefined)
    mockRefresh.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('shows loading state when loading is true', () => {
    mockLoading = true
    render(<SettingsAdvanced />)
    expect(screen.getByText('Loading advanced settings...')).toBeTruthy()
    expect(screen.queryByText('Advanced')).toBeFalsy()
  })

  it('displays store path after fetching', async () => {
    vi.useRealTimers()
    render(<SettingsAdvanced />)
    // Default mock resolves to '/path/to/config.json'
    await waitFor(() => {
      expect(screen.getByText('/path/to/config.json')).toBeTruthy()
    })
    vi.useFakeTimers()
  })

  it('shows Opened! after clicking Open in Editor', async () => {
    render(<SettingsAdvanced />)
    await act(async () => {
      fireEvent.click(screen.getByText('Open in Editor'))
    })
    expect(mockOpenInEditor).toHaveBeenCalled()
    expect(screen.getByText('Opened!')).toBeTruthy()
  })

  it('hides Opened! message after 2 seconds', async () => {
    render(<SettingsAdvanced />)
    await act(async () => {
      fireEvent.click(screen.getByText('Open in Editor'))
    })
    expect(screen.getByText('Opened!')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(screen.getByText('Open in Editor')).toBeTruthy()
    expect(screen.queryByText('Opened!')).toBeFalsy()
  })

  it('resets confirmation state after 3 seconds timeout', () => {
    render(<SettingsAdvanced />)
    fireEvent.click(screen.getByText('Reset to Defaults'))
    expect(screen.getByText('Click Again to Confirm')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect(screen.getByText('Reset to Defaults')).toBeTruthy()
  })

  it('performs reset on second click and calls refresh', async () => {
    render(<SettingsAdvanced />)

    // First click — enters confirm state
    fireEvent.click(screen.getByText('Reset to Defaults'))
    expect(screen.getByText('Click Again to Confirm')).toBeTruthy()

    // Second click — actually resets
    await act(async () => {
      fireEvent.click(screen.getByText('Click Again to Confirm'))
    })

    expect(mockReset).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows Resetting... state during reset', async () => {
    let resolveReset: () => void
    mockReset.mockReturnValue(
      new Promise<void>(r => {
        resolveReset = r
      })
    )

    render(<SettingsAdvanced />)

    // Enter confirm state
    fireEvent.click(screen.getByText('Reset to Defaults'))

    // Start reset
    act(() => {
      fireEvent.click(screen.getByText('Click Again to Confirm'))
    })

    expect(screen.getByText('Resetting...')).toBeTruthy()

    // Complete the reset
    await act(async () => {
      resolveReset!()
    })
  })
})
