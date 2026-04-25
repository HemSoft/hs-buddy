/**
 * Pure parsing helpers for Copilot session JSONL data.
 *
 * Extracted from electron/services/copilotSessionService.ts so they live in the
 * tested src/ surface. The electron service re-exports from here.
 */

import type { SessionModelInfo, SessionRequestResult } from '../types/copilotSession'

// ─── Types ────────────────────────────────────────────────

export interface SessionInitData {
  sessionId: string
  creationDate: number
  model: SessionModelInfo | null
}

// ─── Helpers ──────────────────────────────────────────────

/** Safely cast an unknown value to string with a fallback. */
export function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d
}

/** Safely cast an unknown value to number with a fallback. */
export function num(v: unknown, d = 0): number {
  return typeof v === 'number' ? v : d
}

/** Platform-agnostic basename (no Node `path` dependency). */
function baseName(p: string, ext?: string): string {
  const name = p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || p
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name
}

// ─── Model metadata ──────────────────────────────────────

export function parseModelMetadata(sm: Record<string, unknown>): SessionModelInfo {
  return {
    id: str(sm.id),
    name: str(sm.name),
    family: str(sm.family),
    vendor: str(sm.vendor),
    multiplier: str(sm.multiplier, '1x'),
    multiplierNumeric: num(sm.multiplierNumeric, 1),
    maxInputTokens: num(sm.maxInputTokens),
    maxOutputTokens: num(sm.maxOutputTokens),
  }
}

// ─── Init data extraction ────────────────────────────────

export function extractInitFromValue(v: Record<string, unknown>): SessionInitData {
  const sm = (v.inputState as Record<string, unknown>)?.selectedModel as
    | Record<string, unknown>
    | undefined
  return {
    sessionId: (v.sessionId as string) ?? '',
    creationDate: (v.creationDate as number) ?? 0,
    model: sm?.metadata ? parseModelMetadata(sm.metadata as Record<string, unknown>) : null,
  }
}

export function extractSessionInitFallback(line: string): SessionInitData {
  const sidMatch = /"sessionId":"([^"]+)"/.exec(line)
  const cdMatch = /"creationDate":(\d+)/.exec(line)
  return {
    sessionId: sidMatch?.[1] ?? '',
    creationDate: cdMatch ? parseInt(cdMatch[1]) : 0,
    model: null,
  }
}

// ─── Workspace name ──────────────────────────────────────

function decodePath(encoded: string, ext?: string): string {
  const decoded = decodeURIComponent(encoded.replace(/^file:\/\/\//, ''))
  return baseName(decoded, ext) || decoded
}

export function resolveFolderOrWorkspaceName(parsed: Record<string, unknown>): string | null {
  const folder = (parsed.folder as string) ?? ''
  if (folder) return decodePath(folder)
  const workspace = (parsed.workspace as string) ?? ''
  if (workspace) return decodePath(workspace, '.code-workspace')
  return null
}

// ─── Title extraction ────────────────────────────────────

export function extractTitle(line: string): string | null {
  const m = /"v":"((?:[^"\\]|\\.)*)"/.exec(line)
  return m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null
}

// ─── Token / metric helpers ──────────────────────────────

export function resolveMetricValue(
  primary: number | undefined,
  fallback: number | undefined
): number {
  return primary ?? fallback ?? 0
}

export function resolveTokenCounts(
  metadata: Record<string, number> | undefined,
  timings: Record<string, number> | undefined
): { promptTokens: number; outputTokens: number; firstProgressMs: number; totalElapsedMs: number } {
  const m = metadata ?? {}
  const t = timings ?? {}
  return {
    promptTokens: resolveMetricValue(m.promptTokens, t.promptTokens),
    outputTokens: resolveMetricValue(m.outputTokens, t.outputTokens),
    firstProgressMs: t.firstProgress ?? 0,
    totalElapsedMs: t.totalElapsed ?? 0,
  }
}

export function extractResultDataFallback(line: string): SessionRequestResult | null {
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

// ─── Key-path parsing ────────────────────────────────────

export function parseKeyPath(line: string): string[] {
  const keyMatch = /"k":\[([^\]]*)\]/.exec(line)
  return keyMatch
    ? keyMatch[1]
        .split(',')
        .map(s => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean)
    : []
}

// ─── Scan-chunk parsing ──────────────────────────────────

/** Extract a regex capture group from text, returning fallback if no match. */
export function regexExtract(text: string, pattern: RegExp, fallback: string): string {
  const safePattern = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))
  const m = safePattern.exec(text)
  return m ? m[1] : fallback
}

interface ScanChunkResult {
  title: string
  firstPrompt: string
  agent: string
  createdAt: number
  requestCount: number
}

const SCAN_CHUNK_FALLBACK: ScanChunkResult = {
  title: '',
  firstPrompt: '',
  agent: '',
  createdAt: 0,
  requestCount: 0,
}

/**
 * Parse session metadata from the first chunk of a JSONL session file.
 * Uses regex extraction to work on truncated JSON (no full parse needed).
 */
export function parseScanChunk(chunk: string): ScanChunkResult {
  if (!chunk.startsWith('{"kind":0')) return { ...SCAN_CHUNK_FALLBACK }

  const titleRaw = regexExtract(chunk, /"customTitle":"((?:[^"\\]|\\.)*)"/, '')
  const title = titleRaw.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  const agent = regexExtract(chunk, /"responderUsername":"((?:[^"\\]|\\.)*)"/, '')
  const createdAt = parseInt(regexExtract(chunk, /"creationDate":(\d+)/, '0'))

  const promptRaw = regexExtract(chunk, /"message":\{"text":"((?:[^"\\]|\\.)*)"/, '')
  const firstPrompt = promptRaw
    ? [...promptRaw.replace(/\\"/g, '"').replace(/\\\\/g, '\\')].slice(0, 200).join('')
    : ''

  const reqMatches = chunk.match(/"requestId"/g)
  const requestCount = reqMatches ? reqMatches.length : 0

  return { title, firstPrompt, agent, createdAt, requestCount }
}
