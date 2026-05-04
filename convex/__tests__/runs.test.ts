import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

const baseJob = {
  name: 'run-job',
  workerType: 'exec' as const,
  config: { command: 'run' },
}

describe('runs', () => {
  test('create inserts a pending run and returns its ID', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)

    const id = await t.mutation(api.runs.create, {
      jobId,
      triggeredBy: 'manual',
    })

    expect(id).toBeTruthy()

    const recent = await t.query(api.runs.listRecent, {})
    expect(recent).toHaveLength(1)
    expect(recent[0].status).toBe('pending')
    expect(recent[0].triggeredBy).toBe('manual')
  })

  test('create increments runsTriggered stat', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.runsTriggered).toBe(1)
  })

  test('create throws when job does not exist', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    await t.mutation(api.jobs.remove, { id: jobId })

    await expect(t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })).rejects.toThrow()
  })

  test('markRunning changes status to running', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    await t.mutation(api.runs.markRunning, { id })

    const run = await t.query(api.runs.get, { id })
    expect(run?.status).toBe('running')
  })

  test('complete marks run as completed with output', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    await t.mutation(api.runs.complete, { id, output: { result: 'ok' } })

    const run = await t.query(api.runs.get, { id })
    expect(run?.status).toBe('completed')
    expect(run?.output).toEqual({ result: 'ok' })
    expect(run?.completedAt).toBeGreaterThan(0)
    expect(run?.duration).toBeGreaterThanOrEqual(0)
  })

  test('complete increments runsCompleted stat', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.complete, { id })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.runsCompleted).toBe(1)
  })

  test('fail marks run as failed with error message', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    await t.mutation(api.runs.fail, { id, error: 'something went wrong' })

    const run = await t.query(api.runs.get, { id })
    expect(run?.status).toBe('failed')
    expect(run?.error).toBe('something went wrong')
    expect(run?.completedAt).toBeGreaterThan(0)
  })

  test('fail increments runsFailed stat', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.fail, { id, error: 'err' })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.runsFailed).toBe(1)
  })

  test('complete updates schedule lastRunStatus when run has a scheduleId', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const schedId = await t.mutation(api.schedules.create, {
      jobId,
      name: 'my-sched',
      cron: '* * * * *',
      enabled: false,
      missedPolicy: 'skip',
    })
    const runId = await t.mutation(api.runs.create, {
      jobId,
      scheduleId: schedId,
      triggeredBy: 'schedule',
    })
    await t.mutation(api.runs.complete, { id: runId })

    const sched = await t.query(api.schedules.get, { id: schedId })
    expect(sched?.lastRunStatus).toBe('completed')
  })

  test('cancel stops a pending run', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    await t.mutation(api.runs.cancel, { id })

    const run = await t.query(api.runs.get, { id })
    expect(run?.status).toBe('cancelled')
  })

  test('cancel throws when run is already completed', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.complete, { id })

    await expect(t.mutation(api.runs.cancel, { id })).rejects.toThrow(
      'Cannot cancel run with status: completed'
    )
  })

  test('listByJob returns runs for a specific job', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const jobId2 = await t.mutation(api.jobs.create, {
      name: 'other',
      workerType: 'exec',
      config: {},
    })
    await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.create, { jobId: jobId2, triggeredBy: 'manual' })

    const runs = await t.query(api.runs.listByJob, { jobId })
    expect(runs).toHaveLength(1)
  })

  test('listByStatus returns runs with matching status', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id1 = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    const id2 = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.complete, { id: id1 })

    const pending = await t.query(api.runs.listByStatus, { status: 'pending' })
    expect(pending).toHaveLength(1)
    expect(pending[0]._id).toBe(id2)

    const completed = await t.query(api.runs.listByStatus, { status: 'completed' })
    expect(completed).toHaveLength(1)
    expect(completed[0]._id).toBe(id1)
  })

  test('claimPending returns null when no pending runs', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.runs.claimPending)
    expect(result).toBeNull()
  })

  test('claimPending returns oldest pending run and marks as running', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id1 = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    const result = await t.mutation(api.runs.claimPending)
    expect(result).not.toBeNull()
    expect(result?.run._id).toBe(id1)
    expect(result?.run.status).toBe('running')
    expect(result?.job.name).toBe('run-job')

    const run = await t.query(api.runs.get, { id: id1 })
    expect(run?.status).toBe('running')
  })

  test('claimPending fails run when associated job is deleted', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const runId = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    // Delete only the job (not via jobs.remove to avoid cascade) to leave the run orphaned
    await t.run(async ctx => {
      await ctx.db.delete(jobId)
    })

    // claimPending should find the pending run, mark it as running, detect the job
    // is missing, then mark the run as failed
    const result = await t.mutation(api.runs.claimPending)
    expect(result).toBeNull()

    // The run should have been failed
    const run = await t.query(api.runs.get, { id: runId })
    expect(run?.status).toBe('failed')
    expect(run?.error).toContain('not found')
  })

  test('cleanup removes old completed runs', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.complete, { id })

    // Use negative days to make cutoff in the future, ensuring all runs are included
    const result = await t.mutation(api.runs.cleanup, { olderThanDays: -1 })
    expect(result.deleted).toBeGreaterThanOrEqual(1)
  })

  test('cleanup does not delete pending or running runs', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    // Use negative days to make cutoff in the future
    const result = await t.mutation(api.runs.cleanup, { olderThanDays: -1 })
    expect(result.deleted).toBe(0)

    const recent = await t.query(api.runs.listRecent, {})
    expect(recent).toHaveLength(1)
  })

  test('countsByJob aggregates run counts per job', async () => {
    const t = convexTest(schema, modules)
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id1 = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    const id2 = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.complete, { id: id1 })
    await t.mutation(api.runs.fail, { id: id2, error: 'err' })

    const counts = await t.query(api.runs.countsByJob)
    expect(counts[jobId]?.total).toBe(2)
    expect(counts[jobId]?.completed).toBe(1)
    expect(counts[jobId]?.failed).toBe(1)
  })
})
