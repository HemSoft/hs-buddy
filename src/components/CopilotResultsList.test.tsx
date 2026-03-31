import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CopilotResultsList } from './CopilotResultsList'

vi.mock('../hooks/useConvex', () => ({
  useCopilotResultsRecent: () => [
    {
      _id: 'result-1',
      prompt: 'Fix the login bug in auth.ts that causes infinite redirects',
      status: 'completed',
      model: 'gpt-4',
      _creationTime: Date.now() - 3600000,
      durationMs: 45000,
      output: 'Fixed the redirect loop',
    },
    {
      _id: 'result-2',
      prompt: 'Add unit tests for the data cache service',
      status: 'running',
      model: 'claude-opus',
      _creationTime: Date.now() - 600000,
    },
    {
      _id: 'result-3',
      prompt: 'Refactor the sidebar component tree',
      status: 'failed',
      model: 'gpt-4',
      _creationTime: Date.now() - 7200000,
      errorMessage: 'Rate limit exceeded',
    },
    {
      _id: 'result-4',
      prompt: 'Pending task for later',
      status: 'pending',
      model: 'gpt-4',
      _creationTime: Date.now(),
    },
  ],
  useCopilotResultMutations: () => ({
    remove: vi.fn(),
  }),
}))

describe('CopilotResultsList', () => {
  const mockOnOpenResult = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
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
})
