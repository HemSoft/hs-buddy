import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RalphRunInfo } from '../../types/ralph'
import { makeRun } from '../../test/fixtures/ralph'
import {
  RalphDashboardAvailableScripts,
  RalphDashboardErrorBanner,
  RalphDashboardHeader,
  RalphDashboardRunSection,
} from './RalphDashboardSections'

vi.mock('./RalphLoopCard', () => ({
  RalphLoopCard: ({ run, onStop }: { run: RalphRunInfo; onStop: (id: string) => void }) => (
    <div data-testid={`loop-card-${run.runId}`}>
      <button onClick={() => onStop(run.runId)}>Stop {run.runId}</button>
    </div>
  ),
}))

describe('RalphDashboardSections', () => {
  it('renders nothing when the error banner has no error', () => {
    const { container } = render(<RalphDashboardErrorBanner error={null} onDismiss={() => {}} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('dismisses the error banner', () => {
    const onDismiss = vi.fn()
    render(<RalphDashboardErrorBanner error="Stop failed" onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('labels the refresh button for assistive technology', () => {
    render(
      <RalphDashboardHeader
        isLaunchView={false}
        onRefresh={() => {}}
        onToggleLaunchView={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('always renders the built-in script cards and launches custom templates', () => {
    const onLaunchScript = vi.fn()
    render(
      <RalphDashboardAvailableScripts
        templates={[{ name: 'Custom', filename: 'custom-script.ps1' }]}
        onLaunchScript={onLaunchScript}
      />
    )

    expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    expect(screen.getByText('Ralph PR')).toBeInTheDocument()
    expect(screen.getByText('Ralph Issues')).toBeInTheDocument()
    expect(screen.getByText('Template improvement loop')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Custom').closest('[role="button"]')!)

    expect(onLaunchScript).toHaveBeenCalledWith('custom-script.ps1')
  })

  it('prefers server-provided descriptions for custom templates', () => {
    render(
      <RalphDashboardAvailableScripts
        templates={[
          {
            name: 'Custom',
            filename: 'custom-script.ps1',
            description: 'Server supplied description',
          },
        ]}
        onLaunchScript={() => {}}
      />
    )

    expect(screen.getByText('Server supplied description')).toBeInTheDocument()
    expect(screen.queryByText('Template improvement loop')).not.toBeInTheDocument()
  })

  it('prevents page scroll when activating a script card with the space key', () => {
    const onLaunchScript = vi.fn()
    render(<RalphDashboardAvailableScripts templates={[]} onLaunchScript={onLaunchScript} />)

    const card = screen.getByText('Ralph Loop').closest('[role="button"]')

    expect(card).not.toBeNull()

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })

    card!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(onLaunchScript).toHaveBeenCalledWith('ralph')
  })

  it('ignores repeated keydown events when activating a script card', () => {
    const onLaunchScript = vi.fn()
    render(<RalphDashboardAvailableScripts templates={[]} onLaunchScript={onLaunchScript} />)

    const card = screen.getByText('Ralph PR').closest('[role="button"]')

    expect(card).not.toBeNull()

    const repeatedSpaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
      repeat: true,
    })

    card!.dispatchEvent(repeatedSpaceEvent)
    fireEvent.keyDown(card!, { key: 'Enter', repeat: true })

    expect(repeatedSpaceEvent.defaultPrevented).toBe(true)
    expect(onLaunchScript).not.toHaveBeenCalled()
  })

  it('skips empty run sections', () => {
    const { container } = render(
      <RalphDashboardRunSection title="Active" runs={[]} onStop={() => {}} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders runs and forwards stop events', () => {
    const onStop = vi.fn()
    render(
      <RalphDashboardRunSection
        title="Active"
        runs={[makeRun({ runId: 'active-1' })]}
        onStop={onStop}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop active-1' }))

    expect(screen.getByText('Active (1)')).toBeInTheDocument()
    expect(onStop).toHaveBeenCalledWith('active-1')
  })

  it('applies the active class to the New Loop button when launch view is selected', () => {
    render(
      <RalphDashboardHeader
        isLaunchView={true}
        onRefresh={() => {}}
        onToggleLaunchView={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'New Loop' })).toHaveClass('active')
  })

  it('does not apply the active class to the New Loop button when launch view is not selected', () => {
    render(
      <RalphDashboardHeader
        isLaunchView={false}
        onRefresh={() => {}}
        onToggleLaunchView={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'New Loop' })).not.toHaveClass('active')
  })

  it('calls onToggleLaunchView when the New Loop button is clicked', () => {
    const onToggleLaunchView = vi.fn()
    render(
      <RalphDashboardHeader
        isLaunchView={false}
        onRefresh={() => {}}
        onToggleLaunchView={onToggleLaunchView}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Loop' }))

    expect(onToggleLaunchView).toHaveBeenCalledTimes(1)
  })
})
