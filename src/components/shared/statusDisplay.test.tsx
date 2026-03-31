import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { getStatusLabel, getStatusClass, getStatusEmoji, getStatusIcon } from './statusDisplay'

describe('getStatusIcon', () => {
  it.each(['pending', 'running', 'completed', 'failed', 'cancelled'])(
    'returns an icon for %s',
    status => {
      const icon = getStatusIcon(status)
      const { container } = render(icon as React.ReactElement)
      expect(container.querySelector('svg')).toBeTruthy()
    }
  )

  it('returns null for unknown status', () => {
    expect(getStatusIcon('unknown')).toBeNull()
  })

  it('respects custom size', () => {
    const { container } = render(getStatusIcon('completed', 20) as React.ReactElement)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('20')
  })

  it('respects custom classPrefix', () => {
    const { container } = render(getStatusIcon('failed', 14, 'job') as React.ReactElement)
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('job-failed')).toBe(true)
  })
})

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

describe('getStatusEmoji', () => {
  it('returns the correct emoji for known statuses', () => {
    expect(getStatusEmoji('pending')).toBe('⏳')
    expect(getStatusEmoji('running')).toBe('🔄')
    expect(getStatusEmoji('completed')).toBe('✅')
    expect(getStatusEmoji('failed')).toBe('❌')
    expect(getStatusEmoji('cancelled')).toBe('🚫')
  })

  it('returns a fallback emoji for unknown statuses', () => {
    expect(getStatusEmoji('unknown')).toBe('•')
  })
})
