import aggregateComponent from '@convex-dev/aggregate/test'
import migrationsComponent from '@convex-dev/migrations/test'
import { convexTest as createConvexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

function convexTest(schemaDefinition: typeof schema, moduleFiles: typeof modules) {
  const t = createConvexTest(schemaDefinition, moduleFiles)
  aggregateComponent.register(t, 'runCounts')
  migrationsComponent.register(t)
  return t
}

const baseJob = {
  name: 'backfill-count-job',
  workerType: 'exec' as const,
  config: { command: 'run' },
}

describe('runs countsByJob backfill scoping', () => {
  test('succeeds for migrated jobs while other jobs are still backfilling', async () => {
    const t = convexTest(schema, modules)
    const migratedJobId = await t.mutation(api.jobs.create, {
      ...baseJob,
      name: 'migrated-count-job',
    })
    const backfillingJobId = await t.mutation(api.jobs.create, {
      ...baseJob,
      name: 'backfilling-count-job',
    })

    const trackedRunId = await t.mutation(api.runs.create, {
      jobId: migratedJobId,
      triggeredBy: 'manual',
    })
    await t.mutation(api.runs.complete, { id: trackedRunId })

    await t.run(async ctx => {
      await ctx.db.insert('runs', {
        jobId: backfillingJobId,
        status: 'completed',
        triggeredBy: 'manual',
        startedAt: 1,
      })
    })

    const counts = await t.query(api.runs.countsByJob, { jobIds: [migratedJobId] })
    expect(counts[migratedJobId]).toEqual({ total: 1, completed: 1, failed: 0 })

    await expect(t.query(api.runs.countsByJob, { jobIds: [backfillingJobId] })).rejects.toThrow(
      /still being backfilled/
    )

    await expect(
      t.query(api.runs.countsByJob, { jobIds: [migratedJobId, backfillingJobId] })
    ).rejects.toThrow(/still being backfilled/)
  })
})
