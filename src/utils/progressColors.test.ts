import { describe, expect, it } from 'vitest'
import { getProgressColor } from './progressColors'

describe('getProgressColor', () => {
  it('returns green for 0-25%', () => {
    expect(getProgressColor(0)).toBe('#4ec9b0')
    expect(getProgressColor(25)).toBe('#4ec9b0')
  })

  it('returns yellow for 26-50%', () => {
    expect(getProgressColor(26)).toBe('#dcd34a')
    expect(getProgressColor(50)).toBe('#dcd34a')
  })

  it('returns orange for 51-75%', () => {
    expect(getProgressColor(51)).toBe('#e89b3c')
    expect(getProgressColor(75)).toBe('#e89b3c')
  })

  it('returns red for 76-100%', () => {
    expect(getProgressColor(76)).toBe('#e85d5d')
    expect(getProgressColor(100)).toBe('#e85d5d')
  })

  it('returns red for values over 100', () => {
    expect(getProgressColor(150)).toBe('#e85d5d')
  })
})
