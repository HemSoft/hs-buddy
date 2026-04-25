/**
 * Offline Sync — Handles missed schedules when the app was closed.
 *
 * On Electron startup (before the dispatcher starts polling), this module:
 * 1. Queries all enabled schedules where nextRunAt < now
 * 2. Applies the schedule's missedPolicy:
 *    - skip:    Advance nextRunAt to next future occurrence, no runs created
 *    - catchup: Create runs for ALL missed cron intervals
 *    - last:    Create ONE run covering all missed time
 * 3. Updates each schedule's nextRunAt to the next future occurrence
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { CONVEX_URL } from '../config'
import { calculateNextRunAt } from '../../convex/lib/cronUtils'
import { getErrorMessage } from '../../src/utils/errorUtils'
import { enumerateCronOccurrences, validateCronExpression } from '../../src/utils/cronUtils'

interface Schedule {
  _id: string
  jobId: string
  name: string
  cron: string
  timezone?: string
  enabled: boolean
  missedPolicy: 'skip' | 'catchup' | 'last'
  params?: unknown
  lastRunAt?: number
  nextRunAt?: number
}

interface OfflineSyncResult {
  schedulesProcessed: number
  runsCreated: number
  skipped: number
  errors: string[]
}

/**
 * Enumerate all missed cron occurrences between two timestamps.
 * Thin wrapper around enumerateCronOccurrences for backward compatibility.
 */
function getMissedOccurrences(
  cronExpression: string,
  timezone: string,
  fromTimestamp: number,
  toTimestamp: number,
  maxRuns = 100
): number[] {
  try {
    validateCronExpression(cronExpression, timezone)
  } catch (error) {
    console.error(
      `[OfflineSync] Failed to enumerate missed runs for cron "${cronExpression}" in timezone "${timezone}": ${getErrorMessage(error)}`
    )
    return []
  }

  return enumerateCronOccurrences(cronExpression, timezone, fromTimestamp, toTimestamp, maxRuns)
}

/**
 * Compute the next future nextRunAt and persist it via the advanceNextRun mutation.
 */
async function advanceSchedule(
  client: ConvexHttpClient,
  schedule: Schedule,
  now: number,
  lastRunAt?: number
): Promise<void> {
  const timezone = schedule.timezone ?? 'America/New_York'
  const nextRunAt = calculateNextRunAt(schedule.cron, timezone, new Date(now))
  await client.mutation(api.schedules.advanceNextRun, {
    id: schedule._id as never,
    nextRunAt,
    ...(lastRunAt !== undefined ? { lastRunAt } : {}),
  })
}

/**
 * Create `missedCount` runs for a schedule via the create mutation.
 */
async function createCatchupRuns(
  client: ConvexHttpClient,
  schedule: Schedule,
  missedCount: number
): Promise<void> {
  for (let index = 0; index < missedCount; index += 1) {
    await client.mutation(api.runs.create, {
      jobId: schedule.jobId as never,
      scheduleId: schedule._id as never,
      triggeredBy: 'schedule',
      input: schedule.params ?? undefined,
    })
  }
}

async function handleSkipPolicy(
  client: ConvexHttpClient,
  schedule: Schedule,
  now: number
): Promise<{ runsCreated: number; action: string }> {
  await advanceSchedule(client, schedule, now)
  return { runsCreated: 0, action: 'skipped' }
}

async function handleCatchupPolicy(
  client: ConvexHttpClient,
  schedule: Schedule,
  now: number,
  startFrom: number,
  timezone: string
): Promise<{ runsCreated: number; action: string }> {
  const missed = getMissedOccurrences(schedule.cron, timezone, startFrom, now)
  await createCatchupRuns(client, schedule, missed.length)
  await advanceSchedule(client, schedule, now, missed.length > 0 ? now : undefined)
  return { runsCreated: missed.length, action: `catchup (${missed.length} runs)` }
}

