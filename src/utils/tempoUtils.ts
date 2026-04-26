/**
 * Pure data-transformation helpers for Tempo worklog data.
 *
 * Extracted from electron/services/tempoClient.ts so they live in the
 * tested src/ surface. The electron service imports from here.
 */

import type {
  TempoApiWorklog,
  TempoWorklog,
  TempoIssueSummary,
  CreateWorklogPayload,
  UpdateWorklogPayload,
} from '../types/tempo'

/** Resolve the account key from a raw worklog's attributes. */
export function resolveWorklogAccountKey(raw: TempoApiWorklog): string {
  const accountAttr = raw.attributes?.values?.find(a => a.key === '_Account_')
  return accountAttr?.value || ''
}

/** Enrich a raw Tempo API worklog into a display-ready TempoWorklog. */
export function enrichWorklog(
  raw: TempoApiWorklog,
  issueInfo: { key: string; summary: string },
  accountMap: Map<string, string>
): TempoWorklog {
  const accountKey = resolveWorklogAccountKey(raw)
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

/** Jira custom field ID for the Capitalization (capex) toggle. */
export const CAPITALIZATION_FIELD = 'customfield_11702'

/** Extract the capitalization value from Jira fields (array or object shape). */
export function parseCapitalizationField(fields: Record<string, unknown>): boolean | null {
  const rawCapVal = fields[CAPITALIZATION_FIELD]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capVal: any = Array.isArray(rawCapVal) ? rawCapVal[0] : rawCapVal
  if (capVal?.value) return capVal.value === 'Yes'
  return null
}

/** Infer the Tempo account key from a Jira issue key prefix. */
function inferTempoAccount(issueKey: string): string {
  const prefix = issueKey.split('-')[0]
  if (prefix === 'INT') return 'INT'
  return 'GEN-DEV'
}

/** Build the JSON body for a create-worklog POST request. */
export function buildCreateWorklogBody(
  accountId: string,
  issueId: number,
  payload: CreateWorklogPayload
): Record<string, unknown> {
  const accountKey = payload.accountKey || inferTempoAccount(payload.issueKey)
  const startTime = payload.startTime ? `${payload.startTime}:00` : '08:00:00'
  return {
    issueId,
    timeSpentSeconds: Math.round(payload.hours * 3600),
    startDate: payload.date,
    startTime,
    authorAccountId: accountId,
    description: payload.description || `Working on issue ${payload.issueKey}`,
    attributes: [{ key: '_Account_', value: accountKey }],
  }
}

/** Build the JSON body for an update-worklog PUT request. */
export function buildUpdateWorklogBody(
  accountId: string,
  payload: UpdateWorklogPayload
): Record<string, unknown> {
  const body: Record<string, unknown> = { authorAccountId: accountId }
  if (payload.hours !== undefined) body.timeSpentSeconds = Math.round(payload.hours * 3600)
  if (payload.date) body.startDate = payload.date
  if (payload.startTime) body.startTime = `${payload.startTime}:00`
  if (payload.description !== undefined) body.description = payload.description
  if (payload.accountKey) body.attributes = [{ key: '_Account_', value: payload.accountKey }]
  return body
}

/** Check whether a disk cache entry is valid (non-undefined data within TTL). */
export function isCacheEntryValid(
  entry: { data?: unknown; fetchedAt?: number } | undefined,
  ttlMs: number,
  now?: number
): boolean {
  if (!entry || entry.data === undefined || typeof entry.fetchedAt !== 'number') return false
  return (now ?? Date.now()) - entry.fetchedAt < ttlMs
}

/** Summarize worklogs into issue-level aggregates, sorted by total hours descending. */
export function summarizeWorklogs(worklogs: TempoWorklog[]): {
  issueSummaries: TempoIssueSummary[]
  totalHours: number
} {
  const issueMap = new Map<string, TempoIssueSummary>()
  for (const w of worklogs) {
    let summary = issueMap.get(w.issueKey)
    if (!summary) {
      summary = {
        issueKey: w.issueKey,
        issueSummary: w.issueSummary,
        totalHours: 0,
        hoursByDate: {},
      }
      issueMap.set(w.issueKey, summary)
    }
    summary.totalHours += w.hours
    summary.hoursByDate[w.date] = (summary.hoursByDate[w.date] || 0) + w.hours
  }
  return {
    issueSummaries: [...issueMap.values()].sort((a, b) => b.totalHours - a.totalHours),
    totalHours: worklogs.reduce((sum, w) => sum + w.hours, 0),
  }
}
