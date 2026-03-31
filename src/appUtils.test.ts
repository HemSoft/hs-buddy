import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSISTANT_PANE_SIZE, DEFAULT_PANE_SIZES, normalizePaneSizes } from './appUtils'

describe('DEFAULT_PANE_SIZES', () => {
  it('has expected default values', () => {
    expect(DEFAULT_PANE_SIZES).toEqual([300, 900])
  })
})

describe('DEFAULT_ASSISTANT_PANE_SIZE', () => {
  it('has expected default value', () => {
    expect(DEFAULT_ASSISTANT_PANE_SIZE).toBe(350)
  })
})

describe('normalizePaneSizes', () => {
  it('returns defaults for null input', () => {
    const result = normalizePaneSizes(null)

    expect(result).toEqual([300, 900])
  })

  it('returns defaults for undefined input', () => {
    const result = normalizePaneSizes(undefined)

    expect(result).toEqual([300, 900])
  })

  it('returns defaults for empty array', () => {
    const result = normalizePaneSizes([])

    expect(result).toEqual([300, 900])
  })

  it('returns defaults for single-element array', () => {
    const result = normalizePaneSizes([400])

    expect(result).toEqual([300, 900])
  })

  it('returns defaults when array contains zero', () => {
    const result = normalizePaneSizes([0, 500])

    expect(result).toEqual([300, 900])
  })

  it('returns defaults when array contains negative numbers', () => {
    const result = normalizePaneSizes([-100, 500])

    expect(result).toEqual([300, 900])
  })

  it('returns defaults when array contains non-number values', () => {
    const result = normalizePaneSizes(['a', 'b'] as unknown as number[])

    expect(result).toEqual([300, 900])
  })

  it('appends assistant pane size for 2-element array', () => {
    const result = normalizePaneSizes([250, 750])

    expect(result).toEqual([250, 750, 350])
  })

  it('returns array as-is for 3-element array', () => {
    const result = normalizePaneSizes([200, 600, 400])

    expect(result).toEqual([200, 600, 400])
  })

  it('returns array as-is for 4+ element array', () => {
    const result = normalizePaneSizes([100, 200, 300, 400])

    expect(result).toEqual([100, 200, 300, 400])
  })

  it('returns a new array instance for defaults', () => {
    const result1 = normalizePaneSizes(null)
    const result2 = normalizePaneSizes(null)

    expect(result1).not.toBe(result2)
    expect(result1).toEqual(DEFAULT_PANE_SIZES)
    expect(result2).toEqual(DEFAULT_PANE_SIZES)
  })
})
