/**
 * Schedule timing helpers — pure functions extracted from convex/schedules.ts.
 */

interface ScheduleUpdates {
  name?: string
  description?: string
  cron?: string
  timezone?: string
  enabled?: boolean
  params?: unknown
  missedPolicy?: 'catchup' | 'skip' | 'last'
}

interface ExistingSchedule {
  cron: string
  timezone?: string
  enabled: boolean
}

/** Check if timing-relevant schedule fields changed. */
export function hasScheduleTimingChanged(
  updates: ScheduleUpdates,
  existing: ExistingSchedule
): boolean {
  const cronChanged = updates.cron !== undefined && updates.cron !== existing.cron
  const timezoneChanged = updates.timezone !== undefined && updates.timezone !== existing.timezone
  const enabledChanged = updates.enabled !== undefined && updates.enabled !== existing.enabled
  return cronChanged || timezoneChanged || enabledChanged
}

/** Merge update values over existing schedule state, applying defaults. */
function mergeScheduleValues(
  updates: ScheduleUpdates,
  existing: ExistingSchedule,
  defaultTimezone: string
) {
  return {
    enabled: updates.enabled ?? existing.enabled,
    cron: updates.cron ?? existing.cron,
    timezone: updates.timezone ?? existing.timezone ?? defaultTimezone,
  }
}

/**
 * Resolve the next run time from schedule updates and existing state.
 * Returns undefined if the schedule is disabled or timing hasn't changed.
 *
 * @param calcNextRun - injected cron calculator (avoids coupling to cron-parser)
 */
export function resolveNextRunAt(
  updates: ScheduleUpdates,
  existing: ExistingSchedule,
  defaultTimezone: string,
  calcNextRun: (cron: string, tz: string) => number
): number | undefined {
  const merged = mergeScheduleValues(updates, existing, defaultTimezone)
  if (!merged.enabled) return undefined
  if (!hasScheduleTimingChanged(updates, existing)) return undefined
  return calcNextRun(merged.cron, merged.timezone)
}

const SCHEDULE_FIELDS = [
  'name',
  'description',
  'cron',
  'timezone',
  'enabled',
  'params',
  'missedPolicy',
] as const

/** Copy only defined update fields into a new object, adding updatedAt. */
export function copyDefinedFields(updates: ScheduleUpdates, now: number): Record<string, unknown> {
  const updateData: Record<string, unknown> = { updatedAt: now }
  for (const field of SCHEDULE_FIELDS) {
    if (updates[field] !== undefined) updateData[field] = updates[field]
  }
  return updateData
}

/**
 * Build the full set of schedule update fields, including nextRunAt computation.
 *
 * @param calcNextRun - injected cron calculator
 */
export function buildScheduleUpdateFields(
  updates: ScheduleUpdates,
  existing: ExistingSchedule,
  now: number,
  defaultTimezone: string,
  calcNextRun: (cron: string, tz: string) => number
): Record<string, unknown> {
  const updateData = copyDefinedFields(updates, now)
  const { enabled } = mergeScheduleValues(updates, existing, defaultTimezone)

  if (!enabled) {
    updateData.nextRunAt = undefined
  } else if (hasScheduleTimingChanged(updates, existing)) {
    updateData.nextRunAt = resolveNextRunAt(updates, existing, defaultTimezone, calcNextRun)
  }

  return updateData
}

// ── Offline Sync helpers ───────────────────────────────────────────────

export interface OfflineSyncResult {
  schedulesProcessed: number
  runsCreated: number
  skipped: number
  errors: string[]
}

/** Create an empty offline sync result accumulator. */
export function createOfflineSyncResult(): OfflineSyncResult {
  return { schedulesProcessed: 0, runsCreated: 0, skipped: 0, errors: [] }
}

/** Returns true when a schedule has a missed run (nextRunAt is null or in the past). */
export function isMissedSchedule(schedule: { nextRunAt?: number | null }, now: number): boolean {
  return !schedule.nextRunAt || schedule.nextRunAt <= now
}

/** Accumulate a single schedule's processing result into the sync summary. */
export function accumulateScheduleResult(
  result: OfflineSyncResult,
  runsCreated: number,
  action: string
): void {
  result.schedulesProcessed++
  result.runsCreated += runsCreated
  if (action === 'skipped' || action === 'not-missed') {
    result.skipped++
  }
}

/** Build a human-readable summary line for the offline sync result. */
export function buildOfflineSyncSummary(result: OfflineSyncResult): string {
  const errorSuffix = result.errors.length > 0 ? `, ${result.errors.length} errors` : ''
  return (
    `${result.schedulesProcessed} processed, ` +
    `${result.runsCreated} runs created, ${result.skipped} skipped${errorSuffix}`
  )
}
