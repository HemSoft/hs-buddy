import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api, internal } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

const baseJob = {
  name: 'scan-job',
  workerType: 'exec' as const,
  config: { command: 'run' },
}

describe('scheduleScanner.scanAndDispatch', () => {
  test('returns zeros when no enabled schedules exist', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.scheduleScanner.scanAndDispatch)
    expect(result.runsCreated).toBe(0)
    expect(result.schedulesUpdated).toBe(0)
    expect(result.scannedAt).toBeGreaterThan(0)
  })

  test('skips schedules that are not yet due', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)

    // Create a schedule with nextRunAt far in the future
    const schedId = await t.mutation(api.schedules.create, {
      jobId,
      name: 'future-sched',
      cron: '0 9 * * *',
      enabled: true,
      missedPolicy: 'skip',
    })

    // Manually push nextRunAt to the future to ensure it won't fire
    const futureMs = Date.now() + 10 * 60 * 60 * 1000 // 10 hours
    await t.mutation(api.schedules.advanceNextRun, { id: schedId, nextRunAt: futureMs })

    const result = await t.mutation(internal.scheduleScanner.scanAndDispatch)
    expect(result.runsCreated).toBe(0)
  })

  test('creates run for a due schedule and advances nextRunAt', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)

    // Create a schedule that is due (nextRunAt in the past)
    const schedId = await t.mutation(api.schedules.create, {
      jobId,
      name: 'due-sched',
      cron: '* * * * *',
      enabled: true,
      missedPolicy: 'skip',
    })

    // Push nextRunAt to the past
    const pastMs = Date.now() - 60000
    await t.mutation(api.schedules.advanceNextRun, { id: schedId, nextRunAt: pastMs })

    const result = await t.mutation(internal.scheduleScanner.scanAndDispatch)
    expect(result.runsCreated).toBe(1)
    expect(result.schedulesUpdated).toBe(1)

    // Verify a run was created
    const runs = await t.query(api.runs.listByStatus, { status: 'pending' })
    expect(runs).toHaveLength(1)
    expect(runs[0].triggeredBy).toBe('schedule')
  })

  test('skips a due schedule that already has a pending/running run', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)

    const schedId = await t.mutation(api.schedules.create, {
      jobId,
      name: 'busy-sched',
      cron: '* * * * *',
      enabled: true,
      missedPolicy: 'skip',
    })

    // Push nextRunAt to the past
    const pastMs = Date.now() - 60000
    await t.mutation(api.schedules.advanceNextRun, { id: schedId, nextRunAt: pastMs })

    // Create a pending run for this schedule
    await t.mutation(api.runs.create, { jobId, scheduleId: schedId, triggeredBy: 'schedule' })

    const result = await t.mutation(internal.scheduleScanner.scanAndDispatch)
    expect(result.runsCreated).toBe(0)
    expect(result.schedulesUpdated).toBe(1) // schedule still updated with new nextRunAt
  })

  test('disables schedule and skips run creation when job is deleted', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)

    const schedId = await t.mutation(api.schedules.create, {
      jobId,
      name: 'orphan-sched',
      cron: '* * * * *',
      enabled: true,
      missedPolicy: 'skip',
    })

    // Push nextRunAt to the past so the schedule is due
    const pastMs = Date.now() - 60000
    await t.mutation(api.schedules.advanceNextRun, { id: schedId, nextRunAt: pastMs })

    // Delete only the job (not the schedule) to simulate an orphaned schedule.
    // We bypass jobs.remove (which cascade-deletes schedules) by using t.run
    // for direct DB access.
    await t.run(async ctx => {
      await ctx.db.delete(jobId)
    })

    // Schedule still exists, but its job is gone
    const schedules = await t.query(api.schedules.list)
    expect(schedules).toHaveLength(1)

    // Scanner should disable the orphaned schedule and not create a run
    const result = await t.mutation(internal.scheduleScanner.scanAndDispatch)
    expect(result.runsCreated).toBe(0)
    expect(result.schedulesUpdated).toBe(1)

    // Verify the schedule was disabled
    const updated = await t.query(api.schedules.get, { id: schedId })
    expect(updated?.enabled).toBe(false)
  })

  test('increments runsTriggered stat for each run created', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)

    const schedId = await t.mutation(api.schedules.create, {
      jobId,
      name: 'stat-sched',
      cron: '* * * * *',
      enabled: true,
      missedPolicy: 'skip',
    })

    const pastMs = Date.now() - 60000
    await t.mutation(api.schedules.advanceNextRun, { id: schedId, nextRunAt: pastMs })

    await t.mutation(internal.scheduleScanner.scanAndDispatch)

    const stats = await t.query(api.buddyStats.get)
    expect(stats.runsTriggered).toBeGreaterThanOrEqual(1)
  })
})

describe('scheduleScanner.markSnapshotsDue', () => {
  test('returns zero when no github accounts exist', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(internal.scheduleScanner.markSnapshotsDue)
    expect(result.marked).toBe(0)
  })

  test('creates a pending snapshot run when accounts exist', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'user1', org: 'org' })

    const result = await t.mutation(internal.scheduleScanner.markSnapshotsDue)
    expect(result.marked).toBe(1)

    const runs = await t.query(api.runs.listByStatus, { status: 'pending' })
    expect(runs).toHaveLength(1)
    expect(runs[0].triggeredBy).toBe('schedule')
  })

  test('is idempotent — skips if a pending snapshot run exists for today', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'user1', org: 'org' })

    await t.mutation(internal.scheduleScanner.markSnapshotsDue)
    const second = await t.mutation(internal.scheduleScanner.markSnapshotsDue)

    expect(second.marked).toBe(0)
    expect(second).toHaveProperty('reason')

    const runs = await t.query(api.runs.listByStatus, { status: 'pending' })
    expect(runs).toHaveLength(1)
  })

  test('auto-creates snapshot job if it does not exist', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'user1', org: 'org' })

    await t.mutation(internal.scheduleScanner.markSnapshotsDue)

    const job = await t.query(api.jobs.getByName, { name: 'copilot-usage-snapshot' })
    expect(job).not.toBeNull()
    expect(job?.workerType).toBe('exec')
  })
})
