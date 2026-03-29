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
  prompt: string
  promptTokens: number
  outputTokens: number
  firstProgressMs: number
  totalElapsedMs: number
  toolCallCount: number
  toolNames: string[]
}

/** Lightweight session entry from filesystem metadata + first-line init */
export interface SessionSummary {
  sessionId: string
  filePath: string
  workspaceHash: string
  workspaceName: string
  modifiedAt: number
  sizeBytes: number
  title: string
  firstPrompt: string
  agent: string
  createdAt: number
  requestCount: number
}

/** Full session detail parsed from JSONL content */
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

/** Scan result returned by IPC — lightweight, no file content read */
export interface SessionScanResult {
  sessions: SessionSummary[]
  totalCount: number
}
