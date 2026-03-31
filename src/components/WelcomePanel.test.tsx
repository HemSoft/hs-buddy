import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomePanel } from './WelcomePanel'

vi.mock('../hooks/useConvex', () => ({
  useBuddyStats: () => ({
    prsViewed: 10,
    prsReviewed: 5,
    prsMergedWatched: 2,
    reposBrowsed: 8,
    runsTriggered: 15,
    runsCompleted: 12,
    runsFailed: 3,
    firstLaunchDate: Date.now() - 86400000 * 30,
    appLaunches: 42,
    totalUptimeMs: 3600000,
    lastSessionStart: Date.now() - 60000,
  }),
  useRepoBookmarks: () => [
    { _id: 'bm1', org: 'acme', repo: 'web' },
    { _id: 'bm2', org: 'acme', repo: 'api' },
  ],
}))

vi.mock('../hooks/useCopilotUsage', () => ({
  useCopilotUsage: () => ({
    accounts: [{ username: 'testuser', org: 'testorg' }],
    quotas: {},
    orgBudgets: {},
    uniqueOrgs: ['testorg'],
    refreshAll: vi.fn(),
    anyLoading: false,
    aggregateTotals: { totalUsed: 250, totalOverageCost: 5.0 },
    aggregateProjections: { projectedTotal: 500, projectedOverageCost: 10.0 },
    orgOverageFromQuotas: {},
  }),
}))

describe('WelcomePanel', () => {
  const onNavigate = vi.fn()
  const onSectionChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders app name', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Buddy')).toBeTruthy()
  })

  it('renders tagline', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Your Universal Productivity Companion')).toBeTruthy()
  })

  it('renders copilot usage section', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Command Center')).toBeTruthy()
  })

  it('renders activity overview section', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('Workspace Pulse')).toBeTruthy()
  })

  it('renders quick action buttons', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('My PRs')).toBeTruthy()
    expect(screen.getByText('Organizations')).toBeTruthy()
    expect(screen.getByText('Jobs')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('navigates to My PRs on click', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('My PRs'))
    expect(onSectionChange).toHaveBeenCalledWith('github')
    expect(onNavigate).toHaveBeenCalledWith('pr-my-prs')
  })

  it('navigates to Settings on click', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Settings'))
    expect(onSectionChange).toHaveBeenCalledWith('settings')
    expect(onNavigate).toHaveBeenCalledWith('settings-accounts')
  })

  it('renders footer', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('by HemSoft Developments')).toBeTruthy()
  })

  it('shows stat cards with computed values', () => {
    render(<WelcomePanel prCounts={{ open: 5, review: 3 }} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('17')).toBeTruthy() // PRs Viewed: 10+5+2
    expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1) // Active PRs: 5+3
  })

  it('shows bookmarks count', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('2')).toBeTruthy() // 2 bookmarks
  })

  it('renders copilot usage stats', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    expect(screen.getByText('250')).toBeTruthy() // Total Used
    expect(screen.getByText('$5.00')).toBeTruthy() // Total Overage
  })

  it('navigates to copilot usage when Open Usage clicked', () => {
    render(<WelcomePanel prCounts={{}} onNavigate={onNavigate} onSectionChange={onSectionChange} />)
    fireEvent.click(screen.getByText('Open Usage'))
    expect(onSectionChange).toHaveBeenCalledWith('copilot')
    expect(onNavigate).toHaveBeenCalledWith('copilot-usage')
  })
})
