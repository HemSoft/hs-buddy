import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ViewModeToggle } from './ViewModeToggle'

describe('ViewModeToggle', () => {
  it('renders card and list buttons', () => {
    render(<ViewModeToggle mode="card" onChange={vi.fn()} />)
    expect(screen.getByTitle('Card view')).toBeInTheDocument()
    expect(screen.getByTitle('List view')).toBeInTheDocument()
  })

  it('marks the active mode', () => {
    render(<ViewModeToggle mode="list" onChange={vi.fn()} />)
    expect(screen.getByTitle('List view').className).toContain('active')
    expect(screen.getByTitle('Card view').className).not.toContain('active')
  })

  it('calls onChange when toggling', () => {
    const onChange = vi.fn()
    render(<ViewModeToggle mode="card" onChange={onChange} />)

    fireEvent.click(screen.getByTitle('List view'))
    expect(onChange).toHaveBeenCalledWith('list')
  })
})
