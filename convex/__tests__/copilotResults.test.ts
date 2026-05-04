import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

describe('copilotResults', () => {
  test('listRecent returns empty array when no results exist', async () => {
    const t = convexTest(schema, modules)
    const results = await t.query(api.copilotResults.listRecent, {})
    expect(results).toEqual([])
  })

  test('create inserts a pending result', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, {
      prompt: 'Review this PR',
      category: 'pr-review',
    })

    expect(id).toBeTruthy()

    const results = await t.query(api.copilotResults.listRecent, {})
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('pending')
    expect(results[0].prompt).toBe('Review this PR')
    expect(results[0].category).toBe('pr-review')
  })

  test('create stores optional metadata', async () => {
    const t = convexTest(schema, modules)
    const metadata = { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 }
    await t.mutation(api.copilotResults.create, {
      prompt: 'Review',
      metadata,
    })

    const results = await t.query(api.copilotResults.listRecent, {})
    expect(results[0].metadata).toEqual(metadata)
  })

  test('get returns result by ID', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'test' })

    const result = await t.query(api.copilotResults.get, { id })
    expect(result?.prompt).toBe('test')
  })

  test('markRunning transitions status to running', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'run me' })

    await t.mutation(api.copilotResults.markRunning, { id, model: 'claude-sonnet' })

    const result = await t.query(api.copilotResults.get, { id })
    expect(result?.status).toBe('running')
    expect(result?.model).toBe('claude-sonnet')
  })

  test('complete transitions to completed with result', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'analyze' })

    await t.mutation(api.copilotResults.complete, {
      id,
      result: '## Review\nLooks good!',
      model: 'claude-opus',
    })

    const result = await t.query(api.copilotResults.get, { id })
    expect(result?.status).toBe('completed')
    expect(result?.result).toBe('## Review\nLooks good!')
    expect(result?.completedAt).toBeGreaterThan(0)
    expect(result?.duration).toBeGreaterThanOrEqual(0)
  })

  test('complete throws when result does not exist', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'gone' })
    await t.mutation(api.copilotResults.remove, { id })

    await expect(
      t.mutation(api.copilotResults.complete, { id, result: 'too late' })
    ).rejects.toThrow()
  })

  test('fail transitions to failed with error', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'this will fail' })

    await t.mutation(api.copilotResults.fail, { id, error: 'API timeout' })

    const result = await t.query(api.copilotResults.get, { id })
    expect(result?.status).toBe('failed')
    expect(result?.error).toBe('API timeout')
  })

  test('fail throws when result does not exist', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'gone' })
    await t.mutation(api.copilotResults.remove, { id })

    await expect(t.mutation(api.copilotResults.fail, { id, error: 'err' })).rejects.toThrow()
  })

  test('listByCategory returns results with matching category', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.copilotResults.create, { prompt: 'pr', category: 'pr-review' })
    await t.mutation(api.copilotResults.create, { prompt: 'gen', category: 'general' })

    const prResults = await t.query(api.copilotResults.listByCategory, { category: 'pr-review' })
    expect(prResults).toHaveLength(1)
    expect(prResults[0].prompt).toBe('pr')
  })

  test('listByStatus returns results with matching status', async () => {
    const t = convexTest(schema, modules)
    const id1 = await t.mutation(api.copilotResults.create, { prompt: 'p1' })
    await t.mutation(api.copilotResults.create, { prompt: 'p2' })
    await t.mutation(api.copilotResults.complete, { id: id1, result: 'done' })

    const pending = await t.query(api.copilotResults.listByStatus, { status: 'pending' })
    expect(pending).toHaveLength(1)

    const completed = await t.query(api.copilotResults.listByStatus, { status: 'completed' })
    expect(completed).toHaveLength(1)
  })

  test('countActive returns counts of pending and running results', async () => {
    const t = convexTest(schema, modules)
    const id1 = await t.mutation(api.copilotResults.create, { prompt: 'p1' })
    await t.mutation(api.copilotResults.create, { prompt: 'p2' })
    await t.mutation(api.copilotResults.markRunning, { id: id1 })

    const counts = await t.query(api.copilotResults.countActive)
    expect(counts.pending).toBe(1)
    expect(counts.running).toBe(1)
  })

  test('remove deletes a result', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'delete me' })

    await t.mutation(api.copilotResults.remove, { id })

    const result = await t.query(api.copilotResults.get, { id })
    expect(result).toBeNull()
  })

  test('cleanup removes old completed and failed results', async () => {
    const t = convexTest(schema, modules)
    const id1 = await t.mutation(api.copilotResults.create, { prompt: 'old1' })
    const id2 = await t.mutation(api.copilotResults.create, { prompt: 'old2' })
    await t.mutation(api.copilotResults.complete, { id: id1, result: 'ok' })
    await t.mutation(api.copilotResults.fail, { id: id2, error: 'err' })

    // Use negative days to make cutoff in the future, ensuring all results are included
    const result = await t.mutation(api.copilotResults.cleanup, { olderThanDays: -1 })
    expect(result.deleted).toBe(2)
  })

  test('cleanup does not remove pending or running results', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotResults.create, { prompt: 'keep me' })
    await t.mutation(api.copilotResults.markRunning, { id })

    // Use negative days to make cutoff in the future
    const result = await t.mutation(api.copilotResults.cleanup, { olderThanDays: -1 })
    expect(result.deleted).toBe(0)
  })
})
