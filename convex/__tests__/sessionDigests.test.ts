import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

const digestArgs = {
  sessionId: 'session-abc-123',
  workspaceName: 'my-workspace',
  model: 'claude-sonnet',
  agentMode: 'auto',
  requestCount: 50,
  totalPromptTokens: 100000,
  totalOutputTokens: 20000,
  totalToolCalls: 150,
  totalDurationMs: 300000,
  tokenEfficiency: 0.85,
  toolDensity: 3.0,
  searchChurn: 0.2,
  estimatedCost: 2.5,
  dominantTools: ['Read', 'Write', 'Bash'],
  firstPrompt: 'Implement feature X',
  sessionDate: Date.now(),
}

describe('sessionDigests', () => {
  test('upsert creates a new session digest', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.sessionDigests.upsert, digestArgs)
    expect(id).toBeTruthy()

    const digest = await t.query(api.sessionDigests.getBySessionId, {
      sessionId: 'session-abc-123',
    })
    expect(digest?.workspaceName).toBe('my-workspace')
    expect(digest?.requestCount).toBe(50)
  })

  test('upsert updates existing digest on second call with same sessionId', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sessionDigests.upsert, digestArgs)

    await t.mutation(api.sessionDigests.upsert, {
      ...digestArgs,
      requestCount: 75,
    })

    const digest = await t.query(api.sessionDigests.getBySessionId, {
      sessionId: 'session-abc-123',
    })
    expect(digest?.requestCount).toBe(75)

    const recent = await t.query(api.sessionDigests.listRecent, {})
    expect(recent).toHaveLength(1)
  })

  test('upsert creates distinct documents for different sessionIds', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sessionDigests.upsert, digestArgs)
    await t.mutation(api.sessionDigests.upsert, {
      ...digestArgs,
      sessionId: 'session-xyz-999',
    })

    const recent = await t.query(api.sessionDigests.listRecent, {})
    expect(recent).toHaveLength(2)
  })

  test('getBySessionId returns null for unknown sessionId', async () => {
    const t = convexTest(schema, modules)
    const result = await t.query(api.sessionDigests.getBySessionId, {
      sessionId: 'nonexistent',
    })
    expect(result).toBeNull()
  })

  test('listByWorkspace returns digests for the given workspace', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sessionDigests.upsert, digestArgs)
    await t.mutation(api.sessionDigests.upsert, {
      ...digestArgs,
      sessionId: 'other-session',
      workspaceName: 'other-workspace',
    })

    const results = await t.query(api.sessionDigests.listByWorkspace, {
      workspaceName: 'my-workspace',
    })
    expect(results).toHaveLength(1)
    expect(results[0].workspaceName).toBe('my-workspace')
  })

  test('listByWorkspace respects limit', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sessionDigests.upsert, digestArgs)
    await t.mutation(api.sessionDigests.upsert, {
      ...digestArgs,
      sessionId: 'session-2',
    })

    const results = await t.query(api.sessionDigests.listByWorkspace, {
      workspaceName: 'my-workspace',
      limit: 1,
    })
    expect(results).toHaveLength(1)
  })

  test('listRecent returns all digests in descending date order', async () => {
    const t = convexTest(schema, modules)
    const now = Date.now()
    await t.mutation(api.sessionDigests.upsert, {
      ...digestArgs,
      sessionId: 'older',
      sessionDate: now - 10000,
    })
    await t.mutation(api.sessionDigests.upsert, {
      ...digestArgs,
      sessionId: 'newer',
      sessionDate: now,
    })

    const results = await t.query(api.sessionDigests.listRecent, {})
    expect(results[0].sessionId).toBe('newer')
  })

  test('listRecent returns empty array when no digests exist', async () => {
    const t = convexTest(schema, modules)
    const results = await t.query(api.sessionDigests.listRecent, {})
    expect(results).toEqual([])
  })

  test('upsert stores optional firstPrompt when provided', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sessionDigests.upsert, {
      ...digestArgs,
      firstPrompt: 'First user message',
    })

    const digest = await t.query(api.sessionDigests.getBySessionId, {
      sessionId: digestArgs.sessionId,
    })
    expect(digest?.firstPrompt).toBe('First user message')
  })
})
