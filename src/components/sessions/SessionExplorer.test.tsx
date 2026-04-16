import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionExplorer } from './SessionExplorer'

const mockScan = vi.fn()

let mockReturnValue: ReturnType<typeof defaultMock>

function defaultMock() {
  return {
    sessions: [
      {
        sessionId: 'abc12345-6789',
        title: 'Fix Auth Flow',
        workspaceHash: 'ws-1',
        workspaceName: 'hs-buddy',
        turnCount: 10,
        sizeBytes: 2048,
        modifiedAt: Date.now() - 3600000,
        createdAt: Date.now() - 7200000,
        firstPrompt: 'Help me fix the auth flow',
        requestCount: 5,
        filePath: '/sessions/abc.jsonl',
        agent: 'copilot',
      },
      {
        sessionId: 'def67890-1234',
        title: '',
        workspaceHash: 'ws-1',
        workspaceName: 'hs-buddy',
        turnCount: 3,
        sizeBytes: 512,
        modifiedAt: Date.now() - 86400000 * 2,
        createdAt: Date.now() - 86400000 * 3,
        firstPrompt: 'How do I deploy to production',
        requestCount: 0,
        filePath: '/sessions/def.jsonl',
        agent: 'copilot',
      },
    ],
    totalCount: 2,
    isLoading: false,
    error: null as string | null,
    scan: mockScan,
  }
}

vi.mock('../../hooks/useCopilotSessions', () => ({
  useCopilotSessions: () => mockReturnValue,
}))

