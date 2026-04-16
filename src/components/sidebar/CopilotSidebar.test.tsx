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

  it('does not show active badge when activeCount is undefined', () => {
    mockActiveCount = undefined
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    const header = screen.getByText('COPILOT').closest('.sidebar-panel-header')!
    expect(header.querySelector('.sidebar-item-count')).toBeNull()
  })

  it('does not show active badge when counts are zero', () => {
    mockActiveCount = { pending: 0, running: 0 }
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    const header = screen.getByText('COPILOT').closest('.sidebar-panel-header')!
    expect(header.querySelector('.sidebar-item-count')).toBeNull()
  })

  it('calls onItemSelect with copilot-usage when Copilot Usage is clicked', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('Copilot Usage').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith('copilot-usage')
  })

  it('calls onItemSelect with copilot-sessions when Session Explorer is clicked', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('Session Explorer').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith('copilot-sessions')
  })

  it('supports keyboard interaction on Copilot Usage item', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(screen.getByText('Copilot Usage').closest('[role="button"]') as HTMLElement, {
      key: 'Enter',
    })
    expect(onItemSelect).toHaveBeenCalledWith('copilot-usage')
  })

  it('supports keyboard interaction on Session Explorer item', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(
      screen.getByText('Session Explorer').closest('[role="button"]') as HTMLElement,
      { key: ' ' }
    )
    expect(onItemSelect).toHaveBeenCalledWith('copilot-sessions')
  })

  it('does not select item on non-activating key', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(screen.getByText('Copilot Usage').closest('[role="button"]') as HTMLElement, {
      key: 'Tab',
    })
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('supports keyboard interaction on recent results section', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(
      screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement,
      { key: ' ' }
    )

    // Section should now be expanded
    expect(screen.getByText('PR Review: Improve sidebar tests')).toBeTruthy()

    fireEvent.keyDown(screen.getByTitle('12345678901234567890123456789012345678901'), {
      key: 'Enter',
    })
    expect(onItemSelect).toHaveBeenCalledWith('copilot-result:prompt-1')
  })

  it('does not select recent result item on non-activating key', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)

    fireEvent.keyDown(screen.getByTitle('12345678901234567890123456789012345678901'), {
      key: 'Tab',
    })
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('renders pr-review result with Untitled when prTitle is missing', () => {
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

  it('supports keyboard interaction on All Results item', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(screen.getByText('All Results').closest('[role="button"]') as HTMLElement, {
      key: 'Enter',
    })
    expect(onItemSelect).toHaveBeenCalledWith('copilot-all-results')
  })

  it('calls toggleSection via click on Prompt section header', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Prompt section is expanded by default; clicking collapses it
    fireEvent.click(screen.getByText('Prompt').closest('[role="button"]') as HTMLElement)
    expect(screen.queryByText('New Prompt')).toBeFalsy()
  })

  it('calls onItemSelect via click on New Prompt item', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('New Prompt').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith('copilot-prompt')
  })

  it('calls onItemSelect via click on All Results item', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.click(screen.getByText('All Results').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith('copilot-all-results')
  })

  it('applies selected class for each selectable item', () => {
    const { unmount } = render(
      <CopilotSidebar onItemSelect={vi.fn()} selectedItem="copilot-prompt" />
    )
    expect(screen.getByText('New Prompt').closest('.sidebar-item')!.className).toContain('selected')
    unmount()

    const { unmount: u2 } = render(
      <CopilotSidebar onItemSelect={vi.fn()} selectedItem="copilot-usage" />
    )
    expect(screen.getByText('Copilot Usage').closest('.sidebar-item')!.className).toContain(
      'selected'
    )
    u2()

    const { unmount: u3 } = render(
      <CopilotSidebar onItemSelect={vi.fn()} selectedItem="copilot-sessions" />
    )
    expect(screen.getByText('Session Explorer').closest('.sidebar-item')!.className).toContain(
      'selected'
    )
    u3()
  })

  it('applies selected class for a recent result item', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem="copilot-result:review-1" />)

    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)

    expect(
      screen.getByText('PR Review: Improve sidebar tests').closest('.sidebar-item')!.className
    ).toContain('selected')
  })

  it('handles null recentResults gracefully', () => {
    mockRecentResults = null as unknown as typeof mockRecentResults
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Count badge should not appear
    const allResultsItem = screen.getByText('All Results').closest('.sidebar-item')!
    expect(allResultsItem.querySelector('.sidebar-item-count')).toBeNull()

    // Recent Results section shows empty state
    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)
    expect(screen.getByText('No results yet')).toBeTruthy()
  })

  it('renders short prompt label without truncation for non-pr-review', () => {
    mockRecentResults = [
      {
        _id: 'short-1',
        category: 'prompt',
        prompt: 'Short prompt here',
        status: 'completed',
        createdAt: Date.now(),
      },
    ]
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    fireEvent.click(screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement)
    expect(screen.getByText('Short prompt here')).toBeTruthy()
  })

  it('ignores non-activating keys on Prompt section header', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    fireEvent.keyDown(screen.getByText('Prompt').closest('[role="button"]') as HTMLElement, {
      key: 'Tab',
    })
    // Section should remain expanded (default state)
    expect(screen.getByText('New Prompt')).toBeTruthy()
  })

  it('ignores non-activating keys on New Prompt and All Results items', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(screen.getByText('New Prompt').closest('[role="button"]') as HTMLElement, {
      key: 'Tab',
    })
    fireEvent.keyDown(screen.getByText('All Results').closest('[role="button"]') as HTMLElement, {
      key: 'Tab',
    })
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('ignores non-activating keys on Session Explorer item', () => {
    const onItemSelect = vi.fn()
    render(<CopilotSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.keyDown(
      screen.getByText('Session Explorer').closest('[role="button"]') as HTMLElement,
      { key: 'Tab' }
    )
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('ignores non-activating keys on Recent Results section header', () => {
    render(<CopilotSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    fireEvent.keyDown(
      screen.getByText('Recent Results').closest('[role="button"]') as HTMLElement,
      { key: 'Tab' }
    )
    // Section should remain collapsed (not expanded)
    expect(screen.queryByText('PR Review: Improve sidebar tests')).toBeFalsy()
  })
})
