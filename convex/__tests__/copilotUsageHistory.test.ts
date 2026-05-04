import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

const snapshot = {
  accountUsername: 'jdoe',
  org: 'acme',
  billingYear: 2025,
  billingMonth: 5,
  premiumRequests: 100,
  grossCost: 50.0,
  discount: 5.0,
  netCost: 45.0,
  businessSeats: 10,
  spent: 45.0,
}

describe('copilotUsageHistory', () => {
  test('store inserts an immutable snapshot', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.copilotUsageHistory.store, snapshot)
    expect(id).toBeTruthy()
  })

  test('listByAccountPeriod returns snapshots for that account and period', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.copilotUsageHistory.store, snapshot)
    await t.mutation(api.copilotUsageHistory.store, {
      ...snapshot,
      billingMonth: 4,
    })

    const results = await t.query(api.copilotUsageHistory.listByAccountPeriod, {
      accountUsername: 'jdoe',
      org: 'acme',
      billingYear: 2025,
      billingMonth: 5,
    })
    expect(results).toHaveLength(1)
    expect(results[0].billingMonth).toBe(5)
  })

  test('listByAccountPeriod returns empty array when no match', async () => {
    const t = convexTest(schema, modules)
    const results = await t.query(api.copilotUsageHistory.listByAccountPeriod, {
      accountUsername: 'nobody',
      org: 'none',
      billingYear: 2025,
      billingMonth: 1,
    })
    expect(results).toEqual([])
  })

  test('listByOrgPeriod returns snapshots across accounts for an org+period', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.copilotUsageHistory.store, { ...snapshot, accountUsername: 'user1' })
    await t.mutation(api.copilotUsageHistory.store, { ...snapshot, accountUsername: 'user2' })
    await t.mutation(api.copilotUsageHistory.store, {
      ...snapshot,
      accountUsername: 'user1',
      billingMonth: 4,
    })

    const results = await t.query(api.copilotUsageHistory.listByOrgPeriod, {
      org: 'acme',
      billingYear: 2025,
      billingMonth: 5,
    })
    expect(results).toHaveLength(2)
  })

  test('store allows multiple snapshots for the same account+period', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.copilotUsageHistory.store, snapshot)
    await t.mutation(api.copilotUsageHistory.store, { ...snapshot, premiumRequests: 150 })

    const results = await t.query(api.copilotUsageHistory.listByAccountPeriod, {
      accountUsername: 'jdoe',
      org: 'acme',
      billingYear: 2025,
      billingMonth: 5,
    })
    expect(results).toHaveLength(2)
  })

  test('store records optional budgetAmount', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.copilotUsageHistory.store, { ...snapshot, budgetAmount: 100 })

    const results = await t.query(api.copilotUsageHistory.listByAccountPeriod, {
      accountUsername: 'jdoe',
      org: 'acme',
      billingYear: 2025,
      billingMonth: 5,
    })
    expect(results[0].budgetAmount).toBe(100)
  })

  test('listByTimeRange returns snapshots within the given range', async () => {
    const t = convexTest(schema, modules)
    const before = Date.now()
    await t.mutation(api.copilotUsageHistory.store, snapshot)
    const after = Date.now()

    const results = await t.query(api.copilotUsageHistory.listByTimeRange, {
      startMs: before - 1000,
      endMs: after + 1000,
    })
    expect(results).toHaveLength(1)
  })

  test('listByTimeRange returns empty array when range does not match', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.copilotUsageHistory.store, snapshot)

    const results = await t.query(api.copilotUsageHistory.listByTimeRange, {
      startMs: 0,
      endMs: 1, // Far in the past
    })
    expect(results).toEqual([])
  })
})
