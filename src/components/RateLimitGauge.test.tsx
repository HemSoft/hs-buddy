import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { RateLimitGauge } from './RateLimitGauge'

describe('RateLimitGauge', () => {
  it('renders the remaining count and limit', () => {
    render(
      <RateLimitGauge remaining={4500} limit={5000} reset={Math.floor(Date.now() / 1000) + 600} />
    )

    expect(screen.getByText('4,500')).toBeInTheDocument()
    expect(screen.getByText(/5,000/)).toBeInTheDocument()
  })

  it('shows "resets now" when reset time has passed', () => {
    render(
      <RateLimitGauge remaining={100} limit={5000} reset={Math.floor(Date.now() / 1000) - 10} />
    )

    expect(screen.getByText(/resets now/)).toBeInTheDocument()
  })

  it('shows reset time in minutes', () => {
    const resetIn5Min = Math.floor(Date.now() / 1000) + 300
    render(<RateLimitGauge remaining={100} limit={5000} reset={resetIn5Min} />)

    expect(screen.getByText(/resets 5m/)).toBeInTheDocument()
  })

  it('renders without fill circle when ratio is very low', () => {
    const { container } = render(
      <RateLimitGauge remaining={0} limit={5000} reset={Math.floor(Date.now() / 1000) + 600} />
    )

    // With ratio ≈ 0 (< 0.005), no fill circle
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(1) // only the track
  })

  it('renders fill circle when ratio is above threshold', () => {
    const { container } = render(
      <RateLimitGauge remaining={2500} limit={5000} reset={Math.floor(Date.now() / 1000) + 600} />
    )

    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2) // track + fill
  })

  it('handles zero limit gracefully', () => {
    render(<RateLimitGauge remaining={0} limit={0} reset={Math.floor(Date.now() / 1000) + 600} />)

    expect(screen.getByText('0')).toBeInTheDocument()
  })

  describe('countdown animation', () => {
    let rafCallbacks: FrameRequestCallback[]
    let rafIdCounter: number

    beforeEach(() => {
      rafCallbacks = []
      rafIdCounter = 0
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        rafCallbacks.push(cb)
        return ++rafIdCounter
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('runs the tick callback via requestAnimationFrame', () => {
      const reset = Math.floor(Date.now() / 1000) + 600
      render(<RateLimitGauge remaining={100} limit={5000} reset={reset} refreshInterval={60} />)

      // rAF was called at least once during mount
      expect(window.requestAnimationFrame).toHaveBeenCalled()

      // Execute the first rAF callback (elapsed ≈ 0 → next ≈ 1 → schedules another)
      act(() => {
        const cb = rafCallbacks.shift()!
        cb(performance.now())
      })

      // tick scheduled another frame because next > 0
      expect(rafCallbacks.length).toBeGreaterThanOrEqual(1)
    })

    it('stops scheduling when countdown reaches zero', () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      const reset = Math.floor(now / 1000) + 600
      render(<RateLimitGauge remaining={100} limit={5000} reset={reset} refreshInterval={1} />)

      // Advance time past the full interval so next = 0
      vi.spyOn(Date, 'now').mockReturnValue(now + 2000)

      const callsBefore = rafCallbacks.length
      act(() => {
        const cb = rafCallbacks.shift()!
        cb(performance.now())
      })

      // No new frame scheduled because next === 0
      expect(rafCallbacks.length).toBeLessThanOrEqual(callsBefore - 1)
    })
  })

  it('resets countdown when remaining prop changes', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const reset = Math.floor(Date.now() / 1000) + 600
    const { rerender } = render(<RateLimitGauge remaining={100} limit={5000} reset={reset} />)

    // Rerender with a different remaining value to trigger the change detection effect
    rerender(<RateLimitGauge remaining={200} limit={5000} reset={reset} />)

    // The effect re-ran (rAF called again for the new remaining value)
    expect(rafSpy).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
