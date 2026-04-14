import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionDetail } from './SessionDetail'
import type { CopilotSession, SessionRequestResult } from '../../types/copilotSession'

const mockLoad = vi.fn()
const mockComputeDigest = vi.fn()

vi.mock('../../hooks/useCopilotSessions', () => ({
  useCopilotSessionDetail: () => mockHookReturn,
}))

const baseResult: SessionRequestResult = {
  prompt: 'Fix the auth flow',
  promptTokens: 1500,
  outputTokens: 3000,
  firstProgressMs: 200,
  totalElapsedMs: 5000,
  toolCallCount: 3,
  toolNames: ['grep', 'edit', 'view'],
}

const baseSession: CopilotSession = {
  sessionId: 'abc12345-6789',
  title: 'Fix Auth Flow',
  startTime: 1700000000000,
  model: {
    id: 'gpt-4o',
    name: 'GPT-4o',
    family: 'gpt',
    vendor: 'openai',
    multiplier: '1x',
    multiplierNumeric: 1,
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
  },
  requestCount: 2,
  results: [
    baseResult,
    {
      ...baseResult,
      prompt: 'Deploy fix',
      promptTokens: 500,
      outputTokens: 200,
      totalElapsedMs: 1200,
      toolCallCount: 1,
      toolNames: ['bash'],
    },
  ],
  totalPromptTokens: 2000,
  totalOutputTokens: 3200,
  totalToolCalls: 4,
  toolsUsed: ['grep', 'edit', 'view', 'bash'],
  totalDurationMs: 6200,
  workspaceHash: 'ws-1',
  filePath: '/sessions/abc.jsonl',
}

let mockHookReturn: {
  session: CopilotSession | null
  isLoading: boolean
  error: string | null
  load: typeof mockLoad
}

describe('SessionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      session: baseSession,
      isLoading: false,
      error: null,
      load: mockLoad,
    }

    Object.defineProperty(window, 'copilotSessions', {
      value: { computeDigest: mockComputeDigest },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state', () => {
    mockHookReturn = { session: null, isLoading: true, error: null, load: mockLoad }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('Loading session…')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockHookReturn = { session: null, isLoading: false, error: 'Failed to parse', load: mockLoad }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('Failed to parse')).toBeInTheDocument()
  })

  it('shows not found when session is null', () => {
    mockHookReturn = { session: null, isLoading: false, error: null, load: mockLoad }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('Session not found.')).toBeInTheDocument()
  })

  it('calls load with filePath on mount', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(mockLoad).toHaveBeenCalledWith('/test.jsonl')
  })

  it('renders session title', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('Fix Auth Flow')).toBeInTheDocument()
  })

  it('falls back to session ID prefix when title is empty', () => {
    mockHookReturn.session = { ...baseSession, title: '' }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('Session abc12345')).toBeInTheDocument()
  })

  it('renders model name', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('GPT-4o')).toBeInTheDocument()
  })

  it('renders model multiplier', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('1x')).toBeInTheDocument()
  })

  it('renders request count', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('formats token counts with K suffix', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('2.0K')).toBeInTheDocument()
    expect(screen.getByText('3.2K')).toBeInTheDocument()
  })

  it('renders total tool calls', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('formats duration in seconds', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('6.2s')).toBeInTheDocument()
  })

  it('renders tools used badges', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    const badges = screen.getAllByText(/^(grep|edit|view|bash)$/)
    expect(badges.length).toBeGreaterThanOrEqual(4)
  })

  it('renders request timeline items', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('Request Timeline (2 results)')).toBeInTheDocument()
    expect(screen.getByText('Fix the auth flow')).toBeInTheDocument()
    expect(screen.getByText('Deploy fix')).toBeInTheDocument()
  })

  it('displays tool names in request items', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    // toolCallCount === toolNames.length, so no "(N calls)" suffix
    expect(screen.getByText('grep, edit, view')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    render(<SessionDetail filePath="/test.jsonl" onBack={onBack} />)
    fireEvent.click(screen.getByText('Back to Sessions'))
    expect(onBack).toHaveBeenCalled()
  })

  it('renders compute digest button', () => {
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('Compute Efficiency Digest')).toBeInTheDocument()
  })

  it('computes and displays digest on button click', async () => {
    mockComputeDigest.mockResolvedValue({
      tokenEfficiency: 1.6,
      toolDensity: 2.0,
      searchChurn: 5,
      estimatedCost: 0.0123,
      dominantTools: ['grep', 'edit'],
    })

    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Compute Efficiency Digest'))

    await waitFor(() => {
      expect(screen.getByText('1.60')).toBeInTheDocument()
    })
    expect(screen.getByText('2.0')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('$0.0123')).toBeInTheDocument()
    expect(screen.getByText('grep, edit')).toBeInTheDocument()
  })

  it('handles large token counts with M suffix', () => {
    mockHookReturn.session = {
      ...baseSession,
      totalPromptTokens: 1_500_000,
      totalOutputTokens: 2_300_000,
    }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('1.5M')).toBeInTheDocument()
    expect(screen.getByText('2.3M')).toBeInTheDocument()
  })

  it('handles small token counts without suffix', () => {
    mockHookReturn.session = {
      ...baseSession,
      totalPromptTokens: 500,
      totalOutputTokens: 200,
    }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('formats duration in milliseconds for short sessions', () => {
    mockHookReturn.session = { ...baseSession, totalDurationMs: 500 }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('500ms')).toBeInTheDocument()
  })

  it('formats duration in minutes for longer sessions', () => {
    mockHookReturn.session = { ...baseSession, totalDurationMs: 120_000 }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('2.0m')).toBeInTheDocument()
  })

  it('formats duration in hours for very long sessions', () => {
    mockHookReturn.session = { ...baseSession, totalDurationMs: 7_200_000 }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('2.0h')).toBeInTheDocument()
  })

  it('does not render tools section when no tools used', () => {
    mockHookReturn.session = { ...baseSession, toolsUsed: [] }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.queryByText('Tools Used')).not.toBeInTheDocument()
  })

  it('does not render request timeline when no results', () => {
    mockHookReturn.session = { ...baseSession, results: [] }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.queryByText(/Request Timeline/)).not.toBeInTheDocument()
  })

  it('handles digest computation failure gracefully', async () => {
    mockComputeDigest.mockRejectedValue(new Error('compute failed'))

    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Compute Efficiency Digest'))

    // Should show the button again after failure
    await waitFor(() => {
      expect(screen.getByText('Compute Efficiency Digest')).toBeInTheDocument()
    })
  })

  it('uses model.id when model.name is empty', () => {
    mockHookReturn.session = {
      ...baseSession,
      model: { ...baseSession.model!, name: '' },
    }
    render(<SessionDetail filePath="/test.jsonl" onBack={vi.fn()} />)
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
  })
})
