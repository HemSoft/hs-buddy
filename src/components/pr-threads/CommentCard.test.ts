import { describe, expect, it } from 'vitest'
import { parseCommentBody } from './commentCardUtils'

describe('parseCommentBody', () => {
  it('returns text segment for plain body', () => {
    const result = parseCommentBody('Just a regular comment.')
    expect(result).toEqual([{ type: 'text', content: 'Just a regular comment.' }])
  })

  it('extracts suggestion block', () => {
    const body = 'Please change this:\n```suggestion\nconst x = 1;\n```\nThanks!'
    const result = parseCommentBody(body)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Please change this:' })
    expect(result[1]).toEqual({ type: 'suggestion', content: 'const x = 1;\n' })
    expect(result[2]).toEqual({ type: 'text', content: 'Thanks!' })
  })

  it('handles multiple suggestion blocks', () => {
    const body = 'Fix 1:\n```suggestion\nfix1\n```\nFix 2:\n```suggestion\nfix2\n```'
    const result = parseCommentBody(body)
    expect(result).toHaveLength(4)
    expect(result.filter(s => s.type === 'suggestion')).toHaveLength(2)
  })

  it('handles suggestion-only body', () => {
    const body = '```suggestion\nconst y = 2;\n```'
    const result = parseCommentBody(body)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('suggestion')
    expect(result[0].content).toBe('const y = 2;\n')
  })

  it('returns empty array for null body', () => {
    expect(parseCommentBody(null)).toEqual([])
  })

  it('returns empty array for undefined body', () => {
    expect(parseCommentBody(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseCommentBody('')).toEqual([])
  })

  it('returns empty array for whitespace-only body', () => {
    expect(parseCommentBody('   ')).toEqual([])
  })

  it('handles suggestion with multiline content', () => {
    const body = '```suggestion\nline1\nline2\nline3\n```'
    const result = parseCommentBody(body)
    expect(result[0].content).toBe('line1\nline2\nline3\n')
  })
})
