import { describe, expect, it } from 'vitest'
import { parseHunkHeader, trimDiffHunk } from './diffHunkUtils'

describe('parseHunkHeader', () => {
  it('parses standard hunk header', () => {
    const result = parseHunkHeader('@@ -10,5 +20,8 @@')
    expect(result).toEqual({ oldStart: 10, newStart: 20 })
  })

  it('parses header without counts', () => {
    const result = parseHunkHeader('@@ -1 +1 @@')
    expect(result).toEqual({ oldStart: 1, newStart: 1 })
  })

  it('parses header with context text after', () => {
    const result = parseHunkHeader('@@ -100,20 +105,25 @@ function foo() {')
    expect(result).toEqual({ oldStart: 100, newStart: 105 })
  })

  it('returns null for non-hunk lines', () => {
    expect(parseHunkHeader('not a hunk header')).toBeNull()
    expect(parseHunkHeader('')).toBeNull()
    expect(parseHunkHeader('+added line')).toBeNull()
  })
})

describe('trimDiffHunk', () => {
  it('returns all lines when under MAX_CONTEXT', () => {
    const hunk = '@@ -1,3 +1,3 @@\n+line1\n-line2\n line3'
    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(false)
    expect(result.skipCount).toBe(0)
    expect(result.lines).toHaveLength(4)
  })

  it('trims long hunks keeping last MAX_CONTEXT lines', () => {
    const lines = ['@@ -1,20 +1,20 @@']
    for (let i = 1; i <= 20; i++) lines.push(`+line${i}`)
    const hunk = lines.join('\n')
    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(true)
    expect(result.skipCount).toBe(14) // 20 - 6
    expect(result.lines[0]).toBe('@@ -1,20 +1,20 @@') // header preserved
    expect(result.lines).toHaveLength(7) // header + 6 context
    expect(result.lines[result.lines.length - 1]).toBe('+line20')
  })

  it('handles hunk without header', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `+line${i + 1}`)
    const hunk = lines.join('\n')
    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(true)
    expect(result.skipCount).toBe(4) // 10 - 6
    expect(result.lines).toHaveLength(6)
  })

  it('filters empty lines', () => {
    const result = trimDiffHunk('@@ -1 +1 @@\n+a\n\n+b')
    expect(result.lines.every(l => l.length > 0)).toBe(true)
  })
})
