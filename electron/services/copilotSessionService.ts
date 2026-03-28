import * as fs from 'fs'
import * as path from 'path'
import type {
  CopilotSession,
  SessionModelInfo,
  SessionRequestResult,
  SessionScanResult,
  SessionTotals,
} from '../../src/types/copilotSession'

// ─── VS Code Storage Discovery ────────────────────────────

function getVSCodeStoragePath(): string {
  const appData = process.env.APPDATA
  if (!appData) return ''

  // Insiders first, then Stable
  const insiders = path.join(appData, 'Code - Insiders', 'User')
  if (fs.existsSync(insiders)) return insiders

  const stable = path.join(appData, 'Code', 'User')
  if (fs.existsSync(stable)) return stable

  return ''
}

function findChatSessionDirs(vsCodeStoragePath: string): { dir: string; hash: string }[] {
  const wsRoot = path.join(vsCodeStoragePath, 'workspaceStorage')
  if (!fs.existsSync(wsRoot)) return []

  const result: { dir: string; hash: string }[] = []
  let dirs: string[]
  try {
    dirs = fs.readdirSync(wsRoot)
  } catch {
    return []
  }

  for (const hash of dirs) {
    const chatDir = path.join(wsRoot, hash, 'chatSessions')
    if (fs.existsSync(chatDir)) {
      result.push({ dir: chatDir, hash })
    }
  }
  return result
}

// ─── JSONL Line Parsing (kind-based, ported from hs-buddy-vscode-extension) ──

interface SessionInitData {
  sessionId: string
  creationDate: number
  model: SessionModelInfo | null
}

function extractSessionInit(line: string): SessionInitData | null {
  try {
    const parsed = JSON.parse(line)
    const v = parsed.v
    if (!v) return null

    const sessionId = v.sessionId ?? ''
    const creationDate = v.creationDate ?? 0

    let model: SessionModelInfo | null = null
    const sm = v.inputState?.selectedModel?.metadata
    if (sm) {
      model = {
        id: sm.id ?? '',
        name: sm.name ?? '',
        family: sm.family ?? '',
        vendor: sm.vendor ?? '',
        multiplier: sm.multiplier ?? '1x',
        multiplierNumeric: sm.multiplierNumeric ?? 1,
        maxInputTokens: sm.maxInputTokens ?? 0,
        maxOutputTokens: sm.maxOutputTokens ?? 0,
      }
    }
    return { sessionId, creationDate, model }
  } catch {
    // Regex fallback for oversized lines
    const sidMatch = /"sessionId":"([^"]+)"/.exec(line)
    const cdMatch = /"creationDate":(\d+)/.exec(line)
    return {
      sessionId: sidMatch?.[1] ?? '',
      creationDate: cdMatch ? parseInt(cdMatch[1]) : 0,
      model: null,
    }
  }
}

function extractTitle(line: string): string | null {
  const m = /"v":"((?:[^"\\]|\\.)*)"/.exec(line)
  return m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null
}

function extractResultData(line: string): SessionRequestResult | null {
  try {
    const parsed = JSON.parse(line)
    const v = parsed.v
    if (!v) return null

    const promptTokens = v.metadata?.promptTokens ?? v.timings?.promptTokens ?? 0
    const outputTokens = v.metadata?.outputTokens ?? v.timings?.outputTokens ?? 0
    const firstProgressMs = v.timings?.firstProgress ?? 0
    const totalElapsedMs = v.timings?.totalElapsed ?? 0

    let toolCallCount = 0
    const toolNames = new Set<string>()
    for (const round of v.metadata?.toolCallRounds ?? []) {
      for (const tc of round.toolCalls ?? []) {
        toolCallCount++
        if (tc.name) toolNames.add(tc.name)
      }
    }

    return { promptTokens, outputTokens, firstProgressMs, totalElapsedMs, toolCallCount, toolNames: [...toolNames] }
  } catch {
    const pt = /"promptTokens":(\d+)/.exec(line)
    const ot = /"outputTokens":(\d+)/.exec(line)
    if (!pt || !ot) return null
    return {
      promptTokens: parseInt(pt[1]),
      outputTokens: parseInt(ot[1]),
      firstProgressMs: 0,
      totalElapsedMs: 0,
      toolCallCount: 0,
      toolNames: [],
    }
  }
}

