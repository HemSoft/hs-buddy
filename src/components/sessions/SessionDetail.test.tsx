import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionDetail } from './SessionDetail'
import type { CopilotSession, SessionDigest } from '../../types/copilotSession'

vi.mock('./SessionDetail.css', () => ({}))

const mockLoad = vi.fn()
let hookReturn: {
  session: CopilotSession | null
  isLoading: boolean
  error: string | null
  load: typeof mockLoad
}

vi.mock('../../hooks/useCopilotSessions', () => ({
  useCopilotSessionDetail: () => hookReturn,
}))

const mockSession: CopilotSession = {
  sessionId: 'abc12345-6789-0000-1111-222233334444',
  title: 'Fix Auth Flow',
  startTime: 1_700_000_000_000,
  model: {
    id: 'gpt-4o',
    name: 'GPT-4o',
    family: 'gpt4',
    vendor: 'openai',
    multiplier: '1x',
    multiplierNumeric: 1,
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
  },
  requestCount: 5,
  results: [
    {
      prompt: 'Help me fix auth',
      promptTokens: 200,
      outputTokens: 800,
      firstProgressMs: 100,
      totalElapsedMs: 2500,
      toolCallCount: 3,
      toolNames: ['readFile', 'editFile'],
    },
    {
      prompt: 'Now add tests',
      promptTokens: 300,
      outputTokens: 1200,
      firstProgressMs: 80,
      totalElapsedMs: 4000,
      toolCallCount: 0,
      toolNames: [],
    },
  ],
  totalPromptTokens: 500,
  totalOutputTokens: 2000,
  totalToolCalls: 3,
  toolsUsed: ['readFile', 'editFile'],
  totalDurationMs: 6500,
  workspaceHash: 'ws-1',
  filePath: '/sessions/abc.jsonl',
}

const mockDigest: SessionDigest = {
  sessionId: 'abc12345-6789-0000-1111-222233334444',
  workspaceName: 'hs-buddy',
  model: 'GPT-4o',
  agentMode: 'agent',
  requestCount: 5,
  totalPromptTokens: 500,
  totalOutputTokens: 2000,
  totalToolCalls: 3,
  totalDurationMs: 6500,
  tokenEfficiency: 4.0,
  toolDensity: 0.6,
  searchChurn: 2,
  estimatedCost: 0.0345,
  dominantTools: ['readFile', 'editFile', 'grep'],
  firstPrompt: 'Help me fix auth',
  sessionDate: 1_700_000_000_000,
  digestedAt: Date.now(),
}

describe('SessionDetail', () => {
  const onBack = vi.fn()
  const filePath = '/sessions/abc.jsonl'

  beforeEach(() => {
    vi.clearAllMocks()
    hookReturn = { session: null, isLoading: false, error: null, load: mockLoad }
    window.copilotSessions = {
      ...window.copilotSessions,
      computeDigest: vi.fn().mockResolvedValue(mockDigest),
    }
  })

  it('shows loading state', () => {
    hookReturn = { session: null, isLoading: true, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('Loading session…')).toBeTruthy()
  })

  it('shows error state', () => {
    hookReturn = { session: null, isLoading: false, error: 'Network failure', load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('Network failure')).toBeTruthy()
  })

  it('shows not-found when session is null after loading', () => {
    hookReturn = { session: null, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('Session not found.')).toBeTruthy()
  })

  it('renders session data', () => {
    hookReturn = { session: mockSession, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('Fix Auth Flow')).toBeTruthy()
    expect(screen.getByText('GPT-4o')).toBeTruthy()
    expect(screen.getByText('1x')).toBeTruthy()
  })

  it('back button calls onBack', () => {
    hookReturn = { session: mockSession, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    fireEvent.click(screen.getByText('Back to Sessions'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows request list with counts', () => {
    hookReturn = { session: mockSession, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('Request Timeline (2 results)')).toBeTruthy()
    expect(screen.getByText('#1')).toBeTruthy()
    expect(screen.getByText('#2')).toBeTruthy()
  })

  it('shows meta cards with formatted values', () => {
    hookReturn = { session: mockSession, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('5')).toBeTruthy() // requestCount
    expect(screen.getByText('3')).toBeTruthy() // totalToolCalls
    expect(screen.getByText('6.5s')).toBeTruthy() // duration
  })

  it('compute digest button triggers computation and shows results', async () => {
    hookReturn = { session: mockSession, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)

    const btn = screen.getByText('Compute Efficiency Digest')
    expect(btn).toBeTruthy()
    fireEvent.click(btn)

    expect(window.copilotSessions.computeDigest).toHaveBeenCalledWith(filePath)

    await waitFor(() => {
      expect(screen.getByText('Token Efficiency')).toBeTruthy()
    })
    expect(screen.getByText('4.00')).toBeTruthy()
    expect(screen.getByText('0.6')).toBeTruthy()
    expect(screen.getByText('$0.0345')).toBeTruthy()
    expect(screen.getByText('readFile, editFile, grep')).toBeTruthy()
  })

  it('shows tools used section', () => {
    hookReturn = { session: mockSession, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('Tools Used')).toBeTruthy()
    expect(screen.getByText('readFile')).toBeTruthy()
    expect(screen.getByText('editFile')).toBeTruthy()
  })

  it('falls back to sessionId prefix when title is empty', () => {
    const noTitle = { ...mockSession, title: '' }
    hookReturn = { session: noTitle, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath={filePath} onBack={onBack} />)
    expect(screen.getByText('Session abc12345')).toBeTruthy()
  })
})
