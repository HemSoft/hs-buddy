export type CodexUsageWindowKind = 'weekly' | 'five-hour' | 'other'

export interface CodexUsageWindow {
  kind: CodexUsageWindowKind
  label: string
  usedPercent: number
  remainingPercent: number
  resetAt: string
  durationSeconds: number
  periodStart: string
  projectedPercent: number
}

export interface CodexUsageData {
  planType: string | null
  windows: CodexUsageWindow[]
  fetchedAt: number
}

export type CodexUsageResult =
  { success: true; data: CodexUsageData } | { success: false; error: string }
