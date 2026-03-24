import { describe, expect, it } from 'vitest'
import { parseCommentBody } from './commentCardUtils'

describe('parseCommentBody', () => {
  it('returns empty array for null input', () => {
    const result = parseCommentBody(null)

    expect(result).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    const result = parseCommentBody(undefined)

    expect(result).toEqual([])
  })

  it('returns empty array for empty string', () => {
    const result = parseCommentBody('')

    expect(result).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    const result = parseCommentBody('   ')

    expect(result).toEqual([])
  })

  it('returns single text segment for plain text', () => {
    const result = parseCommentBody('Hello world')

    expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
  })

  it('returns text segment for multiline plain text', () => {
    const body = 'Line one\nLine two\nLine three'

    const result = parseCommentBody(body)

    expect(result).toEqual([{ type: 'text', content: 'Line one\nLine two\nLine three' }])
  })

  it('extracts a single suggestion block', () => {
    const body = '```suggestion\nconst x = 1\n```'

    const result = parseCommentBody(body)

    expect(result).toEqual([{ type: 'suggestion', content: 'const x = 1\n' }])
  })

  it('extracts text before and after a suggestion', () => {
    const body = 'Before text\n```suggestion\nfix here\n```\nAfter text'

    const result = parseCommentBody(body)

    expect(result).toEqual([
      { type: 'text', content: 'Before text' },
      { type: 'suggestion', content: 'fix here\n' },
      { type: 'text', content: 'After text' },
    ])
  })

  it('handles multiple suggestion blocks with text between', () => {
    const body = 'intro\n```suggestion\nfirst\n```\nmiddle\n```suggestion\nsecond\n```\nend'

    const result = parseCommentBody(body)

    expect(result).toEqual([
      { type: 'text', content: 'intro' },
      { type: 'suggestion', content: 'first\n' },
      { type: 'text', content: 'middle' },
      { type: 'suggestion', content: 'second\n' },
      { type: 'text', content: 'end' },
    ])
  })

  it('handles suggestion with multiline content', () => {
    const body = '```suggestion\nline1\nline2\nline3\n```'

    const result = parseCommentBody(body)

    expect(result).toEqual([{ type: 'suggestion', content: 'line1\nline2\nline3\n' }])
  })

  it('handles adjacent suggestions with no text between', () => {
    const body = '```suggestion\nfirst\n```\n```suggestion\nsecond\n```'

    const result = parseCommentBody(body)

    expect(result).toEqual([
      { type: 'suggestion', content: 'first\n' },
      { type: 'suggestion', content: 'second\n' },
    ])
  })

  it('ignores non-suggestion code blocks', () => {
    const body = 'text\n```typescript\nconst x = 1\n```\nmore text'

    const result = parseCommentBody(body)

    expect(result).toEqual([{ type: 'text', content: body }])
  })
})
