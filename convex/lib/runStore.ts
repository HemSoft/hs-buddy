import { TableAggregate } from '@convex-dev/aggregate'
import { components } from '../_generated/api'
import type { DataModel, Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type RunStatus = Doc<'runs'>['status']
type RunCountSummary = { total: number; completed: number; failed: number }
type RunInsert = Omit<Doc<'runs'>, '_creationTime' | '_id' | 'runCountVersion'>
type RunPatch = Partial<RunInsert>
export type RunWriteCtx = MutationCtx

const runCounts = new TableAggregate<{
  Namespace: Id<'jobs'>
  Key: RunStatus
  DataModel: DataModel
  TableName: 'runs'
}>(components.runCounts, {
  namespace: run => run.jobId,
  sortKey: run => run.status,
})

export async function insertRun(ctx: RunWriteCtx, value: RunInsert): Promise<Id<'runs'>> {
  const id = await ctx.db.insert('runs', { ...value, runCountVersion: 1 })
  const run = (await ctx.db.get('runs', id))!
  await runCounts.insert(ctx, run)
  return id
}

export async function patchRun(
  ctx: RunWriteCtx,
  id: Id<'runs'>,
  patch: RunPatch
): Promise<Doc<'runs'>> {
  const previous = await ctx.db.get('runs', id)
  if (!previous) throw new Error(`Run ${id} not found`)

  await ctx.db.patch('runs', id, { ...patch, runCountVersion: 1 })
  const updated = (await ctx.db.get('runs', id))!
  await runCounts.replaceOrInsert(ctx, previous, updated)
  return updated
}

export async function deleteRun(ctx: RunWriteCtx, run: Doc<'runs'>): Promise<void> {
  await ctx.db.delete('runs', run._id)
  await runCounts.deleteIfExists(ctx, run)
}

export async function backfillRunCount(ctx: RunWriteCtx, run: Doc<'runs'>): Promise<void> {
  await runCounts.insertIfDoesNotExist(ctx, run)
  await ctx.db.patch('runs', run._id, { runCountVersion: 1 })
}

export async function getRunCountsByJob(
  ctx: QueryCtx,
  jobIds: Id<'jobs'>[]
): Promise<Record<string, RunCountSummary>> {
  // Readiness is scoped to the requested jobs. A job whose runs are all
  // migrated gets exact aggregate counts even while other jobs' historical
  // runs are still backfilling. A requested job with any unmigrated run gets
  // an explicit unready signal (the throw below) rather than partially
  // counted aggregates, because the aggregate component only contains
  // migrated runs.
  for (const jobId of jobIds) {
    const unbackfilledRun = await ctx.db
      .query('runs')
      .withIndex('by_job_count_version', query =>
        query.eq('jobId', jobId).eq('runCountVersion', undefined)
      )
      .first()
    if (unbackfilledRun) {
      throw new Error(
        `Run counts are still being backfilled for job ${jobId}; retry after the migration completes`
      )
    }
  }

  const exactStatusBounds = (status: RunStatus) => ({
    lower: { key: status, inclusive: true as const },
    upper: { key: status, inclusive: true as const },
  })
  // One shared spec drives both the query layout and result mapping, so the
  // flat countBatch array can never silently swap total/completed/failed.
  const COUNT_SPECS: readonly {
    key: keyof RunCountSummary
    status?: RunStatus
  }[] = [
    { key: 'total' },
    { key: 'completed', status: 'completed' },
    { key: 'failed', status: 'failed' },
  ]

  const queries = jobIds.flatMap(jobId =>
    COUNT_SPECS.map(spec => ({
      namespace: jobId,
      ...(spec.status ? { bounds: exactStatusBounds(spec.status) } : {}),
    }))
  )
  const values = queries.length > 0 ? await runCounts.countBatch(ctx, queries) : []

  return Object.fromEntries(
    jobIds.map((jobId, jobIndex) => {
      const summary: RunCountSummary = { total: 0, completed: 0, failed: 0 }
      for (const [specIndex, spec] of COUNT_SPECS.entries()) {
        summary[spec.key] = values[jobIndex * COUNT_SPECS.length + specIndex]
      }
      return [jobId, summary]
    })
  )
}
