import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import type {
  CopilotSession,
  SessionModelInfo,
  SessionRequestResult,
  SessionScanResult,
  SessionSummary,
} from '../../src/types/copilotSession'

// ─── VS Code Storage Discovery ────────────────────────────

export function getVSCodeStoragePath(): string {
  const appData = process.env.APPDATA
  if (!appData) return ''

  const insiders = path.join(appData, 'Code - Insiders', 'User')
  if (fs.existsSync(insiders)) return insiders

  const stable = path.join(appData, 'Code', 'User')
  if (fs.existsSync(stable)) return stable

  return ''
}

// ─── Workspace name resolution ────────────────────────────

function readWorkspaceName(wsDir: string): string {
  try {
    const raw = fs.readFileSync(path.join(wsDir, 'workspace.json'), 'utf8')
    const parsed = JSON.parse(raw)

    // Single-folder workspace: { "folder": "file:///d%3A/github/..." }
    const folder: string = parsed.folder ?? ''
    if (folder) {
      const decoded = decodeURIComponent(folder.replace(/^file:\/\/\//, ''))
      return path.basename(decoded) || decoded
    }

    // Multi-root workspace: { "workspace": "file:///path/to/name.code-workspace" }
    const workspace: string = parsed.workspace ?? ''
    if (workspace) {
      const decoded = decodeURIComponent(workspace.replace(/^file:\/\/\//, ''))
      return path.basename(decoded, '.code-workspace') || decoded
    }

    return ''
  } catch {
    return ''
  }
}

// ─── Scan: fs metadata + first-line init parse (fast) ─────

function extractScanInfo(filePath: string): { title: string; firstPrompt: string; agent: string; createdAt: number; requestCount: number } {
  const fallback = { title: '', firstPrompt: '', agent: '', createdAt: 0, requestCount: 0 }
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      // Read the first 32 KB — enough to reach title/agent/first prompt even in large init lines.
      // The init line can be huge (contains full response data), so JSON.parse may fail on
      // truncated content. Use regex to extract key fields without requiring a complete parse.
      const buf = Buffer.alloc(32768)
      const bytesRead = fs.readSync(fd, buf, 0, 32768, 0)
      if (bytesRead === 0) return fallback
      const chunk = buf.toString('utf8', 0, bytesRead)

      // Only process kind=0 lines
      if (!chunk.startsWith('{"kind":0')) return fallback

      // Extract fields via regex — works on truncated JSON
      const titleMatch = /"customTitle":"((?:[^"\\]|\\.)*)"/.exec(chunk)
      const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : ''

      const agentMatch = /"responderUsername":"((?:[^"\\]|\\.)*)"/.exec(chunk)
      const agent = agentMatch ? agentMatch[1] : ''

      const dateMatch = /"creationDate":(\d+)/.exec(chunk)
      const createdAt = dateMatch ? parseInt(dateMatch[1]) : 0

      // First user prompt: message.text in the requests array
      const promptMatch = /"message":\{"text":"((?:[^"\\]|\\.)*)"/.exec(chunk)
      const firstPrompt = promptMatch
        ? promptMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').slice(0, 200)
        : ''

      // Count requests (approximate — count "requestId" occurrences)
      const reqMatches = chunk.match(/"requestId"/g)
      const requestCount = reqMatches ? reqMatches.length : 0

      return { title, firstPrompt, agent, createdAt, requestCount }
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return fallback
  }
}

