import { describe, expect, it } from 'vitest'
import { parseHunkHeader, trimDiffHunk } from './diffHunkUtils'

describe('parseHunkHeader', () => {
  it('parses a standard header with both counts', () => {
    const result = parseHunkHeader('@@ -1,5 +1,7 @@')
    expect(result).toEqual({ oldStart: 1, newStart: 1 })
  })

  it('parses a header without counts', () => {
    const result = parseHunkHeader('@@ -10 +20 @@')
    expect(result).toEqual({ oldStart: 10, newStart: 20 })
  })

  it('parses a header with only the old count', () => {
    const result = parseHunkHeader('@@ -1,3 +1 @@')
    expect(result).toEqual({ oldStart: 1, newStart: 1 })
  })

  it('parses a header with only the new count', () => {
    const result = parseHunkHeader('@@ -1 +1,5 @@')
    expect(result).toEqual({ oldStart: 1, newStart: 1 })
  })

  it('parses a header with trailing context after @@', () => {
    const result = parseHunkHeader('@@ -10,5 +20,7 @@ function foo() {')
    expect(result).toEqual({ oldStart: 10, newStart: 20 })
  })

  it('parses large line numbers', () => {
    const result = parseHunkHeader('@@ -1042,8 +1050,12 @@')
    expect(result).toEqual({ oldStart: 1042, newStart: 1050 })
  })

  it('returns null for an invalid header', () => {
    expect(parseHunkHeader('not a header')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseHunkHeader('')).toBeNull()
  })

  it('returns null for a partial header', () => {
    expect(parseHunkHeader('@@ -1')).toBeNull()
  })
})

describe('trimDiffHunk', () => {
  it('returns all lines when content has 6 or fewer lines', () => {
    const hunk = ['@@ -1,4 +1,4 @@', ' line1', '-old', '+new', ' line4'].join('\n')

    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(false)
    expect(result.skipCount).toBe(0)
    expect(result.skippedLines).toEqual([])
    expect(result.lines).toEqual(['@@ -1,4 +1,4 @@', ' line1', '-old', '+new', ' line4'])
  })

  it('trims long hunks to the last 6 content lines', () => {
    const hunk = [
      '@@ -1,10 +1,10 @@',
      ' line1',
      ' line2',
      ' line3',
      ' line4',
      ' line5',
      ' line6',
      ' line7',
      '-old8',
      '+new8',
    ].join('\n')

    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(true)
    expect(result.skipCount).toBe(3)
    expect(result.skippedLines).toEqual([' line1', ' line2', ' line3'])
    expect(result.lines).toEqual(['@@ -1,10 +1,10 @@', ' line4', ' line5', ' line6', ' line7', '-old8', '+new8'])
  })

  it('preserves the @@ header line after trimming', () => {
    const hunk = ['@@ -5,9 +5,9 @@', ' a', ' b', ' c', ' d', ' e', ' f', ' g', ' h'].join('\n')

    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(true)
    expect(result.lines[0]).toBe('@@ -5,9 +5,9 @@')
  })

  it('works without a @@ header line', () => {
    const hunk = [' a', ' b', ' c', ' d', ' e', ' f', ' g', ' h'].join('\n')

    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(true)
    expect(result.lines).toEqual([' c', ' d', ' e', ' f', ' g', ' h'])
    expect(result.skipCount).toBe(2)
    expect(result.skippedLines).toEqual([' a', ' b'])
  })

  it('returns exactly 6 content lines when not trimmed', () => {
    const hunk = ['@@ -1,6 +1,6 @@', ' a', ' b', ' c', ' d', ' e', ' f'].join('\n')

    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(false)
    expect(result.lines).toHaveLength(7)
  })

  it('handles an empty hunk', () => {
    const result = trimDiffHunk('')
    expect(result.wasTrimmed).toBe(false)
    expect(result.lines).toEqual([])
    expect(result.skipCount).toBe(0)
    expect(result.skippedLines).toEqual([])
  })

  it('handles a hunk with only a header line', () => {
    const result = trimDiffHunk('@@ -1,0 +1,0 @@')
    expect(result.wasTrimmed).toBe(false)
    expect(result.lines).toEqual(['@@ -1,0 +1,0 @@'])
  })
})
