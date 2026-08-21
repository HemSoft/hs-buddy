import { v } from 'convex/values'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { MS_PER_DAY } from './lib/constants'
import { isPendingOrRunning, notFoundError, runStatusValidator } from './lib/domain'
import { projectJob } from './lib/projections'
import { incrementStat } from './lib/stats'
import { deleteRun, getRunCountsByJob, insertRun, patchRun } from './lib/runStore'
import { requireAuthorizedIdentity } from './lib/authorization'

// List recent runs (last N runs)
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const limit = args.limit ?? 50

    const runs = await ctx.db.query('runs').withIndex('by_started').order('desc').take(limit)

    // Fetch job info for each run
    const runsWithJobs = await Promise.all(
      runs.map(async run => {
        const job = await ctx.db.get('jobs', run.jobId)
        const schedule = run.scheduleId ? await ctx.db.get('schedules', run.scheduleId) : null

        return {
          ...run,
          job: projectJob(job),
          schedule: schedule
            ? {
                _id: schedule._id,
                name: schedule.name,
              }
            : null,
        }
      })
    )

    return runsWithJobs
  },
})

// List runs for a specific job
export const listByJob = query({
  args: {
    jobId: v.id('jobs'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const limit = args.limit ?? 20

    return await ctx.db
      .query('runs')
      .withIndex('by_job', q => q.eq('jobId', args.jobId))
      .order('desc')
      .take(limit)
  },
})

// List runs for a specific schedule
export const listBySchedule = query({
  args: {
    scheduleId: v.id('schedules'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const limit = args.limit ?? 20

    return await ctx.db
      .query('runs')
      .withIndex('by_schedule', q => q.eq('scheduleId', args.scheduleId))
      .order('desc')
      .take(limit)
  },
})

// Get single run by ID
export const get = query({
  args: { id: v.id('runs') },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const run = await ctx.db.get('runs', args.id)
    if (!run) return null

    const job = await ctx.db.get('jobs', run.jobId)
    const schedule = run.scheduleId ? await ctx.db.get('schedules', run.scheduleId) : null

    return {
      ...run,
      job,
      schedule,
    }
  },
})

// Create new run (when starting execution)
export const create = mutation({
  args: {
    jobId: v.id('jobs'),
    scheduleId: v.optional(v.id('schedules')),
    triggeredBy: v.union(v.literal('manual'), v.literal('schedule'), v.literal('api')),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    // Verify job exists
    const job = await ctx.db.get('jobs', args.jobId)
    if (!job) {
      throw notFoundError('Job', args.jobId)
    }

    if (args.scheduleId) {
      const schedule = await ctx.db.get('schedules', args.scheduleId)
      if (!schedule) {
        throw notFoundError('Schedule', args.scheduleId)
      }
      if (schedule.jobId !== args.jobId) {
        throw new Error(`Schedule ${args.scheduleId} does not belong to job ${args.jobId}`)
      }
    }

    const id = await insertRun(ctx, {
      jobId: args.jobId,
      scheduleId: args.scheduleId,
      status: 'pending',
      triggeredBy: args.triggeredBy,
      input: args.input,
      startedAt: Date.now(),
    })

    // Track the stat
    await incrementStat(ctx.db, 'runsTriggered')

    return id
  },
})

// Update run status to running
export const markRunning = mutation({
  args: { id: v.id('runs') },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const run = await ctx.db.get('runs', args.id)
    if (!run) {
      throw notFoundError('Run', args.id)
    }

    // Only the pending -> running transition is valid. Returning for running
    // keeps dispatcher retries idempotent, while returning for terminal states
    // prevents delayed work from resurrecting an already finalized run.
    if (run.status !== 'pending') {
      return
    }

    await patchRun(ctx, args.id, {
      status: 'running',
    })
  },
})

async function finalizeRun(
  ctx: MutationCtx,
  runId: Id<'runs'>,
  status: 'completed' | 'failed',
  statKey: 'runsCompleted' | 'runsFailed',
  extraPatch: Record<string, unknown>
) {
  const run = await ctx.db.get(runId)
  if (!run) {
    throw notFoundError('Run', runId)
  }
  // A run already in a terminal state was finalized elsewhere first (e.g.
  // the stuck-run reaper in `scheduleScanner.ts` failed it after the
  // Electron app went unresponsive). Silently no-op instead of overwriting
  // that result and double-incrementing stats for the same run.
  if (!isPendingOrRunning(run.status)) {
    return
  }
  const completedAt = Date.now()
  await patchRun(ctx, runId, {
    status,
    ...extraPatch,
    completedAt,
    duration: completedAt - run.startedAt,
  })
  await incrementStat(ctx.db, statKey)
  if (run.scheduleId) {
    const schedule = await ctx.db.get('schedules', run.scheduleId)
    if (schedule) {
      await ctx.db.patch('schedules', schedule._id, {
        lastRunAt: completedAt,
        lastRunStatus: status,
      })
    }
  }
}

