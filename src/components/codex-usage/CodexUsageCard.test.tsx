import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexUsageCard } from './CodexUsageCard'
import type { CodexUsageState } from '../../hooks/useCodexUsage'

const account = { username: 'HemSoft', org: 'HemSoft', usageProvider: 'codex' as const }

const state: CodexUsageState = {
  loading: false,
  error: null,
  data: {
    planType: 'plus',
    fetchedAt: Date.parse('2030-01-01T12:00:00Z'),
    windows: [
      {
        kind: 'weekly',
        label: 'Weekly allowance',
        usedPercent: 30,
        remainingPercent: 70,
        resetAt: '2030-01-05T12:00:00Z',
        durationSeconds: 604_800,
        periodStart: '2029-12-29T12:00:00Z',
        projectedPercent: 52,
      },
      {
        kind: 'five-hour',
        label: '5-hour allowance',
        usedPercent: 10,
        remainingPercent: 90,
        resetAt: '2030-01-01T14:00:00Z',
        durationSeconds: 18_000,
        periodStart: '2030-01-01T09:00:00Z',
        projectedPercent: 16,
      },
    ],
  },
}

describe('CodexUsageCard', () => {
  const openExternal = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T12:00:00Z'))
    Object.assign(window, { shell: { ...window.shell, openExternal } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('makes the weekly allowance prominent and keeps projections per window', () => {
    const { container } = render(<CodexUsageCard account={account} state={state} />)

    expect(screen.getByText('HemSoft · Codex allowance')).toBeInTheDocument()
    expect(screen.getByText('ChatGPT / Codex · Plus')).toBeInTheDocument()
    const windows = container.querySelectorAll('.codex-window')
    expect(windows).toHaveLength(2)
    expect(windows[0]).toHaveClass('codex-window-prominent')
    expect(within(windows[0] as HTMLElement).getByText('52.0%')).toBeInTheDocument()
    expect(within(windows[1] as HTMLElement).getByText('16.0%')).toBeInTheDocument()
    expect(screen.queryByText(/month-end/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/premium requests/i)).not.toBeInTheDocument()
  })

  it('shows the specific authentication error', () => {
    render(
      <CodexUsageCard
        account={account}
        state={{ data: null, loading: false, error: "Run 'codex' and sign in with ChatGPT." }}
      />
    )

    expect(screen.getByText("Run 'codex' and sign in with ChatGPT.")).toBeInTheDocument()
  })

  it('shows a loading state before the first allowance response', () => {
    render(<CodexUsageCard account={account} state={undefined} />)
    expect(screen.getByText('Loading Codex allowance…')).toBeInTheDocument()
  })

  it('keeps the last successful response visible when a refresh fails', () => {
    render(
      <CodexUsageCard
        account={account}
        state={{ ...state, error: 'The usage service is temporarily unavailable.' }}
      />
    )

    expect(screen.getByText('Weekly allowance')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the last successful response. The usage service is temporarily unavailable.'
    )
  })

  it('opens the Codex usage settings page', () => {
    render(<CodexUsageCard account={account} state={state} />)
    fireEvent.click(screen.getByRole('button', { name: /usage settings/i }))
    expect(openExternal).toHaveBeenCalledWith('https://chatgpt.com/codex/settings/usage')
  })
})