export function scanCopilotSessions(): SessionScanResult {
  const storagePath = getVSCodeStoragePath()
  if (!storagePath) return { sessions: [], totalCount: 0 }

  const wsRoot = path.join(storagePath, 'workspaceStorage')
  let wsDirs: string[]
  try {
    wsDirs = fs.readdirSync(wsRoot)
  } catch {
    return { sessions: [], totalCount: 0 }
  }

  const sessions: SessionSummary[] = []

  for (const hash of wsDirs) {
    const chatDir = path.join(wsRoot, hash, 'chatSessions')
    let files: string[]
    try {
      files = fs.readdirSync(chatDir).filter(f => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    // Resolve workspace name from workspace.json
    const workspaceName = readWorkspaceName(path.join(wsRoot, hash))

    for (const file of files) {
      const filePath = path.join(chatDir, file)
      try {
        const stat = fs.statSync(filePath)
        if (stat.size === 0) continue
        const info = extractScanInfo(filePath)
        sessions.push({
          sessionId: path.basename(file, '.jsonl'),
          filePath,
          workspaceHash: hash,
          workspaceName,
          modifiedAt: stat.mtimeMs,
          sizeBytes: stat.size,
          title: info.title,
          firstPrompt: info.firstPrompt,
          agent: info.agent,
          createdAt: info.createdAt,
          requestCount: info.requestCount,
        })
      } catch {
        // skip unreadable
      }
    }
  }

  // Sort newest first by modification time
  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt)

  return { sessions, totalCount: sessions.length }
}

// ─── Detail: parse one JSONL file (streaming) ─────────────

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

    return { prompt: '', promptTokens, outputTokens, firstProgressMs, totalElapsedMs, toolCallCount, toolNames: [...toolNames] }
  } catch {
    const pt = /"promptTokens":(\d+)/.exec(line)
    const ot = /"outputTokens":(\d+)/.exec(line)
    if (!pt || !ot) return null
    return {
      prompt: '',
      promptTokens: parseInt(pt[1]),
      outputTokens: parseInt(ot[1]),
      firstProgressMs: 0,
      totalElapsedMs: 0,
      toolCallCount: 0,
      toolNames: [],
    }
  }
}

export async function getSessionDetail(filePath: string): Promise<CopilotSession | null> {
  if (!fs.existsSync(filePath)) return null

  const workspaceHash = path.basename(path.dirname(path.dirname(filePath)))

  return new Promise((resolve) => {
    let init: SessionInitData | null = null
    let title = ''
    const resultsByIndex: Map<number, SessionRequestResult> = new Map()
    const prompts: Map<number, string> = new Map()

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
        // Extract title from init if present
        try {
          const obj = JSON.parse(line)
          if (obj.v?.customTitle) title = obj.v.customTitle
          const reqs = obj.v?.requests ?? []
          for (let i = 0; i < reqs.length; i++) {
            const msg = reqs[i]?.message?.text
            if (msg) prompts.set(i, msg)
          }
        } catch { /* regex fallback already handled init */ }
      } else if (kind === 1 && keyPath.length === 1 && keyPath[0] === 'customTitle') {
        const t = extractTitle(line)
        if (t) title = t
      } else if (kind === 1 && keyPath.length === 3 && keyPath[2] === 'result') {
        const reqIndex = parseInt(keyPath[1])
        const result = extractResultData(line)
        if (result && !isNaN(reqIndex)) resultsByIndex.set(reqIndex, result)
      } else if (kind === 2 && keyPath.length === 1 && keyPath[0] === 'requests') {
        // kind=2 requests snapshot — extract prompts for newly appended requests
        try {
          const obj = JSON.parse(line)
          const reqs = obj.v ?? []
          if (Array.isArray(reqs)) {
            for (let i = 0; i < reqs.length; i++) {
              const msg = reqs[i]?.message?.text
              if (msg && !prompts.has(i)) prompts.set(i, msg)
            }
          }
        } catch { /* skip unparseable */ }
      }
    })

    rl.on('close', () => {
      if (!init || !init.sessionId) {
        resolve(null)
        return
      }

      // Build results sorted by request index, with prompts assigned
      const results: SessionRequestResult[] = []
      const sortedIndices = [...resultsByIndex.keys()].sort((a, b) => a - b)
      for (const idx of sortedIndices) {
        const r = resultsByIndex.get(idx)!
        r.prompt = prompts.get(idx) ?? ''
        results.push(r)
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
