import { describe, expect, it } from 'vitest'
import { parseHunkHeader, trimDiffHunk } from './diffHunkUtils'

describe('parseHunkHeader', () => {
  it('parses a standard header with both counts', () => {
    expect(parseHunkHeader('@@ -1,5 +1,7 @@')).toEqual({ oldStart: 1, newStart: 1 })
  })

  it('parses a header without counts', () => {
    expect(parseHunkHeader('@@ -10 +20 @@')).toEqual({ oldStart: 10, newStart: 20 })
  })

  it('parses a header with only the old count', () => {
    expect(parseHunkHeader('@@ -1,3 +1 @@')).toEqual({ oldStart: 1, newStart: 1 })
  })

  it('parses a header with only the new count', () => {
    expect(parseHunkHeader('@@ -1 +1,5 @@')).toEqual({ oldStart: 1, newStart: 1 })
  })

  it('parses a header with trailing context after @@', () => {
    expect(parseHunkHeader('@@ -10,5 +20,7 @@ function foo() {')).toEqual({
      oldStart: 10,
      newStart: 20,
    })
  })

  it('parses large line numbers', () => {
    expect(parseHunkHeader('@@ -1042,8 +1050,12 @@')).toEqual({
      oldStart: 1042,
      newStart: 1050,
    })
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

  it('returns null for malformed @@ markers', () => {
    expect(parseHunkHeader('@@ @@')).toBeNull()
  })

  it('returns null when numbers are missing', () => {
    expect(parseHunkHeader('@@ - + @@')).toBeNull()
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
    expect(result.lines).toEqual([
      '@@ -1,10 +1,10 @@',
      ' line4',
      ' line5',
      ' line6',
      ' line7',
      '-old8',
      '+new8',
    ])
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

  it('handles single content line (no trim needed)', () => {
    const hunk = '@@ -1,1 +1,1 @@\n+added'
    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(false)
    expect(result.skipCount).toBe(0)
    expect(result.lines).toEqual(['@@ -1,1 +1,1 @@', '+added'])
  })

  it('trims exactly 1 line when content is 7 lines (MAX_CONTEXT + 1)', () => {
    const hunk = ['@@ -1,7 +1,7 @@', ' a', ' b', ' c', ' d', ' e', ' f', ' g'].join('\n')
    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(true)
    expect(result.skipCount).toBe(1)
    expect(result.skippedLines).toEqual([' a'])
    expect(result.lines).toEqual(['@@ -1,7 +1,7 @@', ' b', ' c', ' d', ' e', ' f', ' g'])
  })

  it('trims without header when content exceeds MAX_CONTEXT', () => {
    // No @@ header, 8 content lines → headerLine is null → result has no header
    const hunk = ['+a', '+b', '+c', '+d', '+e', '+f', '+g', '+h'].join('\n')
    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(true)
    expect(result.skipCount).toBe(2)
    expect(result.skippedLines).toEqual(['+a', '+b'])
    // No header prepended
    expect(result.lines).toEqual(['+c', '+d', '+e', '+f', '+g', '+h'])
    expect(result.lines).not.toContain(expect.stringMatching(/^@@/))
  })

  it('filters out empty lines from split', () => {
    // Trailing newline creates an empty string that gets filtered out
    const hunk = '@@ -1,2 +1,2 @@\n line1\n line2\n'
    const result = trimDiffHunk(hunk)
    expect(result.wasTrimmed).toBe(false)
    expect(result.lines).toEqual(['@@ -1,2 +1,2 @@', ' line1', ' line2'])
  })
})
