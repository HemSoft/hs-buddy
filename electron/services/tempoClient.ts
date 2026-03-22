import { execSync } from 'child_process'
import { getErrorMessage } from '../utils'
import { readDataCache, writeDataCacheEntry } from '../cache'
import type {
  TempoApiWorklog,
  TempoWorklog,
  TempoAccount,
  TempoDaySummary,
  TempoIssueSummary,
  CreateWorklogPayload,
  UpdateWorklogPayload,
  TempoResult,
} from '../../src/types/tempo'

const TEMPO_BASE = 'https://api.tempo.io/4'
const JIRA_BASE = 'https://relias.atlassian.net'

// --- In-memory caches ---
let cachedAccountId: string | null = null
let cachedAccounts: TempoAccount[] | null = null
let accountsCachedAt = 0
const ACCOUNTS_CACHE_TTL = 5 * 60 * 1000 // 5 min
const issueKeyCache = new Map<number, { key: string; summary: string }>()

/** Read an env var, falling back to the Windows Machine-scope registry */
function getEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  if (process.platform === 'win32') {
    try {
      const val = execSync(
        `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('${name}','Machine')"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim()
      if (val) {
        process.env[name] = val // cache for subsequent calls
        return val
      }
    } catch { /* fall through */ }
  }
  return undefined
}

function getTempoToken(): string {
  const token = getEnv('TEMPO_API_TOKEN')
  if (!token) throw new Error('TEMPO_API_TOKEN environment variable not set')
  return token
}

let jiraAvailable: boolean | null = null // null=unknown, true/false=tested

function getJiraHeaders(): Record<string, string> | null {
  if (jiraAvailable === false) return null
  const email = getEnv('ATLASSIAN_EMAIL')
  const token = getEnv('ATLASSIAN_API_TOKEN')
  if (!email || !token) {
    jiraAvailable = false
    return null
  }
  const basic = Buffer.from(`${email}:${token}`).toString('base64')
  return { Authorization: `Basic ${basic}`, Accept: 'application/json' }
}

function getTempoHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getTempoToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function fetchJson<T>(url: string, headers: Record<string, string>, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`)
  }
  return res.json() as Promise<T>
}

/** Get current user's Jira accountId — tries Jira, then disk cache */
async function getAccountId(): Promise<string> {
  if (cachedAccountId) return cachedAccountId

  // Try Jira /myself first
  const jiraHeaders = getJiraHeaders()
  if (jiraHeaders) {
    try {
      const user = await fetchJson<{ accountId: string }>(
        `${JIRA_BASE}/rest/api/3/myself`,
        jiraHeaders
      )
      cachedAccountId = user.accountId
      jiraAvailable = true
      // Persist to disk so we survive Jira outages
      writeDataCacheEntry('tempo:accountId', { data: cachedAccountId, fetchedAt: Date.now() })
      return cachedAccountId
    } catch {
      jiraAvailable = false
    }
  }

  // Fallback: read from disk cache (set by a previous successful Jira call)
  const diskCache = readDataCache()
  const cached = diskCache['tempo:accountId']
  if (cached?.data && typeof cached.data === 'string') {
    cachedAccountId = cached.data
    return cachedAccountId
  }

  throw new Error(
    'Could not determine your Jira account ID. '
    + 'Your Atlassian API token may be expired — please update ATLASSIAN_API_TOKEN '
    + 'and restart the app.'
  )
}

async function resolveIssueKey(issueId: number): Promise<{ key: string; summary: string }> {
  // 1. In-memory cache
  const memCached = issueKeyCache.get(issueId)
  if (memCached) return memCached

  // 2. Disk cache
  const diskCache = readDataCache()
  const diskEntry = diskCache[`tempo:issue:${issueId}`]
  if (diskEntry?.data) {
    const entry = diskEntry.data as { key: string; summary: string }
    issueKeyCache.set(issueId, entry)
    return entry
  }

  // 3. Live Jira lookup
  const jiraHeaders = getJiraHeaders()
  if (!jiraHeaders) return { key: `#${issueId}`, summary: '' }
  try {
    const issue = await fetchJson<{ key: string; fields: { summary: string } }>(
      `${JIRA_BASE}/rest/api/3/issue/${issueId}?fields=key,summary`,
      jiraHeaders
    )
    const result = { key: issue.key, summary: issue.fields.summary }
    issueKeyCache.set(issueId, result)
    writeDataCacheEntry(`tempo:issue:${issueId}`, { data: result, fetchedAt: Date.now() })
    return result
  } catch {
    return { key: `#${issueId}`, summary: '' }
  }
}

async function resolveIssueId(issueKey: string): Promise<number> {
  const jiraHeaders = getJiraHeaders()
  if (!jiraHeaders) throw new Error('Jira credentials not available — cannot create worklogs by issue key')
  const issue = await fetchJson<{ id: string; fields: { summary: string } }>(
    `${JIRA_BASE}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=id,summary`,
    jiraHeaders
  )
  const id = Number(issue.id)
  issueKeyCache.set(id, { key: issueKey, summary: issue.fields.summary })
  return id
}

function inferAccount(issueKey: string): string {
  const prefix = issueKey.split('-')[0]
  if (prefix === 'INT') return 'INT'
  return 'GEN-DEV'
}

function enrichWorklog(
  raw: TempoApiWorklog,
  issueInfo: { key: string; summary: string },
  accountMap: Map<string, string>
): TempoWorklog {
  const accountAttr = raw.attributes?.values?.find(a => a.key === '_Account_')
  const accountKey = accountAttr?.value || ''
  return {
    id: raw.tempoWorklogId,
    issueKey: issueInfo.key,
    issueSummary: issueInfo.summary,
    hours: Math.round((raw.timeSpentSeconds / 3600) * 100) / 100,
    date: raw.startDate,
    startTime: raw.startTime?.substring(0, 5) || '08:00',
    description: raw.description || '',
    accountKey,
    accountName: accountMap.get(accountKey) || accountKey,
  }
}

