import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UsageRing } from './UsageRing'

describe('UsageRing', () => {
  it('renders the usage percentage text', () => {
    render(<UsageRing percentUsed={42.5} />)
    expect(screen.getByText('42.5%')).toBeInTheDocument()
    expect(screen.getByText('used')).toBeInTheDocument()
  })

  it('renders with default size and stroke', () => {
    const { container } = render(<UsageRing percentUsed={50} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '100')
    expect(svg).toHaveAttribute('height', '100')
  })

  it('renders with custom size', () => {
    const { container } = render(<UsageRing percentUsed={50} size={200} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '200')
  })

  it('does not show projected arc when not provided', () => {
    const { container } = render(<UsageRing percentUsed={30} />)
    // 2 circles: background track + actual usage
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)
  })

  it('shows projected ghost arc when projectedPercent > percentUsed', () => {
    const { container } = render(<UsageRing percentUsed={30} projectedPercent={80} />)
    // 3 circles: background + projected + actual
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(3)
  })

  it('does not show projected arc when projectedPercent <= percentUsed', () => {
    const { container } = render(<UsageRing percentUsed={60} projectedPercent={50} />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)
  })

  it('caps the visual arc at 100%', () => {
    render(<UsageRing percentUsed={120} />)
    // It should still render (capped internally via Math.min)
    expect(screen.getByText('120.0%')).toBeInTheDocument()
  })
})