// Complete a run successfully
export const complete = mutation({
  args: {
    id: v.id('runs'),
    output: v.optional(v.any()),
    outputFileId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    await finalizeRun(ctx, args.id, 'completed', 'runsCompleted', {
      output: args.output,
      outputFileId: args.outputFileId,
    })
  },
})

// Fail a run
export const fail = mutation({
  args: {
    id: v.id('runs'),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    await finalizeRun(ctx, args.id, 'failed', 'runsFailed', {
      error: args.error,
    })
  },
})

// Cancel a run
export const cancel = mutation({
  args: { id: v.id('runs') },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const run = await ctx.db.get('runs', args.id)
    if (!run) {
      throw notFoundError('Run', args.id)
    }

    if (!isPendingOrRunning(run.status)) {
      throw new Error(`Cannot cancel run with status: ${run.status}`)
    }

    const completedAt = Date.now()
    await patchRun(ctx, args.id, {
      status: 'cancelled',
      completedAt,
      duration: completedAt - run.startedAt,
    })
  },
})

// Get runs by status (for monitoring pending/running)
export const listByStatus = query({
  args: {
    status: runStatusValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const limit = args.limit ?? 50

    return await ctx.db
      .query('runs')
      .withIndex('by_status', q => q.eq('status', args.status))
      .order('desc')
      .take(limit)
  },
})

// Claim the oldest pending run atomically (returns run + job, or null if none pending)
export const claimPending = mutation({
  args: {},
  handler: async ctx => {
    await requireAuthorizedIdentity(ctx)
    // Get oldest pending run
    const pendingRun = await ctx.db
      .query('runs')
      .withIndex('by_status', q => q.eq('status', 'pending'))
      .order('asc')
      .first()

    if (!pendingRun) {
      return null
    }

    // Mark as running atomically
    await patchRun(ctx, pendingRun._id, {
      status: 'running',
    })

    // Fetch the associated job
    const job = await ctx.db.get('jobs', pendingRun.jobId)
    if (!job) {
      // Job was deleted — fail the run
      const completedAt = Date.now()
      await patchRun(ctx, pendingRun._id, {
        status: 'failed',
        error: `Job ${pendingRun.jobId} not found`,
        completedAt,
        duration: completedAt - pendingRun.startedAt,
      })
      return null
    }

    return {
      run: { ...pendingRun, status: 'running' as const },
      job,
    }
  },
})

// Cleanup old runs (keep last N days)
export const cleanup = mutation({
  args: {
    olderThanDays: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const cutoff = Date.now() - args.olderThanDays * MS_PER_DAY

    // Fetch old runs using take() to avoid unbounded .collect()
    // Filter in TypeScript code per Convex best practices (no .filter())
    const oldRuns = await ctx.db.query('runs').withIndex('by_started').order('asc').take(500)

    let deleted = 0
    for (const run of oldRuns) {
      // Only delete runs older than cutoff and not active
      if (run.startedAt >= cutoff) break
      if (!isPendingOrRunning(run.status)) {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Cleanup walks sorted rows and stops at the cutoff boundary.
        await deleteRun(ctx, run)
        deleted++
      }
    }

    return { deleted }
  },
})

// Count runs per job (for job list badges)
const MAX_JOBS_PER_COUNT_QUERY = 100

export const countsByJob = query({
  args: { jobIds: v.array(v.id('jobs')) },
  handler: async (ctx, args) => {
    await requireAuthorizedIdentity(ctx)
    const jobIds = [...new Set(args.jobIds)]
    if (jobIds.length > MAX_JOBS_PER_COUNT_QUERY) {
      throw new Error(`Run counts can be requested for at most ${MAX_JOBS_PER_COUNT_QUERY} jobs`)
    }
    return getRunCountsByJob(ctx, jobIds)
  },
})
