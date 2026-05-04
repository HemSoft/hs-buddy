/**
 * IPC Handler Dispatch Benchmark
 *
 * Measures the overhead of the IPC handler wrapper (error handling,
 * serialization patterns) independent of actual Electron IPC transport.
 *
 * This benchmarks the dispatch layer, not the network/OS pipe.
 * For full IPC round-trip measurements, use the startup-timing
 * instrumentation with a running Electron instance.
 *
 * @vitest-environment node
 */
import { bench, describe } from 'vitest'

// Simulate the ipcHandler wrapper pattern from electron/ipc/ipcHandler.ts
function ipcHandlerSim<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  return async (...args: A): Promise<T | { success: false; error: string }> => {
    try {
      return await fn(...args)
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

// Simulate typical handler payloads with fixed data for deterministic benchmarks
const FIXED_TIMESTAMP = 1_700_000_000_000
const smallPayload = { key: 'value', count: 42 }
const mediumPayload = {
  items: Array.from({ length: 50 }, (_, i) => ({
    id: `item-${i}`,
    name: `Item ${i}`,
    status: i % 2 === 0 ? 'active' : 'inactive',
    metadata: { created: FIXED_TIMESTAMP, updated: FIXED_TIMESTAMP },
  })),
}
const largePayload = {
  data: Array.from({ length: 500 }, (_, i) => ({
    id: `record-${i}`,
    title: `Record ${i} with some longer text content`,
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    tags: ['tag-a', 'tag-b', 'tag-c'],
    nested: { level1: { level2: { value: i * 0.7 } } },
  })),
}

describe('IPC handler dispatch overhead', () => {
  const fastHandler = ipcHandlerSim(async () => smallPayload)
  const mediumHandler = ipcHandlerSim(async () => mediumPayload)
  const largeHandler = ipcHandlerSim(async () => largePayload)
  const errorHandler = ipcHandlerSim(async () => {
    throw new Error('simulated failure')
  })

  bench('small payload (~50B)', async () => {
    await fastHandler()
  })

  bench('medium payload (~5KB)', async () => {
    await mediumHandler()
  })

  bench('large payload (~50KB)', async () => {
    await largeHandler()
  })

  bench('error path', async () => {
    await errorHandler()
  })
})

describe('JSON serialization (IPC transport simulation)', () => {
  bench('serialize small payload', () => {
    JSON.stringify(smallPayload)
  })

  bench('serialize medium payload', () => {
    JSON.stringify(mediumPayload)
  })

  bench('serialize large payload', () => {
    JSON.stringify(largePayload)
  })

  bench('round-trip small (serialize + parse)', () => {
    JSON.parse(JSON.stringify(smallPayload))
  })

  bench('round-trip medium (serialize + parse)', () => {
    JSON.parse(JSON.stringify(mediumPayload))
  })

  bench('round-trip large (serialize + parse)', () => {
    JSON.parse(JSON.stringify(largePayload))
  })
})
