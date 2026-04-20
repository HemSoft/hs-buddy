import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PRStateIcon } from './PRStateIcon'

describe('PRStateIcon', () => {
  it('renders merged icon for merged state', () => {
    const { container } = render(<PRStateIcon state="merged" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('list-view-status-merged')).toBe(true)
  })

  it('renders closed icon for closed state', () => {
    const { container } = render(<PRStateIcon state="closed" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('list-view-status-closed')).toBe(true)
  })

  it('renders open icon for open state', () => {
    const { container } = render(<PRStateIcon state="open" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('list-view-status-open')).toBe(true)
  })

  it('renders open icon for unknown state', () => {
    const { container } = render(<PRStateIcon state="draft" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('list-view-status-open')).toBe(true)
  })

  it('accepts custom size', () => {
    const { container } = render(<PRStateIcon state="open" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('20')
  })

  it('accepts custom className', () => {
    const { container } = render(<PRStateIcon state="merged" className="custom-class" />)
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('custom-class')).toBe(true)
  })
})
