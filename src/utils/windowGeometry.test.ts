import { describe, it, expect } from 'vitest'
import { resolveWindowBounds, type Rectangle, type DisplayInfo } from './windowGeometry'

const primaryWorkArea: Rectangle = { x: 0, y: 0, width: 1920, height: 1080 }

const display1: DisplayInfo = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}
const display2: DisplayInfo = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
}

const defaultScreenInfo = {
  savedDisplayId: 1,
  savedDisplayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  allDisplays: [display1, display2],
  primaryWorkArea,
  getMatchingDisplay: () => display1,
}

// ─── resolveWindowBounds ────────────────────────────────

describe('resolveWindowBounds', () => {
  it('passes through when x/y are undefined', () => {
    const result = resolveWindowBounds({ width: 1400, height: 900 }, defaultScreenInfo)
    expect(result).toEqual({ x: undefined, y: undefined, width: 1400, height: 900 })
  })

  it('passes through when savedDisplayId is 0', () => {
    const result = resolveWindowBounds(
      { x: 100, y: 200, width: 800, height: 600 },
      { ...defaultScreenInfo, savedDisplayId: 0 }
    )
    expect(result).toEqual({ x: 100, y: 200, width: 800, height: 600 })
  })

  it('centers on primary when saved display not found', () => {
    const result = resolveWindowBounds(
      { x: 100, y: 200, width: 800, height: 600 },
      { ...defaultScreenInfo, savedDisplayId: 999 }
    )
    expect(result.x).toBe(560) // centered: (1920-800)/2
    expect(result.y).toBe(240) // centered: (1080-600)/2
    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
  })

  it('centers oversized window on primary when saved display not found', () => {
    const result = resolveWindowBounds(
      { x: 0, y: 0, width: 3000, height: 2000 },
      { ...defaultScreenInfo, savedDisplayId: 999 }
    )
    expect(result).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('centers on offset primary work area when saved display not found', () => {
    const offsetPrimary: Rectangle = { x: 1920, y: 0, width: 1920, height: 1080 }
    const result = resolveWindowBounds(
      { x: 100, y: 200, width: 800, height: 600 },
      { ...defaultScreenInfo, savedDisplayId: 999, primaryWorkArea: offsetPrimary }
    )
    expect(result.x).toBe(2480) // 1920 + (1920-800)/2
  })

  it('relocates when target display mismatches saved display', () => {
    const result = resolveWindowBounds(
      { x: 100, y: 200, width: 800, height: 600 },
      {
        ...defaultScreenInfo,
        savedDisplayId: 2,
        savedDisplayBounds: display1.bounds,
        getMatchingDisplay: () => display1,
      }
    )
    expect(result.x).toBeGreaterThanOrEqual(1920)
    expect(result.y).toBe(200)
  })

  it('relocates using targetBounds when savedDisplayBounds has zero width', () => {
    const result = resolveWindowBounds(
      { x: 100, y: 200, width: 800, height: 600 },
      {
        ...defaultScreenInfo,
        savedDisplayId: 2,
        savedDisplayBounds: { x: 0, y: 0, width: 0, height: 0 },
        getMatchingDisplay: () => display1,
      }
    )
    expect(result.x).toBe(2020) // 1920 + (100-0), clamped to work area
    expect(result.y).toBe(200)
  })

  it('clamps to saved display when target matches', () => {
    const result = resolveWindowBounds(
      { x: 100, y: 200, width: 800, height: 600 },
      {
        ...defaultScreenInfo,
        savedDisplayId: 1,
        getMatchingDisplay: () => display1,
      }
    )
    expect(result).toEqual({ x: 100, y: 200, width: 800, height: 600 })
  })

  it('clamps oversized dimensions to work area', () => {
    const result = resolveWindowBounds(
      { x: 0, y: 0, width: 3000, height: 2000 },
      { ...defaultScreenInfo, getMatchingDisplay: () => display1 }
    )
    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
  })

  it('clamps x to not exceed right edge of saved display', () => {
    const result = resolveWindowBounds(
      { x: 1800, y: 0, width: 400, height: 100 },
      { ...defaultScreenInfo, getMatchingDisplay: () => display1 }
    )
    expect(result.x).toBe(1520) // 1920 - 400
  })

  it('clamps y to not exceed bottom edge of saved display', () => {
    const result = resolveWindowBounds(
      { x: 0, y: 1000, width: 100, height: 200 },
      { ...defaultScreenInfo, getMatchingDisplay: () => display1 }
    )
    expect(result.y).toBe(880) // 1080 - 200
  })

  it('clamps negative x to work area origin', () => {
    const result = resolveWindowBounds(
      { x: -100, y: 100, width: 400, height: 300 },
      { ...defaultScreenInfo, getMatchingDisplay: () => display1 }
    )
    expect(result.x).toBe(0)
  })

  it('clamps negative y to work area origin', () => {
    const result = resolveWindowBounds(
      { x: 100, y: -50, width: 400, height: 300 },
      { ...defaultScreenInfo, getMatchingDisplay: () => display1 }
    )
    expect(result.y).toBe(0)
  })

  it('clamps on offset work area display', () => {
    const result = resolveWindowBounds(
      { x: 1800, y: 0, width: 400, height: 300 },
      {
        ...defaultScreenInfo,
        savedDisplayId: 2,
        getMatchingDisplay: () => display2,
      }
    )
    expect(result.x).toBe(1920) // min is workArea.x = 1920
  })
})
