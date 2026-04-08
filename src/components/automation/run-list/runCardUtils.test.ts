import { describe, expect, it } from 'vitest'

import { formatOutput } from './runCardUtils'

describe('formatOutput', () => {
  it('returns empty string for nullish values', () => {
    expect(formatOutput(null)).toBe('')
    expect(formatOutput(undefined)).toBe('')
  })

  it('returns strings unchanged', () => {
    expect(formatOutput('hello world')).toBe('hello world')
    expect(formatOutput('')).toBe('')
  })

  it('pretty-prints JSON-serializable values', () => {
    const objectValue = { key: 'value', count: 42 }
    const arrayValue = [1, 2, 3]

    expect(formatOutput(objectValue)).toBe(JSON.stringify(objectValue, null, 2))
    expect(formatOutput(arrayValue)).toBe(JSON.stringify(arrayValue, null, 2))
    expect(formatOutput(42)).toBe('42')
    expect(formatOutput(true)).toBe('true')
  })

  it('falls back to String(output) when JSON serialization fails', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    expect(formatOutput(circular)).toBe('[object Object]')
  })
})