// --------------- Public API ---------------

export async function getAccounts(): Promise<TempoResult<TempoAccount[]>> {
  try {
    if (cachedAccounts && Date.now() - accountsCachedAt < ACCOUNTS_CACHE_TTL) {
      return { success: true, data: cachedAccounts }
    }
    const resp = await fetchJson<{ results: { key: string; name: string }[] }>(
      `${TEMPO_BASE}/accounts`,
      getTempoHeaders()
    )
    cachedAccounts = resp.results.map(a => ({ key: a.key, name: a.name }))
    accountsCachedAt = Date.now()
    return { success: true, data: cachedAccounts }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

async function getAccountMap(): Promise<Map<string, string>> {
  const res = await getAccounts()
  const map = new Map<string, string>()
  if (res.data) res.data.forEach(a => map.set(a.key, a.name))
  return map
}

export async function getWorklogsForRange(
  from: string,
  to: string
): Promise<TempoResult<TempoWorklog[]>> {
  try {
    const accountId = await getAccountId()
    const accountMap = await getAccountMap()
    const resp = await fetchJson<{ results: TempoApiWorklog[] }>(
      `${TEMPO_BASE}/worklogs/user/${accountId}?from=${from}&to=${to}&limit=1000`,
      getTempoHeaders()
    )
    // Resolve issue keys in parallel (uses mem + disk cache + live Jira as needed)
    const issueIds = [...new Set(resp.results.map(w => w.issue.id))]
    const issueInfos = await Promise.all(issueIds.map(id => resolveIssueKey(id)))
    const issueMap = new Map(issueIds.map((id, i) => [id, issueInfos[i]]))

    const worklogs = resp.results
      .map(raw => enrichWorklog(raw, issueMap.get(raw.issue.id)!, accountMap))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))

    return { success: true, data: worklogs }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

export async function getWorklogsForDate(date: string): Promise<TempoResult<TempoDaySummary>> {
  const result = await getWorklogsForRange(date, date)
  if (!result.success) return { success: false, error: result.error }
  const worklogs = result.data || []
  return {
    success: true,
    data: {
      date,
      totalHours: worklogs.reduce((sum, w) => sum + w.hours, 0),
      worklogs,
    },
  }
}

export async function getWeekSummary(
  weekStart: string,
  weekEnd: string
): Promise<TempoResult<{ worklogs: TempoWorklog[]; issueSummaries: TempoIssueSummary[]; totalHours: number }>> {
  const result = await getWorklogsForRange(weekStart, weekEnd)
  if (!result.success) return { success: false, error: result.error }
  const worklogs = result.data || []

  // Group by issue
  const issueMap = new Map<string, TempoIssueSummary>()
  for (const w of worklogs) {
    let summary = issueMap.get(w.issueKey)
    if (!summary) {
      summary = { issueKey: w.issueKey, issueSummary: w.issueSummary, totalHours: 0, hoursByDate: {} }
      issueMap.set(w.issueKey, summary)
    }
    summary.totalHours += w.hours
    summary.hoursByDate[w.date] = (summary.hoursByDate[w.date] || 0) + w.hours
  }

  return {
    success: true,
    data: {
      worklogs,
      issueSummaries: [...issueMap.values()].sort((a, b) => b.totalHours - a.totalHours),
      totalHours: worklogs.reduce((sum, w) => sum + w.hours, 0),
    },
  }
}

export async function createWorklog(
  payload: CreateWorklogPayload
): Promise<TempoResult<TempoWorklog>> {
  try {
    const accountId = await getAccountId()
    const issueId = await resolveIssueId(payload.issueKey)
    const accountKey = payload.accountKey || inferAccount(payload.issueKey)
    const startTime = payload.startTime ? `${payload.startTime}:00` : '08:00:00'

    const body = {
      issueId,
      timeSpentSeconds: Math.round(payload.hours * 3600),
      startDate: payload.date,
      startTime,
      authorAccountId: accountId,
      description: payload.description || `Working on issue ${payload.issueKey}`,
      attributes: [{ key: '_Account_', value: accountKey }],
    }

    const resp = await fetchJson<TempoApiWorklog>(
      `${TEMPO_BASE}/worklogs`,
      getTempoHeaders(),
      { method: 'POST', body: JSON.stringify(body) }
    )

    const issueInfo = issueKeyCache.get(issueId) || { key: payload.issueKey, summary: '' }
    const accountMap = await getAccountMap()

    return { success: true, data: enrichWorklog(resp, issueInfo, accountMap) }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

export async function updateWorklog(
  worklogId: number,
  payload: UpdateWorklogPayload
): Promise<TempoResult<void>> {
  try {
    const body: Record<string, unknown> = {}
    if (payload.hours !== undefined) body.timeSpentSeconds = Math.round(payload.hours * 3600)
    if (payload.startTime) body.startTime = `${payload.startTime}:00`
    if (payload.description !== undefined) body.description = payload.description
    if (payload.accountKey) body.attributes = [{ key: '_Account_', value: payload.accountKey }]

    await fetchJson<unknown>(
      `${TEMPO_BASE}/worklogs/${worklogId}`,
      getTempoHeaders(),
      { method: 'PUT', body: JSON.stringify(body) }
    )

    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

export async function deleteWorklog(worklogId: number): Promise<TempoResult<void>> {
  try {
    const res = await fetch(`${TEMPO_BASE}/worklogs/${worklogId}`, {
      method: 'DELETE',
      headers: getTempoHeaders(),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body || res.statusText}`)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}
