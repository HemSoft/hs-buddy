import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionExplorer } from './SessionExplorer'

const mockScan = vi.fn()

vi.mock('../../hooks/useCopilotSessions', () => ({
  useCopilotSessions: () => ({
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
      },
    ],
    totalCount: 2,
    isLoading: false,
    error: null,
    scan: mockScan,
  }),
}))

describe('SessionExplorer', () => {
  const onSelectSession = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
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
})
