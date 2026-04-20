import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsPullRequests } from './SettingsPullRequests'

const mockSetRefreshInterval = vi.fn()
const mockSetAutoRefresh = vi.fn()
const mockSetRecentlyMergedDays = vi.fn()

let mockLoading = false

let mockAutoRefresh = true

vi.mock('../../hooks/useConfig', () => ({
  usePRSettings: () => ({
    refreshInterval: 5,
    autoRefresh: mockAutoRefresh,
    recentlyMergedDays: 14,
    loading: mockLoading,
    setRefreshInterval: mockSetRefreshInterval,
    setAutoRefresh: mockSetAutoRefresh,
    setRecentlyMergedDays: mockSetRecentlyMergedDays,
  }),
}))

describe('SettingsPullRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoading = false
    mockAutoRefresh = true
  })

  it('renders loading state', () => {
    mockLoading = true
    render(<SettingsPullRequests />)
    expect(screen.getByText('Loading PR settings...')).toBeTruthy()
  })

  it('renders page heading', () => {
    render(<SettingsPullRequests />)
    expect(screen.getByText('Pull Requests')).toBeTruthy()
  })

  it('renders auto refresh toggle', () => {
    render(<SettingsPullRequests />)
    expect(screen.getByLabelText('Enable Auto Refresh')).toBeTruthy()
  })

  it('shows refresh interval select', () => {
    render(<SettingsPullRequests />)
    expect(screen.getByText('5 minutes')).toBeTruthy()
  })

  it('shows recently merged days select', () => {
    render(<SettingsPullRequests />)
    expect(screen.getByText('Last 14 days')).toBeTruthy()
  })

  it('toggles auto refresh', () => {
    render(<SettingsPullRequests />)
    fireEvent.click(screen.getByLabelText('Enable Auto Refresh'))
    expect(mockSetAutoRefresh).toHaveBeenCalledWith(false)
  })

  it('changes refresh interval', () => {
    render(<SettingsPullRequests />)
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: '15' } })
    expect(mockSetRefreshInterval).toHaveBeenCalledWith(15)
  })

  it('changes recently merged days', () => {
    render(<SettingsPullRequests />)
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '30' } })
    expect(mockSetRecentlyMergedDays).toHaveBeenCalledWith(30)
  })

  it('renders inactive toggle when autoRefresh is false', () => {
    mockAutoRefresh = false
    render(<SettingsPullRequests />)
    const toggle = screen.getByRole('button', { name: /enable auto refresh/i })
    expect(toggle.className).not.toContain('active')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})
