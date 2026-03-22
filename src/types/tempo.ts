/** Raw worklog from Tempo API v4 */
export interface TempoApiWorklog {
  tempoWorklogId: number
  issue: { id: number; key?: string }
  timeSpentSeconds: number
  startDate: string // YYYY-MM-DD
  startTime: string // HH:mm:ss
  description: string
  author: { accountId: string }
  attributes: { values: { key: string; value: string }[] }
}

/** Enriched worklog for display */
export interface TempoWorklog {
  id: number
  issueKey: string
  issueSummary: string
  hours: number
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  description: string
  accountKey: string
  accountName: string
}

/** Tempo account (billing code) */
export interface TempoAccount {
  key: string
  name: string
}

/** Summary for a single day */
export interface TempoDaySummary {
  date: string // YYYY-MM-DD
  totalHours: number
  worklogs: TempoWorklog[]
}

/** Issue-level summary for the grid view */
export interface TempoIssueSummary {
  issueKey: string
  issueSummary: string
  totalHours: number
  /** Hours by date: { '2026-03-10': 2, '2026-03-11': 4 } */
  hoursByDate: Record<string, number>
}

/** Payload for creating a worklog */
export interface CreateWorklogPayload {
  issueKey: string
  hours: number
  date: string // YYYY-MM-DD
  startTime?: string // HH:mm
  description?: string
  accountKey?: string
}

/** Payload for updating a worklog */
export interface UpdateWorklogPayload {
  hours?: number
  startTime?: string
  description?: string
  accountKey?: string
}

/** Quick-log preset */
export interface TempoQuickLogPreset {
  label: string
  issueKey: string
  defaultAccount: string
  description: string
}

/** Tempo API response wrapper */
export interface TempoResult<T> {
  success: boolean
  data?: T
  error?: string
}
