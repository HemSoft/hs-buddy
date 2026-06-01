import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopUsersSection } from './TopUsersSection'
import type { CopilotSeatInfo } from '../../hooks/useCopilotSeats'

function makeSeat(overrides: Partial<CopilotSeatInfo> = {}): CopilotSeatInfo {
  return {
    login: 'alice',
    displayName: null,
    org: 'org1',
    planType: 'business',
    lastActivityAt: '2026-05-16T12:00:00Z',
    lastActivityEditor: 'vscode/1.95.0',
    createdAt: '2024-01-01T00:00:00Z',
    pendingCancellation: null,
    premiumRequests: null,
    lastPremiumRequestDate: null,
    ...overrides,
  }
}

describe('TopUsersSection', () => {
  it('renders nothing when no seats and not loading', () => {
    const { container } = render(
      <TopUsersSection seats={[]} loading={false} orgErrors={[]} truncated={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders heading and table with seats', () => {
    const seats = [
      makeSeat({ login: 'alice', org: 'org1' }),
      makeSeat({ login: 'bob', org: 'org2', lastActivityEditor: 'jetbrains/251.0' }),
    ]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)

    expect(screen.getByText('Top AI Credit Users')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('org1')).toBeInTheDocument()
    expect(screen.getByText('org2')).toBeInTheDocument()
    expect(screen.getByText('JetBrains')).toBeInTheDocument()
  })

  it('renders rank numbers', () => {
    const seats = [makeSeat({ login: 'alice' }), makeSeat({ login: 'bob' })]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    const rankCells = screen.getAllByText(/^[12]$/)
    expect(rankCells.length).toBeGreaterThanOrEqual(2)
  })

  it('shows loading spinner', () => {
    render(<TopUsersSection seats={[]} loading={true} orgErrors={[]} truncated={false} />)
    expect(screen.getByText('Top AI Credit Users')).toBeInTheDocument()
  })

  it('displays org errors', () => {
    render(
      <TopUsersSection
        seats={[]}
        loading={false}
        orgErrors={[{ org: 'org1', error: 'No billing access' }]}
        truncated={false}
      />
    )
    expect(screen.getByText(/No billing access/)).toBeInTheDocument()
  })

  it('shows truncation warning', () => {
    const seats = [makeSeat()]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={true} />)
    expect(screen.getByText(/Showing top 50/)).toBeInTheDocument()
  })

  it('formats editor names', () => {
    const seats = [
      makeSeat({ login: 'vs', lastActivityEditor: 'vscode/1.95.0' }),
      makeSeat({ login: 'jb', lastActivityEditor: 'jetbrains/251.0' }),
      makeSeat({ login: 'custom', lastActivityEditor: 'custom-editor' }),
      makeSeat({ login: 'no', lastActivityEditor: null }),
    ]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    expect(screen.getByText('VS Code')).toBeInTheDocument()
    expect(screen.getByText('JetBrains')).toBeInTheDocument()
    expect(screen.getByText('custom-editor')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('capitalizes plan type', () => {
    const seats = [
      makeSeat({ planType: 'enterprise' }),
      makeSeat({ login: 'free', planType: null }),
    ]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    expect(screen.getByText('Enterprise')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('displays premium request counts with formatting', () => {
    const seats = [
      makeSeat({ login: 'alice', premiumRequests: 1234 }),
      makeSeat({ login: 'bob', premiumRequests: 0 }),
    ]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('shows dash for null premium requests', () => {
    const seats = [makeSeat({ login: 'alice', premiumRequests: null })]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('does not render Last Active column', () => {
    const seats = [makeSeat()]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.queryByText('Last Active')).not.toBeInTheDocument()
    expect(screen.queryByText('Last Request')).not.toBeInTheDocument()
  })

  it('shows display name when available, login as tooltip', () => {
    const seats = [makeSeat({ login: 'jdoe', displayName: 'Jane Doe' })]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByTitle('jdoe')).toBeInTheDocument()
  })

  it('falls back to login when displayName is null', () => {
    const seats = [makeSeat({ login: 'jdoe', displayName: null })]
    render(<TopUsersSection seats={seats} loading={false} orgErrors={[]} truncated={false} />)
    expect(screen.getByText('jdoe')).toBeInTheDocument()
  })
})