async function handleLastPolicy(
  client: ConvexHttpClient,
  schedule: Schedule,
  now: number,
  startFrom: number,
  timezone: string
): Promise<{ runsCreated: number; action: string }> {
  const missed = getMissedOccurrences(schedule.cron, timezone, startFrom, now, 1)
  if (missed.length > 0) {
    await createCatchupRuns(client, schedule, 1)
  }
  await advanceSchedule(client, schedule, now, missed.length > 0 ? now : undefined)
  return {
    runsCreated: missed.length > 0 ? 1 : 0,
    action: missed.length > 0 ? 'last (1 run)' : 'no missed runs',
  }
}

const DEFAULT_TIMEZONE = 'America/New_York'

function getScheduleDefaults(schedule: Schedule, now: number) {
  const timezone = schedule.timezone ?? DEFAULT_TIMEZONE
  const startFrom = schedule.nextRunAt ?? schedule.lastRunAt ?? now
  return { timezone, startFrom }
}

/**
 * Process a single schedule's missed runs based on its missedPolicy.
 */
async function processSchedule(
  client: ConvexHttpClient,
  schedule: Schedule,
  now: number
): Promise<{ runsCreated: number; action: string }> {
  if (schedule.nextRunAt && schedule.nextRunAt > now) {
    return { runsCreated: 0, action: 'not-missed' }
  }

  const { timezone, startFrom } = getScheduleDefaults(schedule, now)

  switch (schedule.missedPolicy) {
    case 'skip':
      return handleSkipPolicy(client, schedule, now)
    case 'catchup':
      return handleCatchupPolicy(client, schedule, now, startFrom, timezone)
    case 'last':
      return handleLastPolicy(client, schedule, now, startFrom, timezone)
    default:
      return { runsCreated: 0, action: 'unknown-policy' }
  }
}

/**
 * Run offline sync — call this once at app startup, before the dispatcher starts.
 *
 * Queries enabled schedules where nextRunAt is in the past, applies each
 * schedule's missedPolicy, creates appropriate runs, and advances nextRunAt.
 */
function isMissedSchedule(schedule: Schedule, now: number): boolean {
  return !schedule.nextRunAt || schedule.nextRunAt <= now
}

function processSingleSchedule(
  result: OfflineSyncResult,
  runsCreated: number,
  action: string,
  scheduleName: string
): void {
  result.schedulesProcessed++
  result.runsCreated += runsCreated
  if (action === 'skipped' || action === 'not-missed') {
    result.skipped++
  }
  console.log(`[OfflineSync] "${scheduleName}" → ${action}`)
}

export async function runOfflineSync(convexUrl?: string): Promise<OfflineSyncResult> {
  const client = new ConvexHttpClient(convexUrl ?? CONVEX_URL)
  const now = Date.now()

  const result: OfflineSyncResult = {
    schedulesProcessed: 0,
    runsCreated: 0,
    skipped: 0,
    errors: [],
  }

  try {
    const schedules = (await client.query(api.schedules.listEnabled, {})) as Schedule[]
    const missedSchedules = schedules.filter(s => isMissedSchedule(s, now))

    if (missedSchedules.length === 0) {
      console.log('[OfflineSync] No missed schedules found')
      return result
    }

    console.log(`[OfflineSync] Processing ${missedSchedules.length} missed schedule(s)...`)

    for (const schedule of missedSchedules) {
      try {
        const { runsCreated, action } = await processSchedule(client, schedule, now)
        processSingleSchedule(result, runsCreated, action, schedule.name)
      } catch (err) {
        const msg = `Failed to process "${schedule.name}": ${getErrorMessage(err)}`
        result.errors.push(msg)
        console.error(`[OfflineSync] ${msg}`)
      }
    }

    const errorSuffix = result.errors.length > 0 ? `, ${result.errors.length} errors` : ''
    console.log(
      `[OfflineSync] Complete: ${result.schedulesProcessed} processed, ` +
        `${result.runsCreated} runs created, ${result.skipped} skipped${errorSuffix}`
    )
  } catch (err) {
    const msg = `Offline sync failed: ${getErrorMessage(err)}`
    result.errors.push(msg)
    console.error(`[OfflineSync] ${msg}`)
  }

  return result
}
