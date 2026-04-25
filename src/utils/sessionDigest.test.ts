import { describe, it, expect } from 'vitest'
import {
  aggregateResults,
  countSearchChurn,
  computeDominantTools,
  resolveModelName,
  resolveFirstPrompt,
  computeEfficiencyMetrics,
  computeSessionDigest,
  SEARCH_TOOL_PATTERNS,
  BASE_TOKEN_RATE,
} from './sessionDigest'
import type { SessionRequestResult, SessionModelInfo } from '../types/copilotSession'

const makeResult = (overrides: Partial<SessionRequestResult> = {}): SessionRequestResult => ({
  prompt: '',
  promptTokens: 100,
  outputTokens: 200,
  firstProgressMs: 50,
  totalElapsedMs: 500,
  toolCallCount: 2,
  toolNames: ['edit', 'grep_search'],
  ...overrides,
})

describe('aggregateResults', () => {
  it('sums tokens and tool calls', () => {
    const results = [makeResult(), makeResult({ promptTokens: 50, outputTokens: 100 })]
    const agg = aggregateResults(results)
    expect(agg.totalPromptTokens).toBe(150)
    expect(agg.totalOutputTokens).toBe(300)
    expect(agg.totalToolCalls).toBe(4)
    expect(agg.totalDurationMs).toBe(1000)
  })

  it('deduplicates tool names', () => {
    const results = [
      makeResult({ toolNames: ['edit', 'grep'] }),
      makeResult({ toolNames: ['edit', 'view'] }),
    ]
    const agg = aggregateResults(results)
    expect(agg.allToolNames.sort()).toEqual(['edit', 'grep', 'view'])
  })

  it('handles empty results', () => {
    const agg = aggregateResults([])
    expect(agg.totalPromptTokens).toBe(0)
    expect(agg.allToolNames).toEqual([])
  })
})

describe('countSearchChurn', () => {
  it('counts requests with search tools', () => {
    const results = [
      makeResult({ toolNames: ['edit'] }),
      makeResult({ toolNames: ['grep_search'] }),
      makeResult({ toolNames: ['semantic_search', 'edit'] }),
    ]
    expect(countSearchChurn(results)).toBe(2)
  })

  it('returns 0 for no search tools', () => {
    expect(countSearchChurn([makeResult({ toolNames: ['edit', 'view'] })])).toBe(0)
  })
})

describe('SEARCH_TOOL_PATTERNS', () => {
  it('includes expected patterns', () => {
    expect(SEARCH_TOOL_PATTERNS).toContain('grep_search')
    expect(SEARCH_TOOL_PATTERNS).toContain('semantic_search')
  })
})

describe('computeDominantTools', () => {
  it('returns top 3 most frequent tools', () => {
    const results = [
      makeResult({ toolNames: ['edit', 'grep', 'view'] }),
      makeResult({ toolNames: ['edit', 'grep'] }),
      makeResult({ toolNames: ['edit'] }),
    ]
    expect(computeDominantTools(results)).toEqual(['edit', 'grep', 'view'])
  })

  it('returns fewer when less than 3 tools used', () => {
    const results = [makeResult({ toolNames: ['edit'] })]
    expect(computeDominantTools(results)).toEqual(['edit'])
  })

  it('respects custom topN', () => {
    const results = [
      makeResult({ toolNames: ['a', 'b', 'c'] }),
      makeResult({ toolNames: ['a', 'b'] }),
    ]
    expect(computeDominantTools(results, 2)).toEqual(['a', 'b'])
  })
})

describe('resolveModelName', () => {
  it('returns name when available', () => {
    expect(resolveModelName({ name: 'GPT-4' } as SessionModelInfo)).toBe('GPT-4')
  })

  it('falls back to id', () => {
    expect(resolveModelName({ name: '', id: 'gpt-4' } as SessionModelInfo)).toBe('gpt-4')
  })

  it('returns empty for null', () => {
    expect(resolveModelName(null)).toBe('')
  })
})

