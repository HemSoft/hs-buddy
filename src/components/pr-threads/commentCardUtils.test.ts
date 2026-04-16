import { describe, expect, it } from 'vitest'
import { parseCommentBody } from './commentCardUtils'

describe('parseCommentBody', () => {
  it('returns empty array for null input', () => {
    expect(parseCommentBody(null)).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(parseCommentBody(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseCommentBody('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(parseCommentBody('   ')).toEqual([])
  })

  it('returns single text segment for plain text', () => {
    expect(parseCommentBody('Hello world')).toEqual([{ type: 'text', content: 'Hello world' }])
  })

  it('returns text segment for multiline plain text', () => {
    const body = 'Line one\nLine two\nLine three'
    expect(parseCommentBody(body)).toEqual([
      { type: 'text', content: 'Line one\nLine two\nLine three' },
    ])
  })

  it('extracts a single suggestion block', () => {
    const body = '```suggestion\nconst x = 1\n```'
    expect(parseCommentBody(body)).toEqual([{ type: 'suggestion', content: 'const x = 1\n' }])
  })

  it('extracts text before and after a suggestion', () => {
    const body = 'Before text\n```suggestion\nfix here\n```\nAfter text'
    expect(parseCommentBody(body)).toEqual([
      { type: 'text', content: 'Before text' },
      { type: 'suggestion', content: 'fix here\n' },
      { type: 'text', content: 'After text' },
    ])
  })

  it('handles multiple suggestion blocks with text between', () => {
    const body = 'intro\n```suggestion\nfirst\n```\nmiddle\n```suggestion\nsecond\n```\nend'
    expect(parseCommentBody(body)).toEqual([
      { type: 'text', content: 'intro' },
      { type: 'suggestion', content: 'first\n' },
      { type: 'text', content: 'middle' },
      { type: 'suggestion', content: 'second\n' },
      { type: 'text', content: 'end' },
    ])
  })

  it('handles suggestion with multiline content', () => {
    const body = '```suggestion\nline1\nline2\nline3\n```'
    expect(parseCommentBody(body)).toEqual([
      { type: 'suggestion', content: 'line1\nline2\nline3\n' },
    ])
  })

  it('handles adjacent suggestions with no text between', () => {
    const body = '```suggestion\nfirst\n```\n```suggestion\nsecond\n```'
    expect(parseCommentBody(body)).toEqual([
      { type: 'suggestion', content: 'first\n' },
      { type: 'suggestion', content: 'second\n' },
    ])
  })

  it('ignores non-suggestion code blocks', () => {
    const body = 'text\n```typescript\nconst x = 1\n```\nmore text'
    expect(parseCommentBody(body)).toEqual([{ type: 'text', content: body }])
  })

  it('handles suggestion at the very start with no preceding text', () => {
    const body = '```suggestion\ncode\n```\ntrailing'
    const result = parseCommentBody(body)
    expect(result).toEqual([
      { type: 'suggestion', content: 'code\n' },
      { type: 'text', content: 'trailing' },
    ])
  })

  it('handles suggestion at the very end with no trailing text', () => {
    const body = 'leading\n```suggestion\ncode\n```'
    const result = parseCommentBody(body)
    expect(result).toEqual([
      { type: 'text', content: 'leading' },
      { type: 'suggestion', content: 'code\n' },
    ])
  })

  it('skips whitespace-only text between adjacent suggestions', () => {
    // The newline between two adjacent suggestions trims to empty → no text segment
    const body = '```suggestion\na\n```\n   \n```suggestion\nb\n```'
    const result = parseCommentBody(body)
    expect(result).toEqual([
      { type: 'suggestion', content: 'a\n' },
      { type: 'suggestion', content: 'b\n' },
    ])
  })

  it('skips whitespace-only trailing text after last suggestion', () => {
    const body = '```suggestion\ncode\n```\n   '
    const result = parseCommentBody(body)
    // trailing text is whitespace-only → trimmed away, no trailing text segment
    expect(result).toEqual([{ type: 'suggestion', content: 'code\n' }])
  })

  it('uses fallback for body with only whitespace between non-matching backticks', () => {
    const body = '```\njust code\n```'
    const result = parseCommentBody(body)
    expect(result).toEqual([{ type: 'text', content: body }])
  })

  it('handles suggestion with empty content', () => {
    const body = '```suggestion\n```'
    const result = parseCommentBody(body)
    expect(result).toEqual([{ type: 'suggestion', content: '' }])
  })

  it('handles text only before suggestion with whitespace-only between', () => {
    // Verifies that whitespace-only preceding text is trimmed to empty
    const body = '   \n```suggestion\nfix\n```'
    const result = parseCommentBody(body)
    expect(result).toEqual([{ type: 'suggestion', content: 'fix\n' }])
  })
})
