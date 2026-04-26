import { describe, it, expect } from 'vitest'
import { buildUpdateData } from './convexPatchUtils'

describe('buildUpdateData', () => {
  it('sets updatedAt and copies defined fields', () => {
    const result = buildUpdateData({ name: 'test', value: 42 }, 1000)
    expect(result).toEqual({ updatedAt: 1000, name: 'test', value: 42 })
  })

  it('excludes the id field', () => {
    const result = buildUpdateData({ id: 'abc', name: 'test' }, 2000)
    expect(result).toEqual({ updatedAt: 2000, name: 'test' })
    expect(result).not.toHaveProperty('id')
  })

  it('excludes undefined values', () => {
    const result = buildUpdateData({ name: 'test', desc: undefined }, 3000)
    expect(result).toEqual({ updatedAt: 3000, name: 'test' })
    expect(result).not.toHaveProperty('desc')
  })

  it('returns only updatedAt when args are empty', () => {
    const result = buildUpdateData({}, 4000)
    expect(result).toEqual({ updatedAt: 4000 })
  })

  it('handles null values (not undefined)', () => {
    const result = buildUpdateData({ name: null }, 5000)
    expect(result).toEqual({ updatedAt: 5000, name: null })
  })

  it('handles boolean false values', () => {
    const result = buildUpdateData({ enabled: false }, 6000)
    expect(result).toEqual({ updatedAt: 6000, enabled: false })
  })

  it('handles zero values', () => {
    const result = buildUpdateData({ count: 0 }, 7000)
    expect(result).toEqual({ updatedAt: 7000, count: 0 })
  })

  it('handles empty string values', () => {
    const result = buildUpdateData({ name: '' }, 8000)
    expect(result).toEqual({ updatedAt: 8000, name: '' })
  })
})
