import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspacePulseCard } from './WorkspacePulseCard'

vi.mock('lucide-react', () => ({
  GitPullRequest: () => <span data-testid="icon-pr" />,
  Activity: () => <span data-testid="icon-activity" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  FolderGit2: () => <span data-testid="icon-folder" />,
  Play: () => <span data-testid="icon-play" />,
  Star: () => <span data-testid="icon-star" />,
  Calendar: () => <span data-testid="icon-calendar" />,
}))

vi.mock('./DashboardPrimitives', () => ({
  SectionHeading: ({
    kicker,
    title,
    caption,
  }: {
    kicker?: string
    title?: string
    caption?: string
  }) => (
    <div data-testid="section-heading">
      <span>{kicker}</span>
      <span>{title}</span>
      {caption && <span>{caption}</span>}
    </div>
  ),
  StatCard: ({ value, label, subtitle }: { value?: string; label?: string; subtitle?: string }) => (
    <div data-testid="stat-card">
      <span>{value}</span>
      <span>{label}</span>
      {subtitle && <span data-testid="stat-subtitle">{subtitle}</span>}
    </div>
  ),
  formatStatNumber: (n: number) => n.toLocaleString(),
}))

const defaultProps = {
  totalPrsViewed: 42,
  activePrs: 5,
  copilotPrReviews: 12,
  reposBrowsed: 8,
  runsTriggered: 30,
  totalFinished: 25,
  successRate: 92,
  bookmarks: 15,
  firstLaunch: new Date('2025-01-15').getTime(),
  appLaunches: 100,
}

describe('WorkspacePulseCard', () => {
  it('renders section heading', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByText('Workspace Pulse')).toBeInTheDocument()
    expect(screen.getByText('Buddy activity')).toBeInTheDocument()
  })

  it('has correct aria-label on section', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByLabelText('Buddy activity overview')).toBeInTheDocument()
  })

  it('renders all 7 stat cards', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getAllByTestId('stat-card')).toHaveLength(7)
  })

  it('renders PRs Viewed value', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByText('PRs Viewed')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders Active PRs value', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByText('Active PRs')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders Bookmarks value', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByText('Bookmarks')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('shows success rate subtitle when totalFinished > 0', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('omits success rate subtitle when totalFinished is 0', () => {
    render(<WorkspacePulseCard {...defaultProps} totalFinished={0} />)
    // The Runs Executed card should not have a subtitle
    const subtitles = screen.queryAllByTestId('stat-subtitle')
    const percentSubtitles = subtitles.filter(el => el.textContent?.includes('%'))
    expect(percentSubtitles).toHaveLength(0)
  })

  it('shows formatted date for Member Since', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByText('Member Since')).toBeInTheDocument()
    expect(screen.getByText(/Jan/)).toBeInTheDocument()
  })

  it('shows "Today" when firstLaunch is 0', () => {
    render(<WorkspacePulseCard {...defaultProps} firstLaunch={0} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('shows session count subtitle with plural', () => {
    render(<WorkspacePulseCard {...defaultProps} />)
    expect(screen.getByText('100 sessions')).toBeInTheDocument()
  })

  it('shows singular session when appLaunches is 1', () => {
    render(<WorkspacePulseCard {...defaultProps} appLaunches={1} />)
    expect(screen.getByText('1 session')).toBeInTheDocument()
  })

  it('omits session subtitle when appLaunches is 0', () => {
    render(<WorkspacePulseCard {...defaultProps} appLaunches={0} />)
    // Member Since card should have no subtitle
    const memberSinceCard = screen.getByText('Member Since').closest('[data-testid="stat-card"]')
    expect(memberSinceCard?.querySelector('[data-testid="stat-subtitle"]')).toBeNull()
  })
})
