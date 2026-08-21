import aggregateComponent from '@convex-dev/aggregate/test'
import migrationsComponent from '@convex-dev/migrations/test'
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import schema from '../schema'
import {
  restoreAuthorizedIdentityEnv,
  withAuthorizedIdentity,
} from '../../testing/convex-test-auth'

const modules = import.meta.glob('../**/*.*s')

type TestHarness = ReturnType<typeof convexTest>
type TestClient = Pick<TestHarness, 'query' | 'mutation'>
type ProtectedCall = [name: string, invoke: () => Promise<unknown>]

function testHarness() {
  const t = convexTest(schema, modules)
  aggregateComponent.register(t, 'runCounts')
  migrationsComponent.register(t)
  return t
}

async function seedExecutableWork(t: TestHarness) {
  const authorized = withAuthorizedIdentity(t)
  const jobId = await authorized.mutation(api.jobs.create, {
    name: 'authorization-contract-job',
    workerType: 'exec',
    config: { command: 'echo protected' },
  })
  const runId = await authorized.mutation(api.runs.create, {
    jobId,
    triggeredBy: 'manual',
  })
  const scheduleId = await authorized.mutation(api.schedules.create, {
    jobId,
    name: 'authorization-contract-schedule',
    cron: '0 9 * * *',
    enabled: false,
    missedPolicy: 'skip',
  })
  return { jobId, runId, scheduleId }
}

function protectedCalls(
  client: TestClient,
  ids: { jobId: Id<'jobs'>; runId: Id<'runs'>; scheduleId: Id<'schedules'> }
): ProtectedCall[] {
  const { jobId, runId, scheduleId } = ids
  return [
    ['jobs.list', () => client.query(api.jobs.list)],
    ['jobs.listByType', () => client.query(api.jobs.listByType, { workerType: 'exec' })],
    ['jobs.get', () => client.query(api.jobs.get, { id: jobId })],
    [
      'jobs.getByName',
      () => client.query(api.jobs.getByName, { name: 'authorization-contract-job' }),
    ],
    [
      'jobs.create',
      () =>
        client.mutation(api.jobs.create, {
          name: 'blocked-job',
          workerType: 'exec',
          config: { command: 'echo blocked' },
        }),
    ],
    ['jobs.update', () => client.mutation(api.jobs.update, { id: jobId, name: 'blocked' })],
    ['jobs.remove', () => client.mutation(api.jobs.remove, { id: jobId })],
    ['runs.listRecent', () => client.query(api.runs.listRecent, {})],
    ['runs.listByJob', () => client.query(api.runs.listByJob, { jobId })],
    ['runs.listBySchedule', () => client.query(api.runs.listBySchedule, { scheduleId })],
    ['runs.get', () => client.query(api.runs.get, { id: runId })],
    ['runs.create', () => client.mutation(api.runs.create, { jobId, triggeredBy: 'manual' })],
    ['runs.markRunning', () => client.mutation(api.runs.markRunning, { id: runId })],
    ['runs.complete', () => client.mutation(api.runs.complete, { id: runId })],
    ['runs.fail', () => client.mutation(api.runs.fail, { id: runId, error: 'blocked' })],
    ['runs.cancel', () => client.mutation(api.runs.cancel, { id: runId })],
    ['runs.listByStatus', () => client.query(api.runs.listByStatus, { status: 'pending' })],
    ['runs.claimPending', () => client.mutation(api.runs.claimPending)],
    ['runs.cleanup', () => client.mutation(api.runs.cleanup, { olderThanDays: 30 })],
    ['runs.countsByJob', () => client.query(api.runs.countsByJob, { jobIds: [jobId] })],
    ['schedules.list', () => client.query(api.schedules.list)],
    ['schedules.listEnabled', () => client.query(api.schedules.listEnabled)],
    ['schedules.get', () => client.query(api.schedules.get, { id: scheduleId })],
    [
      'schedules.create',
      () =>
        client.mutation(api.schedules.create, {
          jobId,
          name: 'blocked-schedule',
          cron: '0 10 * * *',
          enabled: true,
          missedPolicy: 'skip',
        }),
    ],
    [
      'schedules.update',
      () => client.mutation(api.schedules.update, { id: scheduleId, name: 'blocked' }),
    ],
    ['schedules.remove', () => client.mutation(api.schedules.remove, { id: scheduleId })],
    ['schedules.toggle', () => client.mutation(api.schedules.toggle, { id: scheduleId })],
    [
      'schedules.advanceNextRun',
      () =>
        client.mutation(api.schedules.advanceNextRun, {
          id: scheduleId,
          nextRunAt: Date.now() + 60_000,
        }),
    ],
  ]
}

async function expectEveryCallRejected(
  calls: ProtectedCall[],
  expectedMessage: RegExp
): Promise<void> {
  for (const [name, invoke] of calls) {
    try {
      await invoke()
      throw new Error(`${name} unexpectedly allowed access`)
    } catch (error: unknown) {
      expect(String(error), name).toMatch(expectedMessage)
    }
  }
}

describe('executable work authorization contract', () => {
  afterEach(restoreAuthorizedIdentityEnv)

  test('rejects anonymous access to every public job, run, and schedule API', async () => {
    const t = testHarness()
    const ids = await seedExecutableWork(t)

    await expectEveryCallRejected(protectedCalls(t, ids), /Authentication is required/)
  })

  test('rejects unapproved identities from every public job, run, and schedule API', async () => {
    const t = testHarness()
    const ids = await seedExecutableWork(t)
    const unauthorized = t.withIdentity({
      subject: 'unapproved-user',
      issuer: 'https://auth.test.hs-buddy',
    })

    await expectEveryCallRejected(protectedCalls(unauthorized, ids), /not authorized/)
  })

  test('fails fast with a configuration error when the allowlist is unset', async () => {
    const t = testHarness()
    const ids = await seedExecutableWork(t)
    restoreAuthorizedIdentityEnv()

    const anyAuthenticatedCaller = t.withIdentity({
      subject: 'anyone',
      issuer: 'https://auth.test.hs-buddy',
    })

    await expect(anyAuthenticatedCaller.query(api.jobs.get, { id: ids.jobId })).rejects.toThrow(
      /CONVEX_AUTHORIZED_IDENTITIES is not configured/
    )
  })
})
