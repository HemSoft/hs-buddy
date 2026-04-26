import { describe, expect, it } from 'vitest'
import { normalizePaneSizes, safeLength, computeAppMetrics, isAppLoading } from './appUtils'

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

describe('safeLength', () => {
  it('returns 0 for undefined', () => {
    expect(safeLength(undefined)).toBe(0)
  })

  it('returns length for array-like objects', () => {
    expect(safeLength([1, 2, 3])).toBe(3)
  })

  it('returns 0 for empty array', () => {
    expect(safeLength([])).toBe(0)
  })
})

describe('computeAppMetrics', () => {
  it('computes counts from schedules and jobs', () => {
    const result = computeAppMetrics([1, 2], [1], { a: 3, b: 2 }, false, [300, 900])
    expect(result.scheduleCount).toBe(2)
    expect(result.jobCount).toBe(1)
    expect(result.totalPRCount).toBe(5)
  })

  it('handles undefined schedules and jobs', () => {
    const result = computeAppMetrics(undefined, undefined, {}, false, [300, 900])
    expect(result.scheduleCount).toBe(0)
    expect(result.jobCount).toBe(0)
    expect(result.totalPRCount).toBe(0)
  })

  it('slices paneSizes when assistant is closed', () => {
    const result = computeAppMetrics(undefined, undefined, {}, false, [300, 900, 400])
    expect(result.defaultSizes).toEqual([300, 900])
  })

  it('passes full paneSizes when assistant is open', () => {
    const result = computeAppMetrics(undefined, undefined, {}, true, [300, 900, 400])
    expect(result.defaultSizes).toEqual([300, 900, 400])
  })

  it('uses DEFAULT_ASSISTANT_PANE_SIZE when paneSizes[2] is missing', () => {
    const result = computeAppMetrics(undefined, undefined, {}, false, [300, 900])
    expect(result.assistantPaneSize).toBe(350)
  })

  it('uses paneSizes[2] when present', () => {
    const result = computeAppMetrics(undefined, undefined, {}, false, [300, 900, 500])
    expect(result.assistantPaneSize).toBe(500)
  })
})

describe('isAppLoading', () => {
  it('returns true when layout not loaded', () => {
    expect(isAppLoading(false, true, false, false)).toBe(true)
  })

  it('returns true when terminal not loaded', () => {
    expect(isAppLoading(true, false, false, false)).toBe(true)
  })

  it('returns true when migration loading and not complete', () => {
    expect(isAppLoading(true, true, true, false)).toBe(true)
  })

  it('returns false when all loaded and migration complete', () => {
    expect(isAppLoading(true, true, true, true)).toBe(false)
  })

  it('returns false when all loaded and no migration', () => {
    expect(isAppLoading(true, true, false, false)).toBe(false)
  })
})
