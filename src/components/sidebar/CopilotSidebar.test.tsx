import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CopilotSidebar } from './CopilotSidebar'

let mockRecentResults: Array<{
  _id: string
  category: string
  metadata?: Record<string, unknown> | null
  prompt: string
  status: string
  createdAt: number
}> = []

let mockActiveCount: { pending?: number; running?: number } | undefined

vi.mock('../../hooks/useConvex', () => ({
  useCopilotResultsRecent: () => mockRecentResults,
  useCopilotActiveCount: () => mockActiveCount,
}))

vi.mock('../../utils/dateUtils', () => ({
  formatDistanceToNow: () => '2m ago',
}))

vi.mock('../shared/statusDisplay', () => ({
  getStatusIcon: (status: string) => <span data-testid={`status-${status}`}>{status}</span>,
}))

describe('CopilotSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveCount = { pending: 2, running: 1 }
    mockRecentResults = [
      {
        _id: 'review-1',
        category: 'pr-review',
        metadata: { prTitle: 'Improve sidebar tests' },
        prompt: 'Review the sidebar coverage plan',
        status: 'completed',
        createdAt: Date.now(),
      },
      {
        _id: 'prompt-1',
        category: 'prompt',
        prompt: '12345678901234567890123456789012345678901',
        status: 'running',
        createdAt: Date.now(),
      },
    ]
  })

  it('renders the prompt section with active and recent result counts', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem="copilot-all-results" />)

    expect(screen.getByText('COPILOT')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('New Prompt')).toBeTruthy()
    expect(screen.getByText('All Results')).toBeTruthy()
    expect(screen.getByText('Copilot Usage')).toBeTruthy()
    expect(screen.getByText('Session Explorer')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.queryByText('PR Review: Improve sidebar tests')).toBeFalsy()
  })

  it('toggles and renders recent results with formatted labels', () => {
    const onItemSelect = vi.fn()

    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)

    expect(screen.getByText('PR Review: Improve sidebar tests')).toBeTruthy()
    expect(screen.getByText('1234567890123456789012345678901234567890...')).toBeTruthy()
    expect(screen.getAllByText('2m ago')).toHaveLength(2)
    expect(screen.getByTestId('status-completed')).toBeTruthy()
    expect(screen.getByTestId('status-running')).toBeTruthy()

    fireEvent.click(screen.getByTitle('12345678901234567890123456789012345678901'))
    expect(onItemSelect).toHaveBeenCalledWith('copilot-result:prompt-1')
  })

  it('supports keyboard interaction for section toggles and item selection', () => {
    const onItemSelect = vi.fn()

    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(screen.getByText('Prompt').closest('[role="button"]') as HTMLElement, {
      key: ' ',
    })
    expect(screen.queryByText('New Prompt')).toBeFalsy()

    fireEvent.keyDown(screen.getByText('Prompt').closest('[role="button"]') as HTMLElement, {
      key: 'Enter',
    })
    expect(screen.getByText('New Prompt')).toBeTruthy()

    fireEvent.keyDown(screen.getByText('New Prompt').closest('[role="button"]') as HTMLElement, {
      key: 'Enter',
    })
    expect(onItemSelect).toHaveBeenCalledWith('copilot-prompt')
  })

  it('shows an empty state when there are no recent results', () => {
    mockRecentResults = []

    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)

    expect(screen.getByText('No results yet')).toBeTruthy()
    expect(screen.queryByText('2')).toBeFalsy()
  })
})
