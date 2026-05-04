import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

describe('buddyStats', () => {
  test('get returns in-memory defaults when no document exists', async () => {
    const t = convexTest(schema, modules)
    const stats = await t.query(api.buddyStats.get)
    expect(stats.key).toBe('default')
    expect(stats.appLaunches).toBe(0)
    expect(stats.prsViewed).toBe(0)
    expect(stats.totalUptimeMs).toBe(0)
  })

  test('increment creates a new document on first call', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.increment, { field: 'appLaunches' })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.appLaunches).toBe(1)
  })

  test('increment increments by 1 by default', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.increment, { field: 'prsViewed' })
    await t.mutation(api.buddyStats.increment, { field: 'prsViewed' })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.prsViewed).toBe(2)
  })

  test('increment increments by custom amount', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.increment, { field: 'tabsOpened', amount: 5 })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.tabsOpened).toBe(5)
  })

  test('increment throws for invalid field name', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.buddyStats.increment, { field: 'invalidField' })).rejects.toThrow(
      'Invalid stat field: invalidField'
    )
  })

  test('batchIncrement updates multiple fields atomically', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.batchIncrement, {
      fields: { prsViewed: 3, prsReviewed: 1 },
    })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.prsViewed).toBe(3)
    expect(stats.prsReviewed).toBe(1)
  })

  test('batchIncrement accumulates on existing document', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.batchIncrement, { fields: { prsViewed: 2 } })
    await t.mutation(api.buddyStats.batchIncrement, { fields: { prsViewed: 3 } })

    const stats = await t.query(api.buddyStats.get)
    expect(stats.prsViewed).toBe(5)
  })

  test('batchIncrement throws for invalid field', async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.buddyStats.batchIncrement, { fields: { badField: 1 } })
    ).rejects.toThrow()
  })

  test('recordSessionStart creates document and increments appLaunches', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.recordSessionStart)

    const stats = await t.query(api.buddyStats.get)
    expect(stats.appLaunches).toBe(1)
    expect(stats.lastSessionStart).toBeTruthy()
    expect(stats.firstLaunchDate).toBeGreaterThan(0)
  })

  test('recordSessionStart is idempotent when session is active', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.recordSessionStart)
    await t.mutation(api.buddyStats.recordSessionStart)

    const stats = await t.query(api.buddyStats.get)
    expect(stats.appLaunches).toBe(1)
  })

  test('recordSessionEnd clears lastSessionStart and accumulates uptime', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.recordSessionStart)
    await t.mutation(api.buddyStats.recordSessionEnd)

    const stats = await t.query(api.buddyStats.get)
    expect(stats.lastSessionStart).toBeUndefined()
    expect(stats.totalUptimeMs).toBeGreaterThanOrEqual(0)
  })

  test('recordSessionEnd is a no-op when no active session', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.recordSessionEnd)

    const stats = await t.query(api.buddyStats.get)
    expect(stats.totalUptimeMs).toBe(0)
  })

  test('checkpointUptime accumulates uptime without ending session', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.recordSessionStart)
    await t.mutation(api.buddyStats.checkpointUptime)

    const stats = await t.query(api.buddyStats.get)
    expect(stats.lastSessionStart).toBeTruthy()
    expect(stats.totalUptimeMs).toBeGreaterThanOrEqual(0)
  })

  test('checkpointUptime is a no-op when no active session', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.buddyStats.checkpointUptime)

    const stats = await t.query(api.buddyStats.get)
    expect(stats.totalUptimeMs).toBe(0)
  })
})
