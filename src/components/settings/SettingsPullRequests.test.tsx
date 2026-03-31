import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsPullRequests } from './SettingsPullRequests'

const mockSetRefreshInterval = vi.fn()
const mockSetAutoRefresh = vi.fn()
const mockSetRecentlyMergedDays = vi.fn()

vi.mock('../../hooks/useConfig', () => ({
  usePRSettings: () => ({
    refreshInterval: 5,
    autoRefresh: true,
    recentlyMergedDays: 14,
    loading: false,
    setRefreshInterval: mockSetRefreshInterval,
    setAutoRefresh: mockSetAutoRefresh,
    setRecentlyMergedDays: mockSetRecentlyMergedDays,
  }),
}))

describe('SettingsPullRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
