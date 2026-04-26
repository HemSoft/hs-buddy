import { describe, it, expect } from 'vitest'
import {
  validateBookmarkUrl,
  validateCategory,
  validateTagCount,
  validateBookmarkUpdate,
  buildUpdateData,
  resolveBookmarkUpdateTargets,
} from './bookmarkValidation'

describe('validateBookmarkUrl', () => {
  it('accepts http URLs', () => {
    expect(() => validateBookmarkUrl('http://example.com')).not.toThrow()
  })

  it('accepts https URLs', () => {
    expect(() => validateBookmarkUrl('https://example.com/path?q=1')).not.toThrow()
  })

  it('rejects ftp URLs', () => {
    expect(() => validateBookmarkUrl('ftp://files.example.com')).toThrow(
      'Only http and https URLs are allowed'
    )
  })

  it('rejects javascript: URLs', () => {
    expect(() => validateBookmarkUrl('javascript:alert(1)')).toThrow(
      'Only http and https URLs are allowed'
    )
  })

  it('throws on invalid URL', () => {
    expect(() => validateBookmarkUrl('not a url')).toThrow()
  })
})

describe('validateCategory', () => {
  it('accepts non-empty category', () => {
    expect(() => validateCategory('Tools')).not.toThrow()
  })

  it('rejects empty string', () => {
    expect(() => validateCategory('')).toThrow('Category is required')
  })

  it('rejects whitespace-only', () => {
    expect(() => validateCategory('   ')).toThrow('Category is required')
  })
})

describe('validateTagCount', () => {
  it('accepts tags within limit', () => {
    expect(() => validateTagCount(['a', 'b', 'c'])).not.toThrow()
  })

  it('accepts exactly 50 tags', () => {
    expect(() => validateTagCount(Array(50).fill('tag'))).not.toThrow()
  })

  it('rejects more than 50 tags', () => {
    expect(() => validateTagCount(Array(51).fill('tag'))).toThrow('Maximum 50 tags allowed')
  })

  it('allows custom max', () => {
    expect(() => validateTagCount(['a', 'b', 'c'], 2)).toThrow('Maximum 2 tags allowed')
  })
})

describe('validateBookmarkUpdate', () => {
  it('passes when all fields are valid', () => {
    expect(() =>
      validateBookmarkUpdate({
        url: 'https://example.com',
        category: 'Tools',
        tags: ['a'],
      })
    ).not.toThrow()
  })

  it('skips undefined fields (partial update)', () => {
    expect(() => validateBookmarkUpdate({})).not.toThrow()
  })

  it('validates url when present', () => {
    expect(() => validateBookmarkUpdate({ url: 'ftp://bad' })).toThrow()
  })

  it('validates category when present', () => {
    expect(() => validateBookmarkUpdate({ category: '  ' })).toThrow('Category is required')
  })

  it('validates tags when present', () => {
    expect(() => validateBookmarkUpdate({ tags: Array(51).fill('x') })).toThrow()
  })
})

describe('buildUpdateData', () => {
  it('adds updatedAt and copies non-id fields', () => {
    const result = buildUpdateData({ id: '123', title: 'New', url: 'https://x.com' }, 1000)
    expect(result).toEqual({ updatedAt: 1000, title: 'New', url: 'https://x.com' })
    expect(result).not.toHaveProperty('id')
  })

  it('excludes undefined values', () => {
    const result = buildUpdateData({ id: '123', title: undefined, url: 'https://x.com' }, 2000)
    expect(result).toEqual({ updatedAt: 2000, url: 'https://x.com' })
  })

  it('returns only updatedAt for empty args', () => {
    const result = buildUpdateData({}, 3000)
    expect(result).toEqual({ updatedAt: 3000 })
  })
})

// --- resolveBookmarkUpdateTargets ---

describe('resolveBookmarkUpdateTargets', () => {
  const existing = { url: 'https://old.com', category: 'tech' }

  it('uses existing values when args are not provided', () => {
    const result = resolveBookmarkUpdateTargets({}, existing)
    expect(result.targetUrl).toBe('https://old.com')
    expect(result.targetCategory).toBe('tech')
    expect(result.needsDuplicateCheck).toBe(false)
  })

  it('uses new url when provided', () => {
    const result = resolveBookmarkUpdateTargets({ url: 'https://new.com' }, existing)
    expect(result.targetUrl).toBe('https://new.com')
    expect(result.targetCategory).toBe('tech')
    expect(result.needsDuplicateCheck).toBe(true)
  })

  it('uses new category when provided', () => {
    const result = resolveBookmarkUpdateTargets({ category: 'science' }, existing)
    expect(result.targetUrl).toBe('https://old.com')
    expect(result.targetCategory).toBe('science')
    expect(result.needsDuplicateCheck).toBe(true)
  })

  it('uses both new url and category when provided', () => {
    const result = resolveBookmarkUpdateTargets(
      { url: 'https://new.com', category: 'science' },
      existing
    )
    expect(result.targetUrl).toBe('https://new.com')
    expect(result.targetCategory).toBe('science')
    expect(result.needsDuplicateCheck).toBe(true)
  })

  it('triggers duplicate check even when url/category match existing values', () => {
    const result = resolveBookmarkUpdateTargets(
      { url: 'https://old.com', category: 'tech' },
      existing
    )
    expect(result.needsDuplicateCheck).toBe(true)
  })
})
