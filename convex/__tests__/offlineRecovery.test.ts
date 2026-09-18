import aggregateComponent from '@convex-dev/aggregate/test'
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import schema from '../schema'
import { api, internal } from '../_generated/api'
import { recoverMissedSchedule } from '../lib/offlineRecovery'

const modules = import.meta.glob('../**/*.*s')
const NOW = Date.parse('2026-09-18T12:00:30Z')

async function fixture(missedPolicy: 'skip' | 'last' | 'catchup' = 'last') {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const t = convexTest(schema, modules)
  aggregateComponent.register(t, 'runCounts')
  const jobId = await t.run(ctx =>
    ctx.db.insert('jobs', {
      name: 'recovery fixture',
      workerType: 'exec',
      config: { command: 'never executed by this test' },
      createdAt: NOW,
      updatedAt: NOW,
    })
  )
  const id = await t.mutation(api.schedules.create, {
    jobId,
    name: 'missed fixture',
    cron: '* * * * *',
    timezone: 'UTC',
    enabled: true,
    missedPolicy,
    params: { fixture: true },
  })
  await t.run(ctx => ctx.db.patch(id, { nextRunAt: NOW - 90_000 }))
  return { t, id, jobId }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test.each([
  ['skip', 0, 'skipped'],
  ['last', 1, 'last (1 run)'],
  ['catchup', 2, 'catchup (2 runs)'],
] as const)('preserves %s policy, counts and schedule state', async (policy, count, action) => {
  const { t, id, jobId } = await fixture(policy)
  expect(await t.mutation(api.schedules.recoverMissed, { id })).toEqual({
    runsCreated: count,
    action,
  })
  const runs = await t.query(api.runs.listBySchedule, { scheduleId: id })
  expect(runs).toHaveLength(count)
  for (const run of runs) {
    expect(run).toMatchObject({
      jobId,
      scheduleId: id,
      triggeredBy: 'schedule',
      status: 'pending',
      input: { fixture: true },
      runCountVersion: 1,
    })
  }
  expect(await t.query(api.runs.countsByJob, { jobIds: [jobId] })).toEqual({
    [jobId]: { total: count, completed: 0, failed: 0 },
  })
  expect((await t.query(api.buddyStats.get)).runsTriggered).toBe(count)
  const schedule = await t.query(api.schedules.get, { id })
  expect(schedule?.nextRunAt).toBe(NOW + 30_000)
  expect(schedule?.lastRunAt).toBe(count ? NOW : undefined)
})

test('a retry after a lost committed response cannot recreate the work', async () => {
  const { t, id } = await fixture()
  await t.mutation(api.schedules.recoverMissed, { id }) // response lost to caller
  expect(await t.mutation(api.schedules.recoverMissed, { id })).toEqual({
    runsCreated: 0,
    action: 'not-missed',
  })
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toHaveLength(1)
  expect((await t.query(api.buddyStats.get)).runsTriggered).toBe(1)
})

test('concurrent callers recover only once', async () => {
  const { t, id } = await fixture('catchup')
  const results = await Promise.all([
    t.mutation(api.schedules.recoverMissed, { id }),
    t.mutation(api.schedules.recoverMissed, { id }),
  ])
  expect(results.map(result => result.runsCreated).sort()).toEqual([0, 2])
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toHaveLength(2)
})

test.each(['scanner-first', 'recovery-first'] as const)(
  'serializes the shared cursor with the scanner: %s',
  async order => {
    const { t, id } = await fixture()
    if (order === 'scanner-first') {
      await t.mutation(internal.scheduleScanner.scanAndDispatch)
      await t.mutation(api.schedules.recoverMissed, { id })
    } else {
      await t.mutation(api.schedules.recoverMissed, { id })
      await t.mutation(internal.scheduleScanner.scanAndDispatch)
    }
    expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toHaveLength(1)
  }
)

test('concurrent scanner and recovery create only one last-policy run', async () => {
  const { t, id } = await fixture()
  await Promise.all([
    t.mutation(api.schedules.recoverMissed, { id }),
    t.mutation(internal.scheduleScanner.scanAndDispatch),
  ])
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toHaveLength(1)
})

test('failed schedule advancement rolls back runs, aggregates and statistics', async () => {
  const { t, id, jobId } = await fixture('catchup')
  await expect(
    t.mutation(async ctx => {
      // The fixture has no stats row, so the first outer-context patch is
      // the final schedule advance, after both run inserts and stats insert.
      vi.spyOn(ctx.db, 'patch').mockRejectedValueOnce(new Error('advance failed'))
      return recoverMissedSchedule(ctx, id)
    })
  ).rejects.toThrow('advance failed')
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toEqual([])
  expect(await t.query(api.runs.countsByJob, { jobIds: [jobId] })).toEqual({
    [jobId]: { total: 0, completed: 0, failed: 0 },
  })
  expect((await t.query(api.buddyStats.get)).runsTriggered).toBe(0)
  expect((await t.query(api.schedules.get, { id }))?.nextRunAt).toBe(NOW - 90_000)
  expect((await t.mutation(api.schedules.recoverMissed, { id })).runsCreated).toBe(2)
})

test('an exception after all writes still rolls back the cursor and work together', async () => {
  const { t, id } = await fixture()
  await expect(
    t.mutation(async ctx => {
      await recoverMissedSchedule(ctx, id)
      throw new Error('transaction aborted')
    })
  ).rejects.toThrow('transaction aborted')
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toEqual([])
  expect((await t.query(api.schedules.get, { id }))?.nextRunAt).toBe(NOW - 90_000)
})

test('fails before creating work if the job disappeared', async () => {
  const { t, id, jobId } = await fixture()
  await t.run(ctx => ctx.db.delete(jobId))
  await expect(t.mutation(api.schedules.recoverMissed, { id })).rejects.toThrow('Job')
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toEqual([])
  expect((await t.query(api.schedules.get, { id }))?.nextRunAt).toBe(NOW - 90_000)
})

test('rejects a deleted schedule', async () => {
  const { t, id } = await fixture()
  await t.mutation(api.schedules.remove, { id })
  await expect(t.mutation(api.schedules.recoverMissed, { id })).rejects.toThrow('Schedule')
})

test('ignores a schedule disabled since the client snapshot', async () => {
  const { t, id } = await fixture()
  await t.run(ctx => ctx.db.patch(id, { enabled: false }))
  expect((await t.mutation(api.schedules.recoverMissed, { id })).action).toBe('not-missed')
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toEqual([])
})

test.each(['last', 'catchup'] as const)('handles %s without historical cursor', async policy => {
  const { t, id } = await fixture(policy)
  await t.run(ctx => ctx.db.patch(id, { nextRunAt: undefined, timezone: undefined }))
  expect((await t.mutation(api.schedules.recoverMissed, { id })).runsCreated).toBe(0)
  expect((await t.query(api.schedules.get, { id }))?.nextRunAt).toBeGreaterThan(NOW)
})

test('uses lastRunAt when nextRunAt is absent', async () => {
  const { t, id } = await fixture()
  await t.run(ctx => ctx.db.patch(id, { nextRunAt: undefined, lastRunAt: NOW - 90_000 }))
  expect((await t.mutation(api.schedules.recoverMissed, { id })).runsCreated).toBe(1)
})

test('caps catchup at 100 runs and advances beyond the remaining gap', async () => {
  const { t, id } = await fixture('catchup')
  await t.run(ctx => ctx.db.patch(id, { nextRunAt: NOW - 200 * 60_000 }))
  expect((await t.mutation(api.schedules.recoverMissed, { id })).runsCreated).toBe(100)
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id, limit: 101 })).toHaveLength(100)
  expect((await t.mutation(api.schedules.recoverMissed, { id })).runsCreated).toBe(0)
})

test('invalid cron leaves work and cursor untouched', async () => {
  const { t, id } = await fixture()
  await t.run(ctx => ctx.db.patch(id, { cron: 'invalid' }))
  await expect(t.mutation(api.schedules.recoverMissed, { id })).rejects.toThrow()
  expect(await t.query(api.runs.listBySchedule, { scheduleId: id })).toEqual([])
  expect((await t.query(api.schedules.get, { id }))?.nextRunAt).toBe(NOW - 90_000)
})
