/** Extract tool-call count and unique tool names from copilot session metadata. */
export function extractToolCallInfo(metadata: Record<string, unknown>): {
  toolCallCount: number
  toolNames: string[]
} {
  let toolCallCount = 0
  const toolNames = new Set<string>()
  const rounds = (metadata?.toolCallRounds ?? []) as Array<Record<string, unknown>>
  for (const round of rounds) {
    const calls = (round.toolCalls ?? []) as Array<Record<string, unknown>>
    for (const tc of calls) {
      toolCallCount++
      if (tc.name) toolNames.add(tc.name as string)
    }
  }
  return { toolCallCount, toolNames: [...toolNames] }
}