describe('SessionExplorer', () => {
  const onSelectSession = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockReturnValue = defaultMock()
  })

  it('renders session explorer header', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Session Explorer')).toBeTruthy()
  })

  it('shows sessions stat card', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Sessions')).toBeTruthy()
  })

  it('renders scan button', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Scan')).toBeTruthy()
  })

  it('renders session with title', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Fix Auth Flow')).toBeTruthy()
  })

  it('calls scan on mount', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(mockScan).toHaveBeenCalled()
  })

  it('renders empty state when no sessions and not loading', () => {
    mockReturnValue = { ...defaultMock(), sessions: [], totalCount: 0 }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('No Copilot sessions found.')).toBeTruthy()
  })

  it('renders error message when error exists', () => {
    mockReturnValue = { ...defaultMock(), error: 'Failed to scan' }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Failed to scan')).toBeTruthy()
  })

  it('shows Scanning button text when loading', () => {
    mockReturnValue = { ...defaultMock(), isLoading: true }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Scanning…')).toBeTruthy()
  })

  it('disables scan button when loading', () => {
    mockReturnValue = { ...defaultMock(), isLoading: true }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    const btn = screen.getByText('Scanning…').closest('button')!
    expect(btn.disabled).toBe(true)
  })

  it('shows total size in stats row', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Total Size')).toBeTruthy()
  })

  it('shows project count in stats row', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Projects')).toBeTruthy()
  })

  it('displays session without title using firstPrompt', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('How do I deploy to production')).toBeTruthy()
  })

  it('falls back to session ID when no title or firstPrompt', () => {
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        {
          sessionId: 'zzzz1111-2222',
          title: '',
          workspaceHash: 'ws-x',
          workspaceName: 'test-proj',
          turnCount: 1,
          sizeBytes: 100,
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          firstPrompt: '',
          requestCount: 0,
          filePath: '/sessions/zzz.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 1,
    }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Session zzzz1111')).toBeTruthy()
  })

  it('truncates long firstPrompt with ellipsis', () => {
    const longPrompt = 'A'.repeat(100)
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        {
          sessionId: 'long-prompt-1234',
          title: '',
          workspaceHash: 'ws-x',
          workspaceName: 'test-proj',
          turnCount: 1,
          sizeBytes: 100,
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          firstPrompt: longPrompt,
          requestCount: 0,
          filePath: '/sessions/long.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 1,
    }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    const truncated = screen.getByText(/^A+…$/)
    expect(truncated).toBeTruthy()
  })

  it('calls onSelectSession when clicking a session item', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    fireEvent.click(screen.getByText('Fix Auth Flow'))
    expect(onSelectSession).toHaveBeenCalledWith('/sessions/abc.jsonl')
  })

  it('toggles workspace collapse on click', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    // Workspace is expanded by default (first 3 are auto-expanded)
    expect(screen.getByText('Fix Auth Flow')).toBeTruthy()
    // Click workspace header to collapse
    fireEvent.click(screen.getByText('hs-buddy'))
    // Sessions should be hidden
    expect(screen.queryByText('Fix Auth Flow')).toBeNull()
    // Click again to expand
    fireEvent.click(screen.getByText('hs-buddy'))
    expect(screen.getByText('Fix Auth Flow')).toBeTruthy()
  })

  it('shows prompt preview when title differs from firstPrompt', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    // First session has title "Fix Auth Flow" and firstPrompt "Help me fix the auth flow"
    expect(screen.getByText('Help me fix the auth flow')).toBeTruthy()
  })

  it('shows requestCount when greater than 0', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('5 requests')).toBeTruthy()
  })

  it('does not show requestCount when zero', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.queryByText('0 requests')).toBeNull()
  })

  it('formats bytes correctly for KB', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('2 KB')).toBeTruthy()
  })

  it('formats bytes correctly for B', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('512 B')).toBeTruthy()
  })

  it('formats MB for large sessions', () => {
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        {
          sessionId: 'big-1',
          title: 'Big Session',
          workspaceHash: 'ws-big',
          workspaceName: 'big-proj',
          turnCount: 100,
          sizeBytes: 2 * 1024 * 1024,
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          firstPrompt: '',
          requestCount: 50,
          filePath: '/sessions/big.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 1,
    }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    // "2.0 MB" appears in both the session meta and the Total Size stat
    expect(screen.getAllByText('2.0 MB').length).toBeGreaterThanOrEqual(1)
  })

  it('groups sessions by workspace', () => {
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        ...defaultMock().sessions,
        {
          sessionId: 'other-1',
          title: 'Other Project Session',
          workspaceHash: 'ws-2',
          workspaceName: 'other-project',
          turnCount: 5,
          sizeBytes: 1024,
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          firstPrompt: '',
          requestCount: 2,
          filePath: '/sessions/other.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 3,
    }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('hs-buddy')).toBeTruthy()
    expect(screen.getByText('other-project')).toBeTruthy()
  })

  it('shows unnamed workspace with hash prefix', () => {
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        {
          sessionId: 'noname-1',
          title: 'A session',
          workspaceHash: 'abcdef12',
          workspaceName: '',
          turnCount: 1,
          sizeBytes: 100,
          modifiedAt: Date.now(),
          createdAt: Date.now(),
          firstPrompt: '',
          requestCount: 0,
          filePath: '/sessions/noname.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 1,
    }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText(/unnamed.*abcdef12/)).toBeTruthy()
  })

  it('shows date group labels', () => {
    // The first session is from 1 hour ago → "Today"
    // The second session is from 2 days ago → "This Week"
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('This Week')).toBeTruthy()
  })

  it('handles formatDate with zero timestamp', () => {
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        {
          sessionId: 'nodate-1',
          title: 'No Date',
          workspaceHash: 'ws-x',
          workspaceName: 'test',
          turnCount: 1,
          sizeBytes: 100,
          modifiedAt: 0,
          createdAt: 0,
          firstPrompt: '',
          requestCount: 0,
          filePath: '/sessions/nodate.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 1,
    }
    // Should not crash even with 0 timestamp
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('No Date')).toBeTruthy()
  })

  it('does not show stats row when no sessions', () => {
    mockReturnValue = { ...defaultMock(), sessions: [], totalCount: 0 }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.queryByText('Total Size')).toBeNull()
  })

  it('shows session count and workspace count', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    // totalCount is 2, workspaceGroups is 1
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
  })

  it('shows "Yesterday" date group for sessions from yesterday', () => {
    // Calculate yesterday midday precisely: start of today minus 12 hours
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayMs = todayStart.getTime() - 1 // 1ms before today = firmly in yesterday
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        {
          sessionId: 'yest-1',
          title: 'Yesterday Session',
          workspaceHash: 'ws-y',
          workspaceName: 'proj-y',
          turnCount: 1,
          sizeBytes: 100,
          modifiedAt: yesterdayMs,
          createdAt: yesterdayMs,
          firstPrompt: '',
          requestCount: 0,
          filePath: '/sessions/yest.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 1,
    }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Yesterday')).toBeTruthy()
  })

  it('shows "Older" date group for sessions older than a week', () => {
    const twoWeeksAgo = Date.now() - 86400000 * 14
    mockReturnValue = {
      ...defaultMock(),
      sessions: [
        {
          sessionId: 'old-1',
          title: 'Old Session',
          workspaceHash: 'ws-o',
          workspaceName: 'proj-o',
          turnCount: 1,
          sizeBytes: 100,
          modifiedAt: twoWeeksAgo,
          createdAt: twoWeeksAgo,
          firstPrompt: '',
          requestCount: 0,
          filePath: '/sessions/old.jsonl',
          agent: 'copilot',
        },
      ],
      totalCount: 1,
    }
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    expect(screen.getByText('Older')).toBeTruthy()
  })

  it('shows workspace session count badge', () => {
    render(<SessionExplorer onSelectSession={onSelectSession} />)
    // ws-1 has 2 sessions → should show "2" in the workspace header
    const countBadges = screen.getAllByText('2')
    expect(countBadges.length).toBeGreaterThanOrEqual(1)
  })
})
