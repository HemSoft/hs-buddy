import aggregateComponent from '@convex-dev/aggregate/test'
import migrationsComponent from '@convex-dev/migrations/test'
import { convexTest as createConvexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api } from '../_generated/api'
import schema from '../schema'

const modules = import.meta.glob('../**/*.*s')

function convexTest() {
  const t = createConvexTest(schema, modules)
  aggregateComponent.register(t, 'runCounts')
  migrationsComponent.register(t)
  return t
}

const baseJob = {
  name: 'run-job',
  workerType: 'exec' as const,
  config: { command: 'run' },
}

describe('runs.markRunning', () => {
  test('changes pending to running and is idempotent for running', async () => {
    const t = convexTest()
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })

    await t.mutation(api.runs.markRunning, { id })
    await t.mutation(api.runs.markRunning, { id })

    expect((await t.query(api.runs.get, { id }))?.status).toBe('running')
  })

  test('throws when the run does not exist', async () => {
    const t = convexTest()
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.run(async ctx => ctx.db.delete(id))

    await expect(t.mutation(api.runs.markRunning, { id })).rejects.toThrow(/not found/)
  })

  test('cannot resurrect a failed run or double-count finalization', async () => {
    const t = convexTest()
    const jobId = await t.mutation(api.jobs.create, baseJob)
    const id = await t.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })
    await t.mutation(api.runs.fail, { id, error: 'reaped as stuck' })

    await t.mutation(api.runs.markRunning, { id })
    await t.mutation(api.runs.complete, { id, output: { result: 'late' } })

    expect(await t.query(api.runs.get, { id })).toMatchObject({
      status: 'failed',
      error: 'reaped as stuck',
    })
    const stats = await t.query(api.buddyStats.get)
    expect(stats.runsFailed).toBe(1)
    expect(stats.runsCompleted).toBe(0)
    expect((await t.query(api.runs.countsByJob, { jobIds: [jobId] }))[jobId]).toEqual({
      total: 1,
      completed: 0,
      failed: 1,
    })
  })
})
