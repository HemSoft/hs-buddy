import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import type {
  CopilotSession,
  SessionRequestResult,
  SessionScanResult,
  SessionSummary,
} from '../../src/types/copilotSession'
import {
  type SessionInitData,
  extractInitFromValue,
  extractSessionInitFallback,
  extractTitle,
  extractResultDataFallback,
  resolveTokenCounts,
  parseKeyPath,
  resolveFolderOrWorkspaceName,
  parseScanChunk,
} from '../../src/utils/copilotSessionParsing'
import { extractToolCallInfo } from '../../src/utils/toolCallParsing'
import { aggregateResults } from '../../src/utils/sessionDigest'

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

export function resolveWorkspaceName(wsDir: string): string {
  try {
    const raw = fs.readFileSync(path.join(wsDir, 'workspace.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return resolveFolderOrWorkspaceName(parsed) ?? path.basename(wsDir)
  } catch {
    return path.basename(wsDir)
  }
}

// ─── Scan: fs metadata + first-line init parse (fast) ─────

function extractScanInfo(filePath: string): {
  title: string
  firstPrompt: string
  agent: string
  createdAt: number
  requestCount: number
} {
  const fallback = { title: '', firstPrompt: '', agent: '', createdAt: 0, requestCount: 0 }
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(32768)
      const bytesRead = fs.readSync(fd, buf, 0, 32768, 0)
      if (bytesRead === 0) return fallback
      const chunk = buf.toString('utf8', 0, bytesRead)
      return parseScanChunk(chunk)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return fallback
  }
}

function collectWorkspaceSessions(wsRoot: string, hash: string): SessionSummary[] {
  const chatDir = path.join(wsRoot, hash, 'chatSessions')
  let files: string[]
  try {
    files = fs.readdirSync(chatDir).filter(f => f.endsWith('.jsonl'))
  } catch {
    return []
  }

  const workspaceName = resolveWorkspaceName(path.join(wsRoot, hash))
  const results: SessionSummary[] = []

  for (const file of files) {
    const filePath = path.join(chatDir, file)
    try {
      const stat = fs.statSync(filePath)
      if (stat.size === 0) continue
      const info = extractScanInfo(filePath)
      results.push({
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
  return results
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

  const sessions = wsDirs.flatMap(hash => collectWorkspaceSessions(wsRoot, hash))
  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt)

  return { sessions, totalCount: sessions.length }
}

// ─── Detail: parse one JSONL file (streaming) ─────────────

function collectPrompts(reqs: Array<Record<string, unknown>>, prompts: Map<number, string>): void {
  for (let i = 0; i < reqs.length; i++) {
    const msg = (reqs[i]?.message as Record<string, unknown> | undefined)?.text as
      | string
      | undefined
    if (msg) prompts.set(i, msg)
  }
}

function extractResultData(line: string): SessionRequestResult | null {
  try {
    const parsed = JSON.parse(line)
    const v = parsed.v
    if (!v) return null

    const tokens = resolveTokenCounts(v.metadata, v.timings)
    const { toolCallCount, toolNames } = extractToolCallInfo(v.metadata)

    return { prompt: '', ...tokens, toolCallCount, toolNames }
  } catch {
    return extractResultDataFallback(line)
  }
}

function handleInitLine(
  line: string,
  prompts: Map<number, string>
): { init: SessionInitData | null; title: string } {
  try {
    const obj = JSON.parse(line)
    const v = obj.v
    if (!v) return { init: null, title: '' }
    const init = extractInitFromValue(v as Record<string, unknown>)
    const title = (v.customTitle as string) ?? ''
    collectPrompts((v.requests ?? []) as Array<Record<string, unknown>>, prompts)
    return { init, title }
  } catch {
    return { init: extractSessionInitFallback(line), title: '' }
  }
}

/** Collect prompt text from a requests array into the prompts map. */
function collectRequestPrompts(reqs: unknown[], prompts: Map<number, string>): void {
  for (let i = 0; i < reqs.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (reqs[i] as any)?.message?.text
    if (msg && !prompts.has(i)) prompts.set(i, msg)
  }
}

function handleRequestsSnapshot(line: string, prompts: Map<number, string>): void {
  try {
    const obj = JSON.parse(line)
    const reqs = obj.v
    if (Array.isArray(reqs)) collectRequestPrompts(reqs, prompts)
  } catch {
    /* skip unparseable */
  }
}

interface SessionParseState {
  init: SessionInitData | null
  title: string
  resultsByIndex: Map<number, SessionRequestResult>
  prompts: Map<number, string>
}

function processInitLine(line: string, state: SessionParseState): void {
  const result = handleInitLine(line, state.prompts)
  state.init = result.init
  if (result.title) state.title = result.title
}

function tryUpdateTitle(keyPath: string[], line: string, state: SessionParseState): boolean {
  if (keyPath.length !== 1 || keyPath[0] !== 'customTitle') return false
  const t = extractTitle(line)
  if (t) state.title = t
  return true
}

function tryUpdateResult(keyPath: string[], line: string, state: SessionParseState): void {
  if (keyPath.length !== 3 || keyPath[2] !== 'result') return
  const reqIndex = parseInt(keyPath[1])
  const result = extractResultData(line)
  if (result && !isNaN(reqIndex)) state.resultsByIndex.set(reqIndex, result)
}

function processUpdateLine(keyPath: string[], line: string, state: SessionParseState): void {
  if (!tryUpdateTitle(keyPath, line, state)) {
    tryUpdateResult(keyPath, line, state)
  }
}

function processSessionLine(
  kind: number,
  keyPath: string[],
  line: string,
  state: SessionParseState
): void {
  if (kind === 0) {
    processInitLine(line, state)
  } else if (kind === 1) {
    processUpdateLine(keyPath, line, state)
  } else if (kind === 2 && keyPath.length === 1 && keyPath[0] === 'requests') {
    handleRequestsSnapshot(line, state.prompts)
  }
}

export async function getSessionDetail(filePath: string): Promise<CopilotSession | null> {
  if (!fs.existsSync(filePath)) return null

  const workspaceHash = path.basename(path.dirname(path.dirname(filePath)))

  return new Promise(resolve => {
    const state: SessionParseState = {
      init: null,
      title: '',
      resultsByIndex: new Map(),
      prompts: new Map(),
    }

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    rl.on('line', line => {
      const kindMatch = /^\{"kind":(\d+)/.exec(line)
      if (!kindMatch) return
      const kind = parseInt(kindMatch[1])
      const keyPath = parseKeyPath(line)
      processSessionLine(kind, keyPath, line, state)
    })

    rl.on('close', () => {
      if (!state.init || !state.init.sessionId) {
        resolve(null)
        return
      }

      // Build results sorted by request index, with prompts assigned
      const results: SessionRequestResult[] = []
      const sortedIndices = [...state.resultsByIndex.keys()].sort((a, b) => a - b)
      for (const idx of sortedIndices) {
        const r = state.resultsByIndex.get(idx)!
        r.prompt = state.prompts.get(idx) ?? ''
        results.push(r)
      }

      const agg = aggregateResults(results)

      resolve({
        sessionId: state.init!.sessionId,
        title: state.title || `Session ${state.init!.sessionId.slice(0, 8)}`,
        startTime: state.init!.creationDate,
        model: state.init!.model,
        requestCount: results.length,
        results,
        totalPromptTokens: agg.totalPromptTokens,
        totalOutputTokens: agg.totalOutputTokens,
        totalToolCalls: agg.totalToolCalls,
        toolsUsed: agg.allToolNames,
        totalDurationMs: agg.totalDurationMs,
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

// ─── Digest: re-exported from src/utils/sessionDigest.ts ──

export { computeSessionDigest } from '../../src/utils/sessionDigest'
