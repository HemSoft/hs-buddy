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

async function createRecoveryRuns(
  ctx: MutationCtx,
  schedule: Doc<'schedules'>,
  count: number,
  now: number
): Promise<void> {
  if (count === 0) return
  if (!(await ctx.db.get('jobs', schedule.jobId))) throw notFoundError('Job', schedule.jobId)
  for (let index = 0; index < count; index++) {
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
  await incrementStat(ctx.db, 'runsTriggered', count)
}

/** One transaction owns the runs, aggregates, statistics, and schedule cursor. */
export async function recoverMissedSchedule(ctx: MutationCtx, id: Id<'schedules'>) {
  const schedule = await ctx.db.get('schedules', id)
  if (!schedule) throw notFoundError('Schedule', id)
  const now = Date.now()
  if (!schedule.enabled || !isMissedSchedule(schedule, now)) {
    return { runsCreated: 0, action: 'not-missed' }
  }

  const result = recoveryPlan(schedule, now)
  await createRecoveryRuns(ctx, schedule, result.runsCreated, now)
  await ctx.db.patch('schedules', id, {
    nextRunAt: calculateNextRunAt(
      schedule.cron,
      schedule.timezone ?? DEFAULT_TIMEZONE,
      new Date(now)
    ),
    ...(result.runsCreated > 0 ? { lastRunAt: now } : {}),
    updatedAt: now,
  })
  return result
}
