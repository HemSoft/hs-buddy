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
import { ipcHandler } from '../electron/ipc/ipcHandler'

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
const smallPayloadJson = JSON.stringify(smallPayload)
const mediumPayloadJson = JSON.stringify(mediumPayload)
const largePayloadJson = JSON.stringify(largePayload)

describe('IPC handler dispatch overhead', () => {
  const event = {} as Parameters<ReturnType<typeof ipcHandler>>[0]
  const fastHandler = ipcHandler(async () => smallPayload)
  const mediumHandler = ipcHandler(async () => mediumPayload)
  const largeHandler = ipcHandler(async () => largePayload)
  const errorHandler = ipcHandler(async () => {
    throw new Error('simulated failure')
  })

  bench('small payload (~50B)', async () => {
    await fastHandler(event)
  })

  bench('medium payload (~5KB)', async () => {
    await mediumHandler(event)
  })

  bench('large payload (~50KB)', async () => {
    await largeHandler(event)
  })

  bench('error path', async () => {
    await errorHandler(event)
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

  bench('parse small serialized payload', () => {
    JSON.parse(smallPayloadJson)
  })

  bench('parse medium serialized payload', () => {
    JSON.parse(mediumPayloadJson)
  })

  bench('parse large serialized payload', () => {
    JSON.parse(largePayloadJson)
  })
})