describe('resolveFirstPrompt', () => {
  it('returns first prompt truncated to 200 chars', () => {
    const results = [makeResult({ prompt: 'Hello World' })]
    expect(resolveFirstPrompt(results)).toBe('Hello World')
  })

  it('truncates long prompts', () => {
    const long = 'A'.repeat(300)
    const results = [makeResult({ prompt: long })]
    expect(resolveFirstPrompt(results)).toHaveLength(200)
  })

  it('returns empty for no results', () => {
    expect(resolveFirstPrompt([])).toBe('')
  })

  it('handles emoji correctly (char-level truncation)', () => {
    const emoji = '🎉'.repeat(250)
    const results = [makeResult({ prompt: emoji })]
    // [...emoji] spreads to 250 code points; .slice(0, 200) keeps first 200
    expect([...resolveFirstPrompt(results)]).toHaveLength(200)
  })
})

describe('computeEfficiencyMetrics', () => {
  it('computes ratios correctly', () => {
    const metrics = computeEfficiencyMetrics(100, 200, 10, 5)
    expect(metrics.tokenEfficiency).toBe(2)
    expect(metrics.toolDensity).toBe(2)
  })

  it('handles zero prompt tokens', () => {
    expect(computeEfficiencyMetrics(0, 200, 10, 5).tokenEfficiency).toBe(0)
  })

  it('handles zero request count', () => {
    expect(computeEfficiencyMetrics(100, 200, 10, 0).toolDensity).toBe(0)
  })
})

describe('BASE_TOKEN_RATE', () => {
  it('is a small positive number', () => {
    expect(BASE_TOKEN_RATE).toBeGreaterThan(0)
    expect(BASE_TOKEN_RATE).toBeLessThan(0.001)
  })
})

describe('computeSessionDigest', () => {
  const session = {
    sessionId: 'sess-1',
    title: 'Test Session',
    startTime: 1000,
    model: {
      id: 'gpt-4',
      name: 'GPT-4',
      family: 'gpt',
      vendor: 'openai',
      multiplier: '1x',
      multiplierNumeric: 2,
      maxInputTokens: 8000,
      maxOutputTokens: 4000,
    },
    requestCount: 2,
    results: [makeResult({ prompt: 'First prompt' }), makeResult({ toolNames: ['grep_search'] })],
    totalPromptTokens: 200,
    totalOutputTokens: 400,
    totalToolCalls: 4,
    totalDurationMs: 1000,
  }

  it('builds a complete digest', () => {
    const digest = computeSessionDigest(session, 'my-workspace', 'agent', 5000)
    expect(digest.sessionId).toBe('sess-1')
    expect(digest.workspaceName).toBe('my-workspace')
    expect(digest.model).toBe('GPT-4')
    expect(digest.agentMode).toBe('agent')
    expect(digest.requestCount).toBe(2)
    expect(digest.digestedAt).toBe(5000)
    expect(digest.sessionDate).toBe(1000)
  })

  it('applies multiplier to cost', () => {
    const digest = computeSessionDigest(session, 'ws', '', 5000)
    expect(digest.estimatedCost).toBe(600 * 2 * BASE_TOKEN_RATE)
  })

  it('uses now for sessionDate when startTime is 0', () => {
    const noStart = { ...session, startTime: 0 }
    const digest = computeSessionDigest(noStart, 'ws', '', 7000)
    expect(digest.sessionDate).toBe(7000)
  })

  it('counts search churn', () => {
    const digest = computeSessionDigest(session, 'ws', '', 5000)
    expect(digest.searchChurn).toBe(2) // both results have grep_search (via default makeResult)
  })

  it('defaults multiplier to 1 when model is null', () => {
    const noModel = { ...session, model: null }
    const digest = computeSessionDigest(noModel, 'ws', '', 5000)
    expect(digest.estimatedCost).toBe(600 * 1 * BASE_TOKEN_RATE)
    expect(digest.model).toBe('')
  })
})
