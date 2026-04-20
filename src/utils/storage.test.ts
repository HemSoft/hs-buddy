import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeGetItem, safeSetItem, safeRemoveItem, safeGetJson, safeSetJson } from './storage'

beforeEach(() => {
  localStorage.clear()
})

describe('safeGetItem', () => {
  it('returns the stored value', () => {
    localStorage.setItem('key', 'value')
    expect(safeGetItem('key')).toBe('value')
  })

  it('returns null for missing keys', () => {
    expect(safeGetItem('missing')).toBeNull()
  })

  it('returns null when localStorage throws', () => {
    const orig = localStorage.getItem
    localStorage.getItem = () => {
      throw new Error('SecurityError')
    }
    expect(safeGetItem('key')).toBeNull()
    localStorage.getItem = orig
  })
})

describe('safeSetItem', () => {
  it('stores a string value', () => {
    safeSetItem('key', 'value')
    expect(localStorage.getItem('key')).toBe('value')
  })

  it('silently fails when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => safeSetItem('key', 'value')).not.toThrow()
    vi.restoreAllMocks()
  })
})

describe('safeRemoveItem', () => {
  it('removes a stored key', () => {
    localStorage.setItem('key', 'value')
    safeRemoveItem('key')
    expect(localStorage.getItem('key')).toBeNull()
  })

  it('silently fails when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => safeRemoveItem('key')).not.toThrow()
    vi.restoreAllMocks()
  })
})

describe('safeGetJson', () => {
  it('parses stored JSON', () => {
    localStorage.setItem('key', JSON.stringify({ a: 1 }))
    expect(safeGetJson<{ a: number }>('key')).toEqual({ a: 1 })
  })

  it('returns null for missing keys', () => {
    expect(safeGetJson('missing')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    localStorage.setItem('key', '{not valid')
    expect(safeGetJson('key')).toBeNull()
  })

  it('returns null when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(safeGetJson('key')).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('safeSetJson', () => {
  it('serializes and stores a value', () => {
    safeSetJson('key', { x: [1, 2] })
    expect(JSON.parse(localStorage.getItem('key')!)).toEqual({ x: [1, 2] })
  })

  it('silently fails when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => safeSetJson('key', { a: 1 })).not.toThrow()
    vi.restoreAllMocks()
  })
})
