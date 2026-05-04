import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

const baseRun = {
  runId: 'run-uuid-001',
  repoPath: '/home/user/code/my-repo',
  scriptType: 'ralph' as const,
  status: 'running' as const,
  startedAt: Date.now(),
}

describe('ralphRuns', () => {
  test('list returns empty array when no runs exist', async () => {
    const t = convexTest(schema, modules)
    const runs = await t.query(api.ralphRuns.list)
    expect(runs).toEqual([])
  })

  test('create inserts a new ralph run', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.ralphRuns.create, baseRun)
    expect(id).toBeTruthy()

    const runs = await t.query(api.ralphRuns.list)
    expect(runs).toHaveLength(1)
    expect(runs[0].runId).toBe('run-uuid-001')
    expect(runs[0].status).toBe('running')
  })

  test('create stores optional fields', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.ralphRuns.create, {
      ...baseRun,
      repoSlug: 'acme/repo',
      branch: 'feat/test',
      model: 'claude-sonnet',
      provider: 'anthropic',
      agents: ['agent-a', 'agent-b'],
      iterations: 5,
      costMultiplier: 2.0,
    })

    const run = await t.query(api.ralphRuns.get, { runId: 'run-uuid-001' })
    expect(run?.repoSlug).toBe('acme/repo')
    expect(run?.branch).toBe('feat/test')
    expect(run?.agents).toEqual(['agent-a', 'agent-b'])
    expect(run?.iterations).toBe(5)
  })

  test('get returns run by runId', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.ralphRuns.create, baseRun)

    const run = await t.query(api.ralphRuns.get, { runId: 'run-uuid-001' })
    expect(run?.runId).toBe('run-uuid-001')
  })

  test('get returns null for unknown runId', async () => {
    const t = convexTest(schema, modules)
    const run = await t.query(api.ralphRuns.get, { runId: 'nonexistent' })
    expect(run).toBeNull()
  })

  test('listByRepo returns runs for a specific repo path', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.ralphRuns.create, { ...baseRun, runId: 'run-1', repoPath: '/code/repo-a' })
    await t.mutation(api.ralphRuns.create, { ...baseRun, runId: 'run-2', repoPath: '/code/repo-b' })

    const repoARuns = await t.query(api.ralphRuns.listByRepo, { repoPath: '/code/repo-a' })
    expect(repoARuns).toHaveLength(1)
    expect(repoARuns[0].runId).toBe('run-1')
  })

  test('listByStatus returns runs with matching status', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.ralphRuns.create, {
      ...baseRun,
      runId: 'running-1',
      status: 'running',
    })
    await t.mutation(api.ralphRuns.create, {
      ...baseRun,
      runId: 'completed-1',
      status: 'completed',
    })

    const running = await t.query(api.ralphRuns.listByStatus, { status: 'running' })
    expect(running).toHaveLength(1)
    expect(running[0].runId).toBe('running-1')
  })

  test('updateStatus changes the status and optional fields', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.ralphRuns.create, baseRun)

    const now = Date.now()
    await t.mutation(api.ralphRuns.updateStatus, {
      runId: 'run-uuid-001',
      status: 'completed',
      phase: 'done',
      completedIterations: 3,
      exitCode: 0,
      prUrl: 'https://github.com/org/repo/pull/42',
      completedAt: now,
      duration: 60000,
    })

    const run = await t.query(api.ralphRuns.get, { runId: 'run-uuid-001' })
    expect(run?.status).toBe('completed')
    expect(run?.phase).toBe('done')
    expect(run?.completedIterations).toBe(3)
    expect(run?.exitCode).toBe(0)
    expect(run?.prUrl).toBe('https://github.com/org/repo/pull/42')
  })

  test('updateStatus throws when run does not exist', async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.ralphRuns.updateStatus, {
        runId: 'nonexistent',
        status: 'completed',
      })
    ).rejects.toThrow('Ralph run not found: nonexistent')
  })

  test('updateStatus records error on failure', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.ralphRuns.create, baseRun)

    await t.mutation(api.ralphRuns.updateStatus, {
      runId: 'run-uuid-001',
      status: 'failed',
      error: 'Script exited with code 1',
      exitCode: 1,
    })

    const run = await t.query(api.ralphRuns.get, { runId: 'run-uuid-001' })
    expect(run?.status).toBe('failed')
    expect(run?.error).toBe('Script exited with code 1')
  })
})
