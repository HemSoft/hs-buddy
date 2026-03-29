import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import type {
  CopilotSession,
  SessionModelInfo,
  SessionRequestResult,
  SessionScanResult,
  SessionTotals,
} from '../../src/types/copilotSession'

// ─── Constants ────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB — skip larger files in scan
const MAX_FILES_PER_DIR = 100 // cap per workspace to avoid runaway scans

// ─── VS Code Storage Discovery ────────────────────────────

function getVSCodeStoragePath(): string {
  const appData = process.env.APPDATA
  if (!appData) return ''

  const insiders = path.join(appData, 'Code - Insiders', 'User')
  if (fs.existsSync(insiders)) return insiders

  const stable = path.join(appData, 'Code', 'User')
  if (fs.existsSync(stable)) return stable

  return ''
}

interface ChatSessionFile {
  filePath: string
  hash: string
  sizeBytes: number
}

function findChatSessionFiles(vsCodeStoragePath: string): ChatSessionFile[] {
  const wsRoot = path.join(vsCodeStoragePath, 'workspaceStorage')
  if (!fs.existsSync(wsRoot)) return []

  const result: ChatSessionFile[] = []
  let dirs: string[]
  try {
    dirs = fs.readdirSync(wsRoot)
  } catch {
    return []
  }

  for (const hash of dirs) {
    const chatDir = path.join(wsRoot, hash, 'chatSessions')
    let files: string[]
    try {
      files = fs.readdirSync(chatDir).filter(f => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    let count = 0
    for (const file of files) {
      if (count >= MAX_FILES_PER_DIR) break
      const filePath = path.join(chatDir, file)
      try {
        const stat = fs.statSync(filePath)
        result.push({ filePath, hash, sizeBytes: stat.size })
        count++
      } catch {
        // skip unreadable files
      }
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

// ─── Parse a single chatSession JSONL file (streaming) ────

function parseLineForScan(line: string): {
  kind: number
  keyPath: string[]
  init?: SessionInitData
  title?: string
  hasResult?: boolean
  result?: SessionRequestResult
} | null {
  const kindMatch = /^\{"kind":(\d+)/.exec(line)
  if (!kindMatch) return null

  const kind = parseInt(kindMatch[1])
  const keyMatch = /"k":\[([^\]]*)\]/.exec(line)
  const keyPath = keyMatch
    ? keyMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    : []

  if (kind === 0) {
    return { kind, keyPath, init: extractSessionInit(line) ?? undefined }
  }
  if (kind === 1 && keyPath.length === 1 && keyPath[0] === 'customTitle') {
    return { kind, keyPath, title: extractTitle(line) ?? undefined }
  }
  if (kind === 1 && keyPath.length === 3 && keyPath[2] === 'result') {
    return { kind, keyPath, hasResult: true }
  }
  return { kind, keyPath }
}

/** Quick scan — reads line-by-line, only extracts init + title + result count. No full result parsing. */
async function scanSessionFile(filePath: string, workspaceHash: string): Promise<CopilotSession | null> {
  return new Promise((resolve) => {
    let init: SessionInitData | null = null
    let title = ''
    let resultCount = 0

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    rl.on('line', (line) => {
      const parsed = parseLineForScan(line)
      if (!parsed) return

      if (parsed.init) init = parsed.init
      if (parsed.title) title = parsed.title
      if (parsed.hasResult) resultCount++
    })

    rl.on('close', () => {
      if (!init || !init.sessionId || resultCount === 0) {
        resolve(null)
        return
      }
      resolve({
        sessionId: init.sessionId,
        title: title || `Session ${init.sessionId.slice(0, 8)}`,
        startTime: init.creationDate,
        model: init.model,
        requestCount: resultCount,
        results: [], // Not populated in scan mode
        totalPromptTokens: 0,
        totalOutputTokens: 0,
        totalToolCalls: 0,
        toolsUsed: [],
        totalDurationMs: 0,
        workspaceHash,
        filePath,
      })
    })

    rl.on('error', () => resolve(null))
    stream.on('error', () => {
      rl.close()
      resolve(null)
    })
  })
}

/** Full parse — reads line-by-line, extracts all result data for detail view. */
async function parseSessionFileFull(filePath: string, workspaceHash: string): Promise<CopilotSession | null> {
  return new Promise((resolve) => {
    let init: SessionInitData | null = null
    let title = ''
    const results: SessionRequestResult[] = []

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    rl.on('line', (line) => {
      const kindMatch = /^\{"kind":(\d+)/.exec(line)
      if (!kindMatch) return

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
      }
    })

    rl.on('close', () => {
      if (!init || !init.sessionId) {
        resolve(null)
        return
      }

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

      resolve({
        sessionId: init!.sessionId,
        title: title || `Session ${init!.sessionId.slice(0, 8)}`,
        startTime: init!.creationDate,
        model: init!.model,
        requestCount: results.length,
        results,
        totalPromptTokens,
        totalOutputTokens,
        totalToolCalls,
        toolsUsed: [...allToolNames],
        totalDurationMs,
        workspaceHash,
        filePath,
      })
    })

    rl.on('error', () => resolve(null))
    stream.on('error', () => {
      rl.close()
      resolve(null)
    })
  })
}

// ─── Public API ───────────────────────────────────────────

let cachedResult: SessionScanResult | null = null
let cacheTime = 0
const CACHE_TTL_MS = 30_000

export async function scanCopilotSessions(): Promise<SessionScanResult> {
  // Return cache if fresh
  if (cachedResult && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedResult
  }

  const storagePath = getVSCodeStoragePath()
  if (!storagePath) return { sessions: [], totals: emptyTotals() }

  const chatFiles = findChatSessionFiles(storagePath)

  // Filter out oversized files
  const candidates = chatFiles.filter(f => f.sizeBytes <= MAX_FILE_SIZE_BYTES)

  // Process in batches to avoid too many open file handles
  const BATCH_SIZE = 20
  const sessions: CopilotSession[] = []

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(f => scanSessionFile(f.filePath, f.hash))
    )
    for (const s of results) {
      if (s) sessions.push(s)
    }
  }

  sessions.sort((a, b) => b.startTime - a.startTime)

  const result = { sessions, totals: computeTotals(sessions) }
  cachedResult = result
  cacheTime = Date.now()
  return result
}

export async function getSessionDetail(sessionId: string): Promise<CopilotSession | null> {
  // Check cache for the file path of this session
  if (cachedResult) {
    const summary = cachedResult.sessions.find(s => s.sessionId === sessionId)
    if (summary) {
      // Full parse of just this one file
      return parseSessionFileFull(summary.filePath, summary.workspaceHash)
    }
  }

  // No cache — do a scan first, then find and parse
  const { sessions } = await scanCopilotSessions()
  const summary = sessions.find(s => s.sessionId === sessionId)
  if (!summary) return null
  return parseSessionFileFull(summary.filePath, summary.workspaceHash)
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
