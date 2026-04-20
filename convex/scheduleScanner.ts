import { internalMutation } from './_generated/server'
import { calculateNextRunAt, DEFAULT_TIMEZONE } from './lib/cronUtils'
import { isPendingOrRunning } from './lib/domain'
import { incrementStat } from './lib/stats'

/**
 * Schedule Scanner Module
 *
 * Contains internal functions for scanning and processing due schedules.
 * Called by the cron job defined in crons.ts.
 */

/**
 * Main scan and dispatch function.
 *
 * Called every minute by the cron job. This function:
 * 1. Queries for due schedules
 * 2. Creates pending runs for each due schedule
 * 3. Updates schedule timing (lastRunAt, nextRunAt)
 * 4. Handles edge cases like missed schedules
 */
export const scanAndDispatch = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()
    let runsCreated = 0
    let schedulesUpdated = 0

    // Get all enabled schedules
    const enabledSchedules = await ctx.db
      .query('schedules')
      .withIndex('by_enabled', q => q.eq('enabled', true))
      .collect()

    for (const schedule of enabledSchedules) {
      // Check if schedule is due
      // A schedule is due if:
      // 1. nextRunAt is not set (needs initialization), OR
      // 2. nextRunAt <= now (time has come)
      const isDue = !schedule.nextRunAt || schedule.nextRunAt <= now

      if (!isDue) {
        continue
      }

      // Get the job to include input params in the run
      const job = await ctx.db.get('jobs', schedule.jobId)
      if (!job) {
        console.error(`Job ${schedule.jobId} not found for schedule ${schedule._id}`)
        // Disable the orphaned schedule
        await ctx.db.patch('schedules', schedule._id, {
          enabled: false,
          updatedAt: now,
        })
        continue
      }

      // Check if there's already a pending or running run for this schedule
      // to prevent duplicate runs for the same interval
      // Get recent runs for this schedule and filter in code
      // (avoids .filter() per Convex best practices)
      const recentRuns = await ctx.db
        .query('runs')
        .withIndex('by_schedule', q => q.eq('scheduleId', schedule._id))
        .order('desc')
        .take(10)
      const existingRun = recentRuns.find(r => isPendingOrRunning(r.status)) ?? null

      if (existingRun) {
        // Skip - there's already a pending/running run for this schedule
        // Just update nextRunAt to prevent re-triggering
        const nextRunAt = calculateNextRunAt(
          schedule.cron,
          schedule.timezone ?? DEFAULT_TIMEZONE,
          new Date(now)
        )
        await ctx.db.patch('schedules', schedule._id, {
          nextRunAt,
          updatedAt: now,
        })
        schedulesUpdated++
        continue
      }

      // Create a new pending run
      await ctx.db.insert('runs', {
        jobId: schedule.jobId,
        scheduleId: schedule._id,
        status: 'pending',
        triggeredBy: 'schedule',
        input: schedule.params,
        startedAt: now,
      })
      runsCreated++

      // Track the stat (matches runs.create behavior)
      await incrementStat(ctx.db, 'runsTriggered')

      // Calculate next run time (from now, not from the missed time)
      const nextRunAt = calculateNextRunAt(
        schedule.cron,
        schedule.timezone ?? DEFAULT_TIMEZONE,
        new Date(now)
      )

      // Update schedule timing
      await ctx.db.patch('schedules', schedule._id, {
        lastRunAt: now,
        nextRunAt,
        updatedAt: now,
      })
      schedulesUpdated++
    }

    // Log summary for debugging
    if (runsCreated > 0 || schedulesUpdated > 0) {
      console.log(
        `Schedule scan complete: ${runsCreated} runs created, ${schedulesUpdated} schedules updated`
      )
    }

    return {
      runsCreated,
      schedulesUpdated,
      scannedAt: now,
    }
  },
})

/**
 * Mark Copilot usage snapshots as due for collection.
 *
 * Called daily by the cron in crons.ts.  Creates a pending snapshot run
 * for each tracked GitHub account, skipping accounts that already have
 * a pending or running run for the current day to avoid duplicates.
 */
export const markSnapshotsDue = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()

    const accounts = await ctx.db.query('githubAccounts').collect()
    if (accounts.length === 0) {
      return { marked: 0 }
    }

    // Find snapshot job by name — create on first run if missing
    let snapshotJob = await ctx.db
      .query('jobs')
      .withIndex('by_name', q => q.eq('name', 'copilot-usage-snapshot'))
      .first()

    if (!snapshotJob) {
      const jobId = await ctx.db.insert('jobs', {
        name: 'copilot-usage-snapshot',
        description: 'Collect immutable Copilot usage/spend snapshots',
        workerType: 'exec',
        config: { command: '__copilot_snapshot__', timeout: 60000 },
        createdAt: now,
        updatedAt: now,
      })
      snapshotJob = await ctx.db.get(jobId)
    }

    if (!snapshotJob) {
      return { marked: 0 }
    }

    // Check for existing pending/running snapshot runs created today
    const recentRuns = await ctx.db
      .query('runs')
      .withIndex('by_job', q => q.eq('jobId', snapshotJob!._id))
      .order('desc')
      .take(50)

    const todayPending = recentRuns.filter(
      r => r.startedAt >= todayMs && isPendingOrRunning(r.status)
    )

    if (todayPending.length > 0) {
      return { marked: 0, reason: 'already pending today' }
    }

    // Create one pending run (input carries the account list for the IPC layer)
    await ctx.db.insert('runs', {
      jobId: snapshotJob._id,
      status: 'pending',
      triggeredBy: 'schedule',
      input: { accounts: accounts.map(a => ({ username: a.username, org: a.org })) },
      startedAt: now,
    })

    await incrementStat(ctx.db, 'runsTriggered')

    return { marked: 1 }
  },
})
