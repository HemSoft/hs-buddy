import { convexToJson } from 'convex/values'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import {
  calculateNextRunAt,
  DEFAULT_TIMEZONE,
  enumerateCronOccurrences,
  validateCronExpression,
} from '../../shared/utils/cronUtils'
import { isMissedSchedule } from '../../shared/utils/scheduleUtils'
import { notFoundError } from './domain'
import { insertRun } from './runStore'
import { incrementStat } from './stats'

function recoveryPlan(schedule: Doc<'schedules'>, now: number) {
  if (schedule.missedPolicy === 'skip') return { runsCreated: 0, action: 'skipped' }
  const timezone = schedule.timezone ?? DEFAULT_TIMEZONE
  validateCronExpression(schedule.cron, timezone)
  const occurrences = enumerateCronOccurrences(
    schedule.cron,
    timezone,
    schedule.nextRunAt ?? schedule.lastRunAt ?? now,
    now,
    schedule.missedPolicy === 'last' ? 1 : 100
  )
  const runsCreated = occurrences.length
  const action =
    schedule.missedPolicy === 'catchup'
      ? `catchup (${runsCreated} runs)`
      : runsCreated > 0
        ? 'last (1 run)'
        : 'no missed runs'
  return { runsCreated, action }
}

type RecoverySchedule = Pick<Doc<'schedules'>, '_id' | 'jobId' | 'params'>

async function createRecoveryRuns(
  ctx: MutationCtx,
  schedule: RecoverySchedule,
  count: number,
  now: number
): Promise<number> {
  if (count === 0) return 0
  if (!(await ctx.db.get('jobs', schedule.jobId))) throw notFoundError('Job', schedule.jobId)
  // Reserve most of the 16 MiB transaction budget for indexes, aggregate reads
  // and writes, and the durable continuation's arguments. Count UTF-8 bytes,
  // including Convex's bigint/bytes encoding, rather than JS string length.
  const inputBytes = new TextEncoder().encode(
    JSON.stringify(convexToJson(schedule.params ?? null))
  ).byteLength
  const batchSize = Math.min(count, Math.max(1, Math.floor((512 * 1024) / (inputBytes + 1024))))
  for (let index = 0; index < batchSize; index++) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Keep bounded aggregate writes sequential inside this single recovery transaction.
    await insertRun(ctx, {
      jobId: schedule.jobId,
      scheduleId: schedule._id,
      status: 'pending',
      triggeredBy: 'schedule',
      input: schedule.params,
      startedAt: now,
    })
  }
  await incrementStat(ctx.db, 'runsTriggered', batchSize)
  if (batchSize < count) {
    await ctx.scheduler.runAfter(0, internal.schedules.continueRecovery, {
      scheduleId: schedule._id,
      jobId: schedule.jobId,
      input: schedule.params,
      remaining: count - batchSize,
      startedAt: now,
    })
  }
  return batchSize
}

/** Continue only admitted work, without rereading or advancing its interval. */
export async function continueRecoveryBatch(
  ctx: MutationCtx,
  args: {
    scheduleId: Id<'schedules'>
    jobId: Id<'jobs'>
    input?: unknown
    remaining: number
    startedAt: number
  }
): Promise<null> {
  if (!Number.isInteger(args.remaining) || args.remaining < 1 || args.remaining > 100) {
    throw new Error('Invalid recovery batch size')
  }
  // Deleting a job cancels its queued work; never recreate rows after removal.
  if (!(await ctx.db.get('jobs', args.jobId))) return null
  await createRecoveryRuns(
    ctx,
    { _id: args.scheduleId, jobId: args.jobId, params: args.input },
    args.remaining,
    args.startedAt
  )
  return null
}

/** Commit the cursor with the first batch and durable remaining-work intent. */
export async function recoverMissedSchedule(
  ctx: MutationCtx,
  id: Id<'schedules'>
): Promise<{ runsCreated: number; action: string }> {
  const schedule = await ctx.db.get('schedules', id)
  if (!schedule) throw notFoundError('Schedule', id)
  const now = Date.now()
  if (!schedule.enabled || !isMissedSchedule(schedule, now)) {
    return { runsCreated: 0, action: 'not-missed' }
  }

  const result = recoveryPlan(schedule, now)
  const runsCreated = await createRecoveryRuns(ctx, schedule, result.runsCreated, now)
  await ctx.db.patch('schedules', id, {
    nextRunAt: calculateNextRunAt(
      schedule.cron,
      schedule.timezone ?? DEFAULT_TIMEZONE,
      new Date(now)
    ),
    ...(result.runsCreated > 0 ? { lastRunAt: now } : {}),
    updatedAt: now,
  })
  return {
    runsCreated,
    action:
      runsCreated < result.runsCreated
        ? `catchup (${result.runsCreated} runs queued)`
        : result.action,
  }
}
