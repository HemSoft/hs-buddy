import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  CodexUsageResult,
  CodexUsageWindow,
  CodexUsageWindowKind,
} from '../../src/types/codexUsage'
import { getErrorMessage } from '../../src/utils/errorUtils'

const CODEX_USAGE_ENDPOINT = 'https://chatgpt.com/backend-api/wham/usage'
const FIVE_HOURS_SECONDS = 18_000
const WEEK_SECONDS = 604_800
const DURATION_TOLERANCE = 0.05
const REQUEST_TIMEOUT_MS = 15_000

interface CodexCredentials {
  accessToken: string
  accountId?: string
}

interface RawCodexWindow {
  used_percent?: unknown
  reset_at?: unknown
  limit_window_seconds?: unknown
}

interface ValidCodexWindow {
  used_percent: number
  reset_at: number
  limit_window_seconds: number
}

interface RawCodexUsage {
  plan_type?: unknown
  rate_limit?: {
    primary_window?: RawCodexWindow
    secondary_window?: RawCodexWindow
  }
}

interface FetchCodexUsageOptions {
  authPath?: string
  fetchImpl?: typeof fetch
  now?: Date
}

function isNearDuration(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= expected * DURATION_TOLERANCE
}

function classifyDuration(durationSeconds: number): CodexUsageWindowKind {
  if (isNearDuration(durationSeconds, WEEK_SECONDS)) return 'weekly'
  if (isNearDuration(durationSeconds, FIVE_HOURS_SECONDS)) return 'five-hour'
  return 'other'
}

function labelForDuration(durationSeconds: number): string {
  const kind = classifyDuration(durationSeconds)
  if (kind === 'weekly') return 'Weekly allowance'
  if (kind === 'five-hour') return '5-hour allowance'

  const hours = Math.max(1, Math.round(durationSeconds / 3600))
  return `${hours}-hour allowance`
}

function isValidWindow(raw: RawCodexWindow | undefined): raw is ValidCodexWindow {
  return Boolean(
    raw &&
    typeof raw.used_percent === 'number' &&
    Number.isFinite(raw.used_percent) &&
    typeof raw.reset_at === 'number' &&
    Number.isFinite(raw.reset_at) &&
    typeof raw.limit_window_seconds === 'number' &&
    Number.isFinite(raw.limit_window_seconds) &&
    raw.limit_window_seconds > 0
  )
}

function parseWindow(raw: RawCodexWindow | undefined, now: Date): CodexUsageWindow | null {
  if (!isValidWindow(raw)) return null

  const usedPercent = raw.used_percent
  const resetEpoch = raw.reset_at
  const durationSeconds = raw.limit_window_seconds

  const resetAt = new Date(resetEpoch * 1000)
  if (Number.isNaN(resetAt.getTime())) return null

  const boundedUsed = Math.min(100, Math.max(0, usedPercent))
  const periodStart = new Date(resetAt.getTime() - durationSeconds * 1000)
  const elapsedMs = Math.max(0, now.getTime() - periodStart.getTime())
  const elapsedFraction = Math.min(1, elapsedMs / (durationSeconds * 1000))
  const projectedPercent = elapsedFraction > 0 ? boundedUsed / elapsedFraction : boundedUsed

  return {
    kind: classifyDuration(durationSeconds),
    label: labelForDuration(durationSeconds),
    usedPercent: boundedUsed,
    remainingPercent: 100 - boundedUsed,
    resetAt: resetAt.toISOString(),
    durationSeconds,
    periodStart: periodStart.toISOString(),
    projectedPercent,
  }
}

const WINDOW_ORDER: Record<CodexUsageWindowKind, number> = {
  weekly: 0,
  'five-hour': 1,
  other: 2,
}

export function parseCodexUsage(payload: string, now = new Date()): CodexUsageResult {
  let raw: RawCodexUsage
  try {
    raw = JSON.parse(payload) as RawCodexUsage
  } catch (_: unknown) {
    return { success: false, error: 'Could not parse the Codex usage response.' }
  }

  const windows = [
    parseWindow(raw.rate_limit?.primary_window, now),
    parseWindow(raw.rate_limit?.secondary_window, now),
  ]
    .filter((window): window is CodexUsageWindow => window !== null)
    .sort((left, right) => WINDOW_ORDER[left.kind] - WINDOW_ORDER[right.kind])

  if (windows.length === 0) {
    return { success: false, error: 'No Codex allowance windows are available for this account.' }
  }

  return {
    success: true,
    data: {
      planType: typeof raw.plan_type === 'string' ? raw.plan_type : null,
      windows,
      fetchedAt: now.getTime(),
    },
  }
}

export function getCodexAuthPath(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return join(codexHome || join(homedir(), '.codex'), 'auth.json')
}

function readStringProperty(
  value: Record<string, unknown>,
  snakeCase: string,
  camelCase: string
): string | undefined {
  const candidate = value[snakeCase] ?? value[camelCase]
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined
}

async function readCodexCredentials(authPath: string): Promise<CodexCredentials | null> {
  try {
    const payload = JSON.parse(await readFile(authPath, 'utf8')) as { tokens?: unknown }
    if (!payload.tokens || typeof payload.tokens !== 'object') return null

    const tokens = payload.tokens as Record<string, unknown>
    const accessToken = readStringProperty(tokens, 'access_token', 'accessToken')
    if (!accessToken) return null

    return {
      accessToken,
      accountId: readStringProperty(tokens, 'account_id', 'accountId'),
    }
  } catch (_: unknown) {
    return null
  }
}

export async function fetchCodexUsage(
  options: FetchCodexUsageOptions = {}
): Promise<CodexUsageResult> {
  const credentials = await readCodexCredentials(options.authPath ?? getCodexAuthPath())
  if (!credentials) {
    return {
      success: false,
      error: "No Codex ChatGPT login found. Run 'codex' and sign in with ChatGPT.",
    }
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${credentials.accessToken}`,
      'User-Agent': 'hs-buddy',
    }
    if (credentials.accountId) headers['ChatGPT-Account-Id'] = credentials.accountId

    const response = await (options.fetchImpl ?? fetch)(CODEX_USAGE_ENDPOINT, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error: "Codex ChatGPT login expired. Run 'codex' and sign in again.",
      }
    }
    if (!response.ok) {
      return { success: false, error: `ChatGPT usage returned HTTP ${response.status}.` }
    }

    return parseCodexUsage(await response.text(), options.now)
  } catch (error: unknown) {
    return { success: false, error: `Could not load Codex usage: ${getErrorMessage(error)}` }
  }
}
