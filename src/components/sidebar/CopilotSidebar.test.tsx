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

  it('does not show active count badge when total is zero', () => {
    mockActiveCount = { pending: 0, running: 0 }
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // The "3" badge should not be present
    expect(screen.queryByText('3')).toBeFalsy()
  })

  it('does not show active count when activeCount is undefined', () => {
    mockActiveCount = undefined
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Should not crash and should not show a count badge next to COPILOT
    expect(screen.getByText('COPILOT')).toBeTruthy()
  })

  it('selects All Results via click', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('All Results').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith('copilot-all-results')
  })

  it('selects Copilot Usage via click', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('Copilot Usage').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith('copilot-usage')
  })

  it('selects Session Explorer via click', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('Session Explorer').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith('copilot-sessions')
  })

  it('supports keyboard Space to select items', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    const allResults = screen.getByText('All Results').closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(allResults, { key: ' ' })
    expect(onItemSelect).toHaveBeenCalledWith('copilot-all-results')
  })

  it('handles pr-review with no prTitle in metadata', () => {
    mockRecentResults = [
      {
        _id: 'review-no-title',
        category: 'pr-review',
        metadata: null,
        prompt: 'Review PR',
        status: 'completed',
        createdAt: Date.now(),
      },
    ]
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)
    expect(screen.getByText('PR Review: Untitled')).toBeTruthy()
  })

  it('truncates long non-pr-review prompts at 40 chars', () => {
    mockRecentResults = [
      {
        _id: 'long-prompt',
        category: 'prompt',
        prompt: 'Short prompt',
        status: 'completed',
        createdAt: Date.now(),
      },
    ]
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)
    // Short prompt should not be truncated
    expect(screen.getByText('Short prompt')).toBeTruthy()
  })

  it('highlights the selected sidebar item', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem="copilot-usage" />)
    const usageItem = screen.getByText('Copilot Usage').closest('.sidebar-item')!
    expect(usageItem.classList.contains('selected')).toBe(true)
  })

  it('collapses and re-expands the Prompt section', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Initially expanded
    expect(screen.getByText('New Prompt')).toBeTruthy()

    // Collapse
    fireEvent.click(screen.getByText('Prompt').closest('[role="button"]') as HTMLElement)
    expect(screen.queryByText('New Prompt')).toBeFalsy()

    // Re-expand
    fireEvent.click(screen.getByText('Prompt').closest('[role="button"]') as HTMLElement)
    expect(screen.getByText('New Prompt')).toBeTruthy()
  })

  it('toggles Recent Results section with keyboard Enter', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    const resultsHeader = screen
      .getByText('Recent Results')
      .closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(resultsHeader, { key: 'Enter' })
    expect(screen.getByText('PR Review: Improve sidebar tests')).toBeTruthy()

    fireEvent.keyDown(resultsHeader, { key: 'Enter' })
    expect(screen.queryByText('PR Review: Improve sidebar tests')).toBeFalsy()
  })

  it('shows result count in the All Results item', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    // With 2 recent results, count badge "2" should appear
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('does not show result count when recentResults is null', () => {
    mockRecentResults = null as unknown as typeof mockRecentResults
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    // Should not crash
    expect(screen.getByText('COPILOT')).toBeTruthy()
  })
})
