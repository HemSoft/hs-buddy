import { act, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { staticIconRender, clockIconRender } = vi.hoisted(() => ({
  staticIconRender: vi.fn(),
  clockIconRender: vi.fn(),
}))

vi.mock('lucide-react', async importOriginal => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
    GitPullRequest: (props: ComponentProps<typeof actual.GitPullRequest>) => {
      staticIconRender()
      return <actual.GitPullRequest {...props} />
    },
    Clock: (props: ComponentProps<typeof actual.Clock>) => {
      clockIconRender()
      return <actual.Clock {...props} />
    },
  }
})

vi.mock('../hooks/useBackgroundStatus', () => ({
  useBackgroundStatus: () => ({
    phase: 'idle',
    activeLabel: null,
    activeTasks: 0,
    runningTasks: 0,
    queuedTasks: 0,
    nextRefreshAt: Date.now() + 300_000,
    lastRefreshedAt: Date.now() - 60_000,
  }),
}))

import { StatusBar } from './StatusBar'

describe('StatusBar render boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T16:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps static items stable while clock and countdown leaves tick', () => {
    const { unmount } = render(<StatusBar />)
    const initialStaticRenders = staticIconRender.mock.calls.length
    const initialClockRenders = clockIconRender.mock.calls.length

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(staticIconRender).toHaveBeenCalledTimes(initialStaticRenders)
    expect(clockIconRender.mock.calls.length).toBeGreaterThan(initialClockRenders)
    unmount()
  })
})
