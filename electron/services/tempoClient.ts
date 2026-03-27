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
const projectIdCache = new Map<string, number>()

/** Env-var names that are safe to read from Machine scope */
const ALLOWED_ENV_NAMES = new Set([
  'TEMPO_API_TOKEN',
  'ATLASSIAN_API_TOKEN',
  'ATLASSIAN_EMAIL',
])

const envCache = new Map<string, string>()

function getEnv(name: string): string | undefined {
  // Fast path: already resolved and cached
  if (envCache.has(name)) return envCache.get(name)

  // On Windows, prefer Machine-scope value (user saves tokens there)
  // because the parent terminal may hold a stale process.env copy.
  if (process.platform === 'win32' && ALLOWED_ENV_NAMES.has(name)) {
    try {
      const val = execSync(
        `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('${name}','Machine')"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim()
      if (val) {
        envCache.set(name, val)
        return val
      }
    } catch { /* fall through */ }
  }

  // Fall back to process.env
  const val = process.env[name]
  if (val) {
    envCache.set(name, val)
    return val
  }
  return undefined
}

function getTempoToken(): string {
  const token = getEnv('TEMPO_API_TOKEN')
  if (!token) throw new Error('TEMPO_API_TOKEN environment variable not set')
  return token
}

let jiraAvailable: boolean | null = null // null=unknown, true/false=credentials tested

function getJiraHeaders(): Record<string, string> | null {
  if (jiraAvailable === false) return null
  const email = getEnv('ATLASSIAN_EMAIL')
  const token = getEnv('ATLASSIAN_API_TOKEN')
  if (!email || !token) {
    jiraAvailable = false
    return null
  }
  jiraAvailable = true
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
      // Persist to disk so we survive Jira outages
      writeDataCacheEntry('tempo:accountId', { data: cachedAccountId, fetchedAt: Date.now() })
      return cachedAccountId
    } catch (err) {
      console.warn('[Tempo] Jira /myself failed, trying disk cache:', err instanceof Error ? err.message : err)
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

async function resolveProjectId(projectKey: string): Promise<number> {
  const cached = projectIdCache.get(projectKey)
  if (cached) return cached
  const jiraHeaders = getJiraHeaders()
  if (!jiraHeaders) throw new Error('Jira credentials not available')
  const project = await fetchJson<{ id: string }>(
    `${JIRA_BASE}/rest/api/3/project/${encodeURIComponent(projectKey)}`,
    jiraHeaders
  )
  const id = Number(project.id)
  projectIdCache.set(projectKey, id)
  return id
}

export async function getProjectAccountLinks(
  projectKey: string
): Promise<TempoResult<{ key: string; name: string; isDefault: boolean }[]>> {
  try {
    const projectId = await resolveProjectId(projectKey)
    const resp = await fetchJson<{
      results: { id: number; account: { id: number; self: string }; default: boolean; scope: { id: number; type: string } }[]
    }>(
      `${TEMPO_BASE}/account-links/project/${projectId}?includeGlobalAccounts=true`,
      getTempoHeaders()
    )
    // Ensure accounts are loaded so accountIdToKey is populated
    await getAccounts()
    const accountMap = await getAccountMap()
    const links = resp.results.map(link => {
      // Resolve account key from numeric ID in the self URL
      const numericId = link.account.id ?? Number(link.account.self?.split('/').pop())
      const key = accountIdToKey.get(numericId) || ''
      return { key, name: accountMap.get(key) || key, isDefault: link.default }
    }).filter(link => link.key !== '')
    return { success: true, data: links }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
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

/** Map of numeric account ID → account key, built alongside getAccounts() */
let accountIdToKey = new Map<number, string>()

export async function getAccounts(): Promise<TempoResult<TempoAccount[]>> {
  try {
    if (cachedAccounts && Date.now() - accountsCachedAt < ACCOUNTS_CACHE_TTL) {
      return { success: true, data: cachedAccounts }
    }
    const resp = await fetchJson<{ results: { id: number; key: string; name: string }[] }>(
      `${TEMPO_BASE}/accounts`,
      getTempoHeaders()
    )
    cachedAccounts = resp.results.map(a => ({ key: a.key, name: a.name }))
    accountIdToKey = new Map(resp.results.map(a => [a.id, a.key]))
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

// --- Capex map (Capitalization field from Jira) ---

const CAPITALIZATION_FIELD = 'customfield_11702'
const capexCache = new Map<string, boolean>()

/** Resolve Capitalization for a single issue key, with parent-epic fallback */
async function resolveCapex(issueKey: string): Promise<boolean> {
  const cached = capexCache.get(issueKey)
  if (cached !== undefined) return cached

  // Check disk cache (24h TTL — stale false entries from Jira outages must expire)
  const diskCache = readDataCache()
  const diskEntry = diskCache[`tempo:capex:${issueKey}`]
  if (diskEntry?.data !== undefined && diskEntry.fetchedAt && Date.now() - diskEntry.fetchedAt < 86_400_000) {
    const val = diskEntry.data as boolean
    capexCache.set(issueKey, val)
    return val
  }

  const jiraHeaders = getJiraHeaders()
  if (!jiraHeaders) {
    capexCache.set(issueKey, false)
    return false
  }

  try {
    const issue = await fetchJson<{
      fields: Record<string, unknown>
    }>(
      `${JIRA_BASE}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${CAPITALIZATION_FIELD},parent`,
      jiraHeaders
    )

    // Field can be { value: string }, [{ value: string }], or null
    const rawCapVal = issue.fields[CAPITALIZATION_FIELD]
    const capVal = Array.isArray(rawCapVal) ? rawCapVal[0] : rawCapVal
    if (capVal?.value) {
      const isCapex = capVal.value === 'Yes'
      capexCache.set(issueKey, isCapex)
      writeDataCacheEntry(`tempo:capex:${issueKey}`, { data: isCapex, fetchedAt: Date.now() })
      return isCapex
    }

    // Fallback to parent epic
    const parent = issue.fields.parent as { key: string } | undefined
    const parentKey = parent?.key
    if (parentKey) {
      const result = await resolveCapex(parentKey)
      capexCache.set(issueKey, result)
      writeDataCacheEntry(`tempo:capex:${issueKey}`, { data: result, fetchedAt: Date.now() })
      return result
    }

    capexCache.set(issueKey, false)
    writeDataCacheEntry(`tempo:capex:${issueKey}`, { data: false, fetchedAt: Date.now() })
    return false
  } catch (err) {
    console.error(`[CapEx] Failed to resolve ${issueKey}:`, err instanceof Error ? err.message : err)
    capexCache.set(issueKey, false)
    return false
  }
}

/** Fetch user schedule (working days, holidays, non-working days) for a date range */
export async function getUserSchedule(
  from: string,
  to: string
): Promise<TempoResult<{ date: string; requiredSeconds: number; type: 'WORKING_DAY' | 'NON_WORKING_DAY' | 'HOLIDAY'; holidayName?: string }[]>> {
  try {
    const accountId = await getAccountId()
    const url = `${TEMPO_BASE}/user-schedule/${accountId}?from=${from}&to=${to}`
    const data = await fetchJson<{
      results: {
        date: string
        requiredSeconds: number
        type: string
        holiday?: { name: string }
      }[]
    }>(url, await getTempoHeaders())
    const days = data.results.map(d => ({
      date: d.date,
      requiredSeconds: d.requiredSeconds,
      type: d.type as 'WORKING_DAY' | 'NON_WORKING_DAY' | 'HOLIDAY',
      ...(d.holiday ? { holidayName: d.holiday.name } : {}),
    }))
    return { success: true, data: days }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/** Batch-resolve capitalization for a list of issue keys */
export async function getCapexMap(
  issueKeys: string[]
): Promise<TempoResult<Record<string, boolean>>> {
  try {
    const unique = [...new Set(issueKeys)]
    const entries = await Promise.all(
      unique.map(async key => [key, await resolveCapex(key)] as const)
    )
    return { success: true, data: Object.fromEntries(entries) }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}
