import { describe, it, expect } from 'vitest'
import { linearRegression, detectMemoryLeak } from './memory-monitor'

describe('linearRegression', () => {
  it('returns zero slope for constant values', () => {
    const points = [
      { x: 0, y: 100 },
      { x: 1, y: 100 },
      { x: 2, y: 100 },
      { x: 3, y: 100 },
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(0, 5)
  })

  it('detects perfect positive slope', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 20 },
      { x: 3, y: 30 },
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(10, 5)
    expect(result.rSquared).toBeCloseTo(1, 5)
  })

  it('detects negative slope', () => {
    const points = [
      { x: 0, y: 100 },
      { x: 1, y: 90 },
      { x: 2, y: 80 },
      { x: 3, y: 70 },
    ]
    const result = linearRegression(points)
    expect(result.slope).toBeCloseTo(-10, 5)
    expect(result.rSquared).toBeCloseTo(1, 5)
  })

  it('returns low R² for noisy data', () => {
    const points = [
      { x: 0, y: 100 },
      { x: 1, y: 500 },
      { x: 2, y: 50 },
      { x: 3, y: 400 },
      { x: 4, y: 80 },
    ]
    const result = linearRegression(points)
    expect(result.rSquared).toBeLessThan(0.5)
  })

  it('handles single point', () => {
    const result = linearRegression([{ x: 0, y: 100 }])
    expect(result.slope).toBe(0)
  })

  it('handles empty array', () => {
    const result = linearRegression([])
    expect(result.slope).toBe(0)
  })
})

describe('detectMemoryLeak', () => {
  it('reports no leak for stable memory operations', async () => {
    // Operation that doesn't leak — just creates temporary objects
    const result = await detectMemoryLeak({
      operation: () => {
        const arr = Array.from({ length: 100 }, (_, i) => i * 2)
        arr.reduce((a, b) => a + b, 0)
      },
      cycles: 20,
      warmupCycles: 3,
      leakThresholdBytes: 10 * 1024 * 1024, // 10MB — won't be hit
      forceGC: false, // GC not exposed in test environment
    })

    expect(result.leaked).toBe(false)
    expect(result.snapshots).toHaveLength(20)
    expect(result.summary).toContain('No leak detected')
  })

  it('detects leak when operation accumulates memory', async () => {
    // Simulate a leak with small but consistent allocations to avoid CI flakiness.
    // Uses 10 cycles × 10k-number arrays (~80KB each) — enough to detect a trend
    // without heavy allocation overhead.
    const leakyStore: number[][] = []

    const result = await detectMemoryLeak({
      operation: () => {
        // Each cycle adds ~80KB that's retained
        leakyStore.push(Array.from({ length: 10_000 }, (_, i) => i))
      },
      cycles: 10,
      warmupCycles: 2,
      leakThresholdBytes: 50 * 1024, // 50KB threshold — low enough to catch the small leak
      forceGC: false,
    })

    // With 10 cycles × ~80KB = ~800KB growth, this should detect a leak
    expect(result.leaked).toBe(true)
    expect(result.heapGrowthBytes).toBeGreaterThan(50 * 1024)
    expect(result.slope).toBeGreaterThan(0)
    expect(result.summary).toContain('LEAK DETECTED')

    // Clean up to avoid affecting other tests
    leakyStore.length = 0
  })

  it('returns correct snapshot count', async () => {
    const result = await detectMemoryLeak({
      operation: () => {},
      cycles: 10,
      warmupCycles: 2,
      forceGC: false,
    })

    expect(result.snapshots).toHaveLength(10)
    expect(result.snapshots[0].cycle).toBe(0)
    expect(result.snapshots[9].cycle).toBe(9)
  })

  it('handles async operations', async () => {
    const result = await detectMemoryLeak({
      operation: async () => {
        await new Promise(resolve => setTimeout(resolve, 1))
      },
      cycles: 5,
      warmupCycles: 1,
      forceGC: false,
    })

    expect(result.snapshots).toHaveLength(5)
    expect(result.leaked).toBe(false)
  })
})
