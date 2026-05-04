import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

async function createCopilotResult(t: ReturnType<typeof convexTest>, prompt = 'review') {
  return t.mutation(api.copilotResults.create, { prompt, category: 'pr-review' })
}

const prRunArgs = {
  owner: 'acme',
  repo: 'frontend',
  prNumber: 42,
  prUrl: 'https://github.com/acme/frontend/pull/42',
  prTitle: 'Add feature',
  prompt: 'Review this PR',
}

describe('prReviewRuns', () => {
  test('create inserts a pending PR review run', async () => {
    const t = convexTest(schema, modules)
    const resultId = await createCopilotResult(t)

    const id = await t.mutation(api.prReviewRuns.create, { ...prRunArgs, resultId })
    expect(id).toBeTruthy()

    const runs = await t.query(api.prReviewRuns.listByPr, {
      owner: 'acme',
      repo: 'frontend',
      prNumber: 42,
    })
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('pending')
    expect(runs[0].prTitle).toBe('Add feature')
  })

  test('create stores optional fields (model, ghAccount, headSha, threadStats)', async () => {
    const t = convexTest(schema, modules)
    const resultId = await createCopilotResult(t)

    await t.mutation(api.prReviewRuns.create, {
      ...prRunArgs,
      resultId,
      model: 'claude-sonnet',
      ghAccount: 'jdoe',
      reviewedHeadSha: 'abc123',
      reviewedThreadStats: { total: 5, unresolved: 2, outdated: 1 },
    })

    const runs = await t.query(api.prReviewRuns.listByPr, {
      owner: 'acme',
      repo: 'frontend',
      prNumber: 42,
    })
    expect(runs[0].model).toBe('claude-sonnet')
    expect(runs[0].reviewedHeadSha).toBe('abc123')
    expect(runs[0].reviewedThreadStats?.total).toBe(5)
  })

  test('listByPr returns runs for that specific PR', async () => {
    const t = convexTest(schema, modules)
    const r1 = await createCopilotResult(t, 'pr 42')
    const r2 = await createCopilotResult(t, 'pr 99')

    await t.mutation(api.prReviewRuns.create, { ...prRunArgs, resultId: r1 })
    await t.mutation(api.prReviewRuns.create, {
      ...prRunArgs,
      prNumber: 99,
      prUrl: 'https://github.com/acme/frontend/pull/99',
      prTitle: 'Other PR',
      resultId: r2,
    })

    const pr42Runs = await t.query(api.prReviewRuns.listByPr, {
      owner: 'acme',
      repo: 'frontend',
      prNumber: 42,
    })
    expect(pr42Runs).toHaveLength(1)
  })

  test('latestByPr returns the most recent run for a PR', async () => {
    const t = convexTest(schema, modules)
    const r1 = await createCopilotResult(t, 'first')
    const r2 = await createCopilotResult(t, 'second')

    await t.mutation(api.prReviewRuns.create, { ...prRunArgs, resultId: r1 })
    await t.mutation(api.prReviewRuns.create, { ...prRunArgs, resultId: r2 })

    const latest = await t.query(api.prReviewRuns.latestByPr, {
      owner: 'acme',
      repo: 'frontend',
      prNumber: 42,
    })
    expect(latest).not.toBeNull()
    expect(latest?.resultId).toBe(r2)
  })

  test('latestByPr returns null when no runs exist', async () => {
    const t = convexTest(schema, modules)
    const result = await t.query(api.prReviewRuns.latestByPr, {
      owner: 'nobody',
      repo: 'empty',
      prNumber: 1,
    })
    expect(result).toBeNull()
  })

  test('markRunningByResult transitions linked run to running', async () => {
    const t = convexTest(schema, modules)
    const resultId = await createCopilotResult(t)
    await t.mutation(api.prReviewRuns.create, { ...prRunArgs, resultId })

    await t.mutation(api.prReviewRuns.markRunningByResult, { resultId, model: 'claude' })

    const runs = await t.query(api.prReviewRuns.listByPr, {
      owner: 'acme',
      repo: 'frontend',
      prNumber: 42,
    })
    expect(runs[0].status).toBe('running')
    expect(runs[0].model).toBe('claude')
  })

  test('markRunningByResult is a no-op when no linked run exists', async () => {
    const t = convexTest(schema, modules)
    const resultId = await createCopilotResult(t)

    // No run linked to this resultId — should not throw
    await t.mutation(api.prReviewRuns.markRunningByResult, { resultId })
  })

  test('completeByResult transitions linked run to completed', async () => {
    const t = convexTest(schema, modules)
    const resultId = await createCopilotResult(t)
    await t.mutation(api.prReviewRuns.create, { ...prRunArgs, resultId })

    await t.mutation(api.prReviewRuns.completeByResult, { resultId })

    const runs = await t.query(api.prReviewRuns.listByPr, {
      owner: 'acme',
      repo: 'frontend',
      prNumber: 42,
    })
    expect(runs[0].status).toBe('completed')
    expect(runs[0].completedAt).toBeGreaterThan(0)
  })

  test('failByResult transitions linked run to failed with error', async () => {
    const t = convexTest(schema, modules)
    const resultId = await createCopilotResult(t)
    await t.mutation(api.prReviewRuns.create, { ...prRunArgs, resultId })

    await t.mutation(api.prReviewRuns.failByResult, {
      resultId,
      error: 'Copilot SDK error',
    })

    const runs = await t.query(api.prReviewRuns.listByPr, {
      owner: 'acme',
      repo: 'frontend',
      prNumber: 42,
    })
    expect(runs[0].status).toBe('failed')
    expect(runs[0].error).toBe('Copilot SDK error')
  })
})
