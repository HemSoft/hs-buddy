/** Model metadata from chatSession init lines */
export interface SessionModelInfo {
  id: string
  name: string
  family: string
  vendor: string
  multiplier: string
  multiplierNumeric: number
  maxInputTokens: number
  maxOutputTokens: number
}

/** A single completed request result extracted from a chatSession JSONL */
export interface SessionRequestResult {
  promptTokens: number
  outputTokens: number
  firstProgressMs: number
  totalElapsedMs: number
  toolCallCount: number
  toolNames: string[]
}

/** Parsed Copilot session from chatSessions/*.jsonl */
export interface CopilotSession {
  sessionId: string
  title: string
  startTime: number
  model: SessionModelInfo | null
  requestCount: number
  results: SessionRequestResult[]
  totalPromptTokens: number
  totalOutputTokens: number
  totalToolCalls: number
  toolsUsed: string[]
  totalDurationMs: number
  workspaceHash: string
  filePath: string
}

/** Aggregate totals across all sessions */
export interface SessionTotals {
  totalSessions: number
  totalRequests: number
  totalPromptTokens: number
  totalOutputTokens: number
  totalToolCalls: number
  totalDurationMs: number
  modelUsage: Record<string, number>
  toolUsage: Record<string, number>
}

/** Scan result returned by IPC */
export interface SessionScanResult {
  sessions: CopilotSession[]
  totals: SessionTotals
}
