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

/** Efficiency digest computed from a full CopilotSession parse */
export interface SessionDigest {
  sessionId: string
  workspaceName: string
  model: string
  agentMode: string
  requestCount: number
  totalPromptTokens: number
  totalOutputTokens: number
  totalToolCalls: number
  totalDurationMs: number
  /** outputTokens / promptTokens — low ratio = model thinking more than producing */
  tokenEfficiency: number
  /** toolCalls / requests — high = agentic, low = chatty */
  toolDensity: number
  /** Repeated search/grep tool calls hinting at blind exploration */
  searchChurn: number
  /** (promptTokens + outputTokens) × multiplier × base rate */
  estimatedCost: number
  /** Top 3 tools by frequency */
  dominantTools: string[]
  firstPrompt: string
  sessionDate: number
  digestedAt: number
}
