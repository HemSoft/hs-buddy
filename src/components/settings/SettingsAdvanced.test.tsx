import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsAdvanced } from './SettingsAdvanced'

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({
    api: {
      getStorePath: vi.fn().mockResolvedValue('/path/to/config.json'),
      openInEditor: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
    refresh: vi.fn().mockResolvedValue(undefined),
    loading: false,
  }),
}))

describe('SettingsAdvanced', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
