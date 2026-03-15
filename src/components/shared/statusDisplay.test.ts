import { describe, expect, it } from 'vitest'
import { getStatusLabel, getStatusClass } from './statusDisplay'

describe('getStatusLabel', () => {
  it('capitalizes the first letter', () => {
    expect(getStatusLabel('pending')).toBe('Pending')
    expect(getStatusLabel('running')).toBe('Running')
    expect(getStatusLabel('completed')).toBe('Completed')
    expect(getStatusLabel('failed')).toBe('Failed')
    expect(getStatusLabel('cancelled')).toBe('Cancelled')
  })

  it('adds ellipsis for in-progress statuses when requested', () => {
    expect(getStatusLabel('pending', true)).toBe('Pending...')
    expect(getStatusLabel('running', true)).toBe('Running...')
  })

  it('does not add ellipsis for terminal statuses even when requested', () => {
    expect(getStatusLabel('completed', true)).toBe('Completed')
    expect(getStatusLabel('failed', true)).toBe('Failed')
    expect(getStatusLabel('cancelled', true)).toBe('Cancelled')
  })
})

describe('getStatusClass', () => {
  it('returns the correct class for each status', () => {
    expect(getStatusClass('completed')).toBe('status-completed')
    expect(getStatusClass('failed')).toBe('status-failed')
    expect(getStatusClass('running')).toBe('status-running')
    expect(getStatusClass('pending')).toBe('status-pending')
    expect(getStatusClass('cancelled')).toBe('status-cancelled')
  })

  it('returns empty string for unknown status', () => {
    expect(getStatusClass('unknown')).toBe('')
    expect(getStatusClass('')).toBe('')
  })
})
