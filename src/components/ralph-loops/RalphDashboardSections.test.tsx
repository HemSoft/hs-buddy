import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RalphRunInfo } from '../../types/ralph'
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

function makeRun(overrides: Partial<RalphRunInfo> = {}): RalphRunInfo {
  return {
    runId: 'run-1',
    config: { repoPath: '/test', scriptType: 'ralph' },
    status: 'running',
    phase: 'iterating',
    pid: 100,
    currentIteration: 1,
    totalIterations: 3,
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now(),
    completedAt: null,
    exitCode: null,
    error: null,
    logBuffer: [],
    stats: {
      checks: 0,
      agentTurns: 0,
      reviews: 0,
      copilotPRs: 0,
      issuesCreated: 0,
      scanIterations: 0,
      totalCost: null,
      totalPremium: 0,
    },
    ...overrides,
  } as RalphRunInfo
}

describe('RalphDashboardSections', () => {
  it('renders nothing when the error banner has no error', () => {
    const { container } = render(
      <RalphDashboardErrorBanner error={null} onDismiss={() => undefined} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('dismisses the error banner', () => {
    const onDismiss = vi.fn()
    render(<RalphDashboardErrorBanner error="Stop failed" onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: /×/ }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
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

  it('skips empty run sections', () => {
    const { container } = render(
      <RalphDashboardRunSection title="Active" runs={[]} onStop={() => undefined} />
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

  it('toggles the header active state', () => {
    const onToggleLaunchView = vi.fn()
    render(
      <RalphDashboardHeader
        isLaunchView={true}
        onRefresh={() => undefined}
        onToggleLaunchView={onToggleLaunchView}
      />
    )

    fireEvent.click(screen.getByText('New Loop'))

    expect(screen.getByText('New Loop').closest('button')).toHaveClass('active')
    expect(onToggleLaunchView).toHaveBeenCalledTimes(1)
  })
})
