import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { commandCenterRender } = vi.hoisted(() => ({
  commandCenterRender: vi.fn(),
}))

vi.mock('../hooks/useConvex', () => ({
  useBuddyStats: () => ({
    totalUptimeMs: 60_000,
    lastSessionStart: Date.now(),
  }),
  useRepoBookmarks: () => [],
}))

vi.mock('../hooks/useCopilotUsage', () => ({
  useCopilotUsage: () => ({
    accounts: [],
    aggregateTotals: { totalUsed: 0, totalOverageCost: 0 },
    aggregateProjections: null,
    anyLoading: false,
    refreshAll: vi.fn(),
  }),
}))

vi.mock('../hooks/useDashboardCards', () => ({
  useDashboardCards: () => ({
    cards: [{ id: 'command-center', title: 'Command Center', defaultVisible: true, span: 1 }],
    visibleCards: [
      { id: 'command-center', title: 'Command Center', defaultVisible: true, span: 1 },
    ],
    isVisible: () => true,
    toggleCard: vi.fn(),
  }),
}))

vi.mock('./dashboard/CommandCenterCard', () => ({
  CommandCenterCard: () => {
    commandCenterRender()
    return <div>Command Center</div>
  },
}))

vi.mock('./dashboard/WorkspacePulseCard', () => ({
  WorkspacePulseCard: () => <div>Workspace Pulse</div>,
}))

vi.mock('./dashboard/WeatherCard', () => ({ WeatherCard: () => <div>Weather</div> }))
vi.mock('./dashboard/FinanceCard', () => ({ FinanceCard: () => <div>Finance</div> }))
vi.mock('./dashboard/DashboardConfigDropdown', () => ({
  DashboardConfigDropdown: () => <button type="button">Customize</button>,
}))

import { WelcomePanel } from './WelcomePanel'

describe('WelcomePanel render boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T16:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not rerender dashboard cards when only uptime ticks', () => {
    const { unmount } = render(
      <WelcomePanel prCounts={{}} onNavigate={vi.fn()} onSectionChange={vi.fn()} />
    )
    const initialRenderCount = commandCenterRender.mock.calls.length

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(commandCenterRender).toHaveBeenCalledTimes(initialRenderCount)
    unmount()
  })
})
