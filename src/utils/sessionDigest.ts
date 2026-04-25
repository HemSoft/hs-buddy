/**
 * Session digest helpers — pure functions extracted from
 * electron/services/copilotSessionService.ts.
 *
 * These compute efficiency/analysis metrics from parsed session data.
 */

import type { SessionModelInfo, SessionRequestResult, SessionDigest } from '../types/copilotSession'

/** Tool name patterns that indicate search/exploration behavior. */
export const SEARCH_TOOL_PATTERNS = [
  'grep_search',
  'semantic_search',
  'file_search',
  'search_subagent',
]

/** Base rate per token for cost estimation (USD per token, approximate). */
export const BASE_TOKEN_RATE = 0.000001

/** Aggregate token/tool totals from session results. */
export function aggregateResults(results: SessionRequestResult[]): {
  totalPromptTokens: number
  totalOutputTokens: number
  totalToolCalls: number
  totalDurationMs: number
  allToolNames: string[]
} {
  const allToolNames = new Set<string>()
  let totalPromptTokens = 0
  let totalOutputTokens = 0
  let totalToolCalls = 0
  let totalDurationMs = 0

  for (const r of results) {
    totalPromptTokens += r.promptTokens
    totalOutputTokens += r.outputTokens
    totalToolCalls += r.toolCallCount
    totalDurationMs += r.totalElapsedMs
    for (const name of r.toolNames) allToolNames.add(name)
  }

  return {
    totalPromptTokens,
    totalOutputTokens,
    totalToolCalls,
    totalDurationMs,
    allToolNames: [...allToolNames],
  }
}

/** Count requests containing search/exploration tool calls. */
export function countSearchChurn(results: SessionRequestResult[]): number {
  let searchRequests = 0
  for (const r of results) {
    if (r.toolNames.some(t => SEARCH_TOOL_PATTERNS.some(p => t.includes(p)))) {
      searchRequests++
    }
  }
  return searchRequests
}

/** Get the top N most frequently used tools across results. */
export function computeDominantTools(results: SessionRequestResult[], topN = 3): string[] {
  const freq = new Map<string, number>()
  for (const r of results) {
    for (const tool of r.toolNames) {
      freq.set(tool, (freq.get(tool) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name)
}

/** Resolve the display name from model metadata. */
export function resolveModelName(model: SessionModelInfo | null): string {
  return model?.name || model?.id || ''
}

/** Get the first prompt text, truncated to 200 characters. */
export function resolveFirstPrompt(results: SessionRequestResult[]): string {
  const prompt = results[0]?.prompt
  return prompt ? [...prompt].slice(0, 200).join('') : ''
}

/** Compute token efficiency and tool density ratios. */
export function computeEfficiencyMetrics(
  totalPromptTokens: number,
  totalOutputTokens: number,
  totalToolCalls: number,
  requestCount: number
): { tokenEfficiency: number; toolDensity: number } {
  return {
    tokenEfficiency: totalPromptTokens > 0 ? totalOutputTokens / totalPromptTokens : 0,
    toolDensity: requestCount > 0 ? totalToolCalls / requestCount : 0,
  }
}

/** Input shape for computeSessionDigest — avoids importing CopilotSession type. */
interface DigestInput {
  sessionId: string
  title: string
  startTime: number
  model: SessionModelInfo | null
  requestCount: number
  results: SessionRequestResult[]
  totalPromptTokens: number
  totalOutputTokens: number
  totalToolCalls: number
  totalDurationMs: number
}

/**
 * Compute a SessionDigest from a parsed session.
 *
 * @param now - inject current time for testability
 */
export function computeSessionDigest(
  session: DigestInput,
  workspaceName: string,
  agentMode: string,
  now: number
): SessionDigest {
  const { totalPromptTokens, totalOutputTokens, totalToolCalls, requestCount, results } = session
  const multiplier = session.model?.multiplierNumeric ?? 1
  const totalTokens = totalPromptTokens + totalOutputTokens
  const metrics = computeEfficiencyMetrics(
    totalPromptTokens,
    totalOutputTokens,
    totalToolCalls,
    requestCount
  )

  return {
    sessionId: session.sessionId,
    workspaceName,
    model: resolveModelName(session.model),
    agentMode,
    requestCount,
    totalPromptTokens,
    totalOutputTokens,
    totalToolCalls,
    totalDurationMs: session.totalDurationMs,
    ...metrics,
    searchChurn: countSearchChurn(results),
    estimatedCost: totalTokens * multiplier * BASE_TOKEN_RATE,
    dominantTools: computeDominantTools(results),
    firstPrompt: resolveFirstPrompt(results),
    sessionDate: session.startTime || now,
    digestedAt: now,
  }
}
