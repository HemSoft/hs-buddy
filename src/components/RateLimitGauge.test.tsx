import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
