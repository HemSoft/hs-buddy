import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CopilotResultsList } from './CopilotResultsList'

const { mockUseCopilotResultsRecent, mockRemove } = vi.hoisted(() => ({
  mockUseCopilotResultsRecent: vi.fn(),
  mockRemove: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../hooks/useConvex', () => ({
  useCopilotResultsRecent: mockUseCopilotResultsRecent,
  useCopilotResultMutations: () => ({
    remove: mockRemove,
  }),
}))

vi.mock('../utils/dateUtils', () => ({
  formatDateCompact: () => 'Jun 1',
  formatDuration: (ms: number) => `${Math.round(ms / 1000)}s`,
}))

vi.mock('./shared/statusDisplay', () => ({
  getStatusIcon: () => <span data-testid="status-icon" />,
}))

const mockResults = [
  {
    _id: 'result-1',
    prompt: 'Fix the login bug in auth.ts that causes infinite redirects',
    status: 'completed',
    model: 'gpt-4',
    category: 'general',
    createdAt: Date.now() - 3600000,
    duration: 45000,
    metadata: null,
  },
  {
    _id: 'result-2',
    prompt: 'Add unit tests for the data cache service',
    status: 'running',
    model: 'claude-opus',
    category: 'code-analysis',
    createdAt: Date.now() - 600000,
    duration: null,
    metadata: null,
  },
  {
    _id: 'result-3',
    prompt: 'Refactor the sidebar component tree',
    status: 'failed',
    model: 'gpt-4',
    category: null,
    createdAt: Date.now() - 7200000,
    duration: null,
    metadata: null,
  },
  {
    _id: 'result-4',
    prompt: 'Pending task for later',
    status: 'pending',
    model: 'gpt-4',
    category: null,
    createdAt: Date.now(),
    duration: null,
    metadata: null,
  },
]

describe('CopilotResultsList', () => {
  const mockOnOpenResult = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCopilotResultsRecent.mockReturnValue(mockResults)
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('renders all results', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText(/Fix the login bug/)).toBeTruthy()
    expect(screen.getByText(/Add unit tests/)).toBeTruthy()
    expect(screen.getByText(/Refactor the sidebar/)).toBeTruthy()
  })

  it('shows filter buttons', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Completed')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('filters by status when clicking filter button', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    fireEvent.click(screen.getByText('Completed'))
    expect(screen.getByText(/Fix the login bug/)).toBeTruthy()
    expect(screen.queryByText(/Add unit tests/)).toBeFalsy()
  })

  it('filters to running results', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    fireEvent.click(screen.getByText('Running'))
    expect(screen.getByText(/Add unit tests/)).toBeTruthy()
    expect(screen.queryByText(/Fix the login bug/)).toBeFalsy()
  })

  it('shows all results when All filter selected', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    fireEvent.click(screen.getByText('Failed'))
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText(/Fix the login bug/)).toBeTruthy()
    expect(screen.getByText(/Add unit tests/)).toBeTruthy()
  })

  it('shows loading state when results are undefined', () => {
    mockUseCopilotResultsRecent.mockReturnValue(undefined)
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('Loading results...')).toBeTruthy()
  })

  it('shows empty state when no results match filter', () => {
    mockUseCopilotResultsRecent.mockReturnValue([mockResults[0]])
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    fireEvent.click(screen.getByText('Failed'))
    expect(screen.getByText(/No results with status "failed"/)).toBeTruthy()
  })

  it('shows generic empty state when no results exist', () => {
    mockUseCopilotResultsRecent.mockReturnValue([])
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('No results yet')).toBeTruthy()
  })

  it('calls onOpenResult when clicking a row', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    fireEvent.click(screen.getByText(/Fix the login bug/).closest('tr')!)
    expect(mockOnOpenResult).toHaveBeenCalledWith('result-1')
  })

  it('calls remove when clicking delete button', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    const deleteButtons = screen.getAllByTitle('Delete')
    fireEvent.click(deleteButtons[0])
    expect(mockRemove).toHaveBeenCalledWith({ id: 'result-1' })
    expect(mockOnOpenResult).not.toHaveBeenCalled()
  })

  it('shows PR Review title for pr-review category with metadata', () => {
    mockUseCopilotResultsRecent.mockReturnValue([
      {
        _id: 'pr-1',
        prompt: 'Review this pull request',
        status: 'completed',
        model: 'gpt-4',
        category: 'pr-review',
        createdAt: Date.now(),
        duration: 30000,
        metadata: { prTitle: 'Fix auth flow', prUrl: 'https://github.com/org/repo/pull/42' },
      },
    ])
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('PR Review: Fix auth flow')).toBeTruthy()
  })

  it('shows Open PR button for pr-review results with prUrl', () => {
    mockUseCopilotResultsRecent.mockReturnValue([
      {
        _id: 'pr-1',
        prompt: 'Review this PR',
        status: 'completed',
        model: 'gpt-4',
        category: 'pr-review',
        createdAt: Date.now(),
        duration: null,
        metadata: { prTitle: 'Fix it', prUrl: 'https://github.com/org/repo/pull/42' },
      },
    ])
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    const openPrBtn = screen.getByTitle('Open PR')
    fireEvent.click(openPrBtn)
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/org/repo/pull/42')
    expect(mockOnOpenResult).not.toHaveBeenCalled()
  })

  it('truncates long prompts with ellipsis', () => {
    const longPrompt = 'A'.repeat(100)
    mockUseCopilotResultsRecent.mockReturnValue([
      {
        _id: 'long-1',
        prompt: longPrompt,
        status: 'completed',
        model: 'gpt-4',
        category: 'general',
        createdAt: Date.now(),
        duration: null,
        metadata: null,
      },
    ])
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('A'.repeat(80) + '…')).toBeTruthy()
  })

  it('shows result count in header', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('shows category badge', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('general')).toBeTruthy()
    expect(screen.getByText('code-analysis')).toBeTruthy()
  })

  it('shows model badge', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getAllByText('gpt-4').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('claude-opus')).toBeTruthy()
  })

  it('shows formatted duration for completed results', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getByText('45s')).toBeTruthy()
  })

  it('shows dash when duration is missing', () => {
    render(<CopilotResultsList onOpenResult={mockOnOpenResult} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})
