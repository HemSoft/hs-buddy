import { describe, expect, it } from 'vitest'
import { isSafeImageUrl, buildCategoryTree } from './bookmarksSidebarUtils'

describe('isSafeImageUrl', () => {
  it('returns true for http URLs', () => {
    expect(isSafeImageUrl('http://example.com/img.png')).toBe(true)
  })

  it('returns true for https URLs', () => {
    expect(isSafeImageUrl('https://example.com/img.png')).toBe(true)
  })

  it('returns false for javascript: protocol', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false)
  })

  it('returns false for data: protocol', () => {
    expect(isSafeImageUrl('data:image/png;base64,abc')).toBe(false)
  })

  it('returns false for ftp: protocol', () => {
    expect(isSafeImageUrl('ftp://files.example.com/img.png')).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(isSafeImageUrl('not a url')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isSafeImageUrl('')).toBe(false)
  })

  it('returns false for localhost URLs', () => {
    expect(isSafeImageUrl('http://localhost/img.png')).toBe(false)
  })

  it('returns false for 127.0.0.1 URLs', () => {
    expect(isSafeImageUrl('https://127.0.0.1/img.png')).toBe(false)
  })

  it('returns false for private network URLs', () => {
    expect(isSafeImageUrl('http://192.168.1.1/img.png')).toBe(false)
  })

  it('returns false for .local domain URLs', () => {
    expect(isSafeImageUrl('http://router.local/img.png')).toBe(false)
  })
})

describe('buildCategoryTree', () => {
  it('returns empty array for no categories', () => {
    expect(buildCategoryTree([], {})).toEqual([])
  })

  it('creates root node with correct counts', () => {
    const tree = buildCategoryTree(['Dev'], { Dev: 5 })
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({
      name: 'Dev',
      fullPath: 'Dev',
      directCount: 5,
      totalCount: 5,
      children: [],
    })
  })

  it('builds parent-child hierarchy with rolled-up totals', () => {
    const tree = buildCategoryTree(['Dev', 'Dev/Tools'], { Dev: 2, 'Dev/Tools': 3 })
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('Dev')
    expect(tree[0].directCount).toBe(2)
    expect(tree[0].totalCount).toBe(5)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0]).toMatchObject({
      name: 'Tools',
      fullPath: 'Dev/Tools',
      directCount: 3,
      totalCount: 3,
    })
  })

  it('creates intermediate nodes for deeply nested paths', () => {
    const tree = buildCategoryTree(['A/B/C'], { 'A/B/C': 1 })
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('A')
    expect(tree[0].children[0].name).toBe('B')
    expect(tree[0].children[0].children[0].name).toBe('C')
    expect(tree[0].children[0].children[0].directCount).toBe(1)
    expect(tree[0].totalCount).toBe(1)
  })

  it('defaults to 0 for missing counts', () => {
    const tree = buildCategoryTree(['Misc'], {})
    expect(tree[0].directCount).toBe(0)
    expect(tree[0].totalCount).toBe(0)
  })

  it('handles multiple root nodes', () => {
    const tree = buildCategoryTree(['Alpha', 'Beta'], { Alpha: 1, Beta: 2 })
    expect(tree).toHaveLength(2)
    expect(tree[0].name).toBe('Alpha')
    expect(tree[0].totalCount).toBe(1)
    expect(tree[1].name).toBe('Beta')
    expect(tree[1].totalCount).toBe(2)
  })

  it('deduplicates shared path segments from multiple child categories', () => {
    const tree = buildCategoryTree(['X/Y', 'X/Z'], { 'X/Y': 2, 'X/Z': 3 })
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('X')
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].totalCount).toBe(5)
  })

  it('handles mix of root and nested categories with siblings', () => {
    const tree = buildCategoryTree(['A', 'A/X', 'B'], { A: 1, 'A/X': 3, B: 2 })
    expect(tree).toHaveLength(2)
    expect(tree[0].name).toBe('A')
    expect(tree[0].totalCount).toBe(4)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].name).toBe('X')
    expect(tree[1].name).toBe('B')
    expect(tree[1].totalCount).toBe(2)
  })
})