// ─── Parse a single chatSession JSONL file ────────────────

function parseChatSessionFile(filePath: string, workspaceHash: string): CopilotSession | null {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }

  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length === 0) return null

  let init: SessionInitData | null = null
  let title = ''
  const results: SessionRequestResult[] = []
  let requestCount = 0

  for (const line of lines) {
    const kindMatch = /^\{"kind":(\d+)/.exec(line)
    if (!kindMatch) continue

    const kind = parseInt(kindMatch[1])
    const keyMatch = /"k":\[([^\]]*)\]/.exec(line)
    const keyPath = keyMatch
      ? keyMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
      : []

    if (kind === 0) {
      init = extractSessionInit(line)
    } else if (kind === 1 && keyPath.length === 1 && keyPath[0] === 'customTitle') {
      const t = extractTitle(line)
      if (t) title = t
    } else if (kind === 1 && keyPath.length === 3 && keyPath[2] === 'result') {
      const result = extractResultData(line)
      if (result) results.push(result)
    } else if (kind === 2 && keyPath.length === 1 && keyPath[0] === 'requests') {
      requestCount++
    }
  }

  if (!init || !init.sessionId) return null

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
    sessionId: init.sessionId,
    title: title || `Session ${init.sessionId.slice(0, 8)}`,
    startTime: init.creationDate,
    model: init.model,
    requestCount,
    results,
    totalPromptTokens,
    totalOutputTokens,
    totalToolCalls,
    toolsUsed: [...allToolNames],
    totalDurationMs,
    workspaceHash,
    filePath,
  }
}

// ─── Public API ───────────────────────────────────────────

export function scanCopilotSessions(): SessionScanResult {
  const storagePath = getVSCodeStoragePath()
  if (!storagePath) return { sessions: [], totals: emptyTotals() }

  const chatDirs = findChatSessionDirs(storagePath)
  const sessions: CopilotSession[] = []

  for (const { dir, hash } of chatDirs) {
    let files: string[]
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    for (const file of files) {
      const filePath = path.join(dir, file)
      const session = parseChatSessionFile(filePath, hash)
      if (session && session.requestCount > 0) {
        sessions.push(session)
      }
    }
  }

  // Sort newest first
  sessions.sort((a, b) => b.startTime - a.startTime)

  return { sessions, totals: computeTotals(sessions) }
}

export function getSessionDetail(sessionId: string): CopilotSession | null {
  const { sessions } = scanCopilotSessions()
  return sessions.find(s => s.sessionId === sessionId) ?? null
}

// ─── Helpers ──────────────────────────────────────────────

function emptyTotals(): SessionTotals {
  return {
    totalSessions: 0,
    totalRequests: 0,
    totalPromptTokens: 0,
    totalOutputTokens: 0,
    totalToolCalls: 0,
    totalDurationMs: 0,
    modelUsage: {},
    toolUsage: {},
  }
}

function computeTotals(sessions: CopilotSession[]): SessionTotals {
  const totals = emptyTotals()
  totals.totalSessions = sessions.length

  for (const s of sessions) {
    totals.totalRequests += s.requestCount
    totals.totalPromptTokens += s.totalPromptTokens
    totals.totalOutputTokens += s.totalOutputTokens
    totals.totalToolCalls += s.totalToolCalls
    totals.totalDurationMs += s.totalDurationMs

    const modelKey = s.model?.name || s.model?.id || 'unknown'
    totals.modelUsage[modelKey] = (totals.modelUsage[modelKey] ?? 0) + 1

    for (const tool of s.toolsUsed) {
      totals.toolUsage[tool] = (totals.toolUsage[tool] ?? 0) + 1
    }
  }

  return totals
}
