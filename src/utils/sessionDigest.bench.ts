import { bench, describe } from 'vitest'
import {
  aggregateResults,
  computeDominantTools,
  computeSessionDigest,
  countSearchChurn,
} from './sessionDigest'
import type { SessionModelInfo, SessionRequestResult } from '../types/copilotSession'

const toolPool = [
  'edit',
  'grep_search',
  'semantic_search',
  'file_search',
  'terminal',
  'apply_patch',
]

function makeResults(count: number): SessionRequestResult[] {
  return Array.from({ length: count }, (_, index) => ({
    prompt: `Investigate request ${index} and make the smallest safe change.`,
    promptTokens: 100 + (index % 13),
    outputTokens: 180 + (index % 17),
    firstProgressMs: 50 + index,
    totalElapsedMs: 500 + index * 3,
    toolCallCount: 1 + (index % 5),
    toolNames: toolPool.slice(index % 3, (index % 3) + 3),
  }))
}

const model: SessionModelInfo = {
  id: 'gpt-5.4-codex',
  name: 'GPT-5.4 Codex',
  family: 'gpt',
  vendor: 'openai',
  multiplier: '2x',
  multiplierNumeric: 2,
  maxInputTokens: 200_000,
  maxOutputTokens: 32_000,
}
const smallResults = makeResults(10)
const mediumResults = makeResults(100)
const largeResults = makeResults(500)
const mediumAggregate = aggregateResults(mediumResults)
const digestInput = {
  sessionId: 'session-1',
  title: 'Benchmark session',
  startTime: 1_782_432_000_000,
  model,
  requestCount: mediumResults.length,
  results: mediumResults,
  totalPromptTokens: mediumAggregate.totalPromptTokens,
  totalOutputTokens: mediumAggregate.totalOutputTokens,
  totalToolCalls: mediumAggregate.totalToolCalls,
  totalDurationMs: mediumAggregate.totalDurationMs,
}

describe('session result aggregation', () => {
  bench('aggregateResults — 10 requests', () => {
    aggregateResults(smallResults)
  })

  bench('aggregateResults — 100 requests', () => {
    aggregateResults(mediumResults)
  })

  bench('aggregateResults — 500 requests', () => {
    aggregateResults(largeResults)
  })
})

describe('session tool analysis', () => {
  bench('countSearchChurn — 500 requests', () => {
    countSearchChurn(largeResults)
  })

  bench('computeDominantTools — 500 requests', () => {
    computeDominantTools(largeResults)
  })
})

describe('computeSessionDigest', () => {
  bench('100-request digest', () => {
    computeSessionDigest(digestInput, 'hs-buddy', 'agent', 1_782_432_123_000)
  })
})
