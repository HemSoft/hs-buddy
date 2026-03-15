import { describe, expect, it } from 'vitest'
import { normalizePaneSizes } from './appUtils'

describe('normalizePaneSizes', () => {
  it('returns defaults for null', () => {
    expect(normalizePaneSizes(null)).toEqual([300, 900])
  })

  it('returns defaults for undefined', () => {
    expect(normalizePaneSizes(undefined)).toEqual([300, 900])
  })

  it('returns defaults for non-array', () => {
    expect(normalizePaneSizes('not-an-array' as unknown as number[])).toEqual([300, 900])
  })

  it('returns defaults for single element array', () => {
    expect(normalizePaneSizes([100])).toEqual([300, 900])
  })

  it('returns defaults when sizes contain zero', () => {
    expect(normalizePaneSizes([0, 500])).toEqual([300, 900])
  })

  it('returns defaults when sizes contain negative', () => {
    expect(normalizePaneSizes([-1, 500])).toEqual([300, 900])
  })

  it('returns defaults for non-number elements', () => {
    expect(normalizePaneSizes(['a', 'b'] as unknown as number[])).toEqual([300, 900])
  })

  it('appends assistant pane size for 2-element array', () => {
    expect(normalizePaneSizes([200, 800])).toEqual([200, 800, 350])
  })

  it('passes through 3-element array unchanged', () => {
    expect(normalizePaneSizes([200, 600, 400])).toEqual([200, 600, 400])
  })
})
