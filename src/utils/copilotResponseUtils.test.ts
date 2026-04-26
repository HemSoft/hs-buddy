import { describe, it, expect } from 'vitest'
import { extractAssistantContent } from './copilotResponseUtils'

describe('extractAssistantContent', () => {
  it('returns empty string for undefined response', () => {
    expect(extractAssistantContent(undefined)).toBe('')
  })

  it('returns empty string when data is missing', () => {
    expect(extractAssistantContent({} as { data?: { content?: unknown } })).toBe('')
  })

  it('returns empty string when content is missing', () => {
    expect(extractAssistantContent({ data: {} })).toBe('')
  })

  it('returns empty string when content is null', () => {
    expect(extractAssistantContent({ data: { content: null } })).toBe('')
  })

  it('returns empty string when content is empty string', () => {
    expect(extractAssistantContent({ data: { content: '' } })).toBe('')
  })

  it('returns string content directly', () => {
    expect(extractAssistantContent({ data: { content: 'hello world' } })).toBe('hello world')
  })

  it('JSON-stringifies non-string content (object)', () => {
    expect(extractAssistantContent({ data: { content: { key: 'value' } } })).toBe('{"key":"value"}')
  })

  it('JSON-stringifies non-string content (array)', () => {
    expect(extractAssistantContent({ data: { content: [1, 2, 3] } })).toBe('[1,2,3]')
  })

  it('JSON-stringifies non-string content (number)', () => {
    expect(extractAssistantContent({ data: { content: 42 } })).toBe('42')
  })

  it('JSON-stringifies boolean true', () => {
    expect(extractAssistantContent({ data: { content: true } })).toBe('true')
  })

  it('JSON-stringifies boolean false instead of treating it as missing', () => {
    expect(extractAssistantContent({ data: { content: false } })).toBe('false')
  })

  it('JSON-stringifies zero instead of treating it as missing', () => {
    expect(extractAssistantContent({ data: { content: 0 } })).toBe('0')
  })
})
