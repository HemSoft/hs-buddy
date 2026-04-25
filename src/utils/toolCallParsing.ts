/** Extract tool-call count and unique tool names from copilot session metadata. */
export function extractToolCallInfo(metadata: Record<string, unknown>): {
  toolCallCount: number
  toolNames: string[]
} {
  const raw = metadata?.toolCallRounds
  const rounds = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []
  const calls = rounds.flatMap(r =>
    Array.isArray(r.toolCalls) ? (r.toolCalls as Array<Record<string, unknown>>) : []
  )
  const toolNames = new Set(
    calls.map(tc => tc.name).filter((name): name is string => typeof name === 'string')
  )
  return { toolCallCount: calls.length, toolNames: [...toolNames] }
}
