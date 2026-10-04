import { convexTest } from 'convex-test'
import migrationsTest from '@convex-dev/migrations/test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import schema from '../schema'
import { api, internal } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')
const NOW = Date.UTC(2026, 9, 3, 12)

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})
afterEach(() => vi.restoreAllMocks())

test.each(['copilot', 'codex'] as const)(
  'backfills only missing provider %s while preserving defined repository metadata',
  async usageProvider => {
    const t = convexTest(schema, modules)
    const id = await t.run(ctx =>
      ctx.db.insert('githubAccounts', {
        username: 'Alice',
        org: 'Corp',
        repoRoot: 'D:/saved',
        createdAt: 1,
        updatedAt: 2,
      })
    )
    const peer = await t.run(ctx =>
      ctx.db.insert('githubAccounts', {
        username: 'peer',
        org: 'Corp',
        usageProvider: 'copilot',
        createdAt: 3,
        updatedAt: 4,
      })
    )
    const before = await t.query(api.githubAccounts.get, { id })
    const peerBefore = await t.query(api.githubAccounts.get, { id: peer })
    expect(
      await t.mutation(api.githubAccounts.bulkImport, {
        accounts: [
          {
            username: 'alice',
            org: 'corp',
            repoRoot: 'D:/incoming',
            usageProvider,
          },
        ],
      })
    ).toEqual([])
    expect(await t.query(api.githubAccounts.get, { id })).toEqual({
      ...before,
      usageProvider,
      updatedAt: NOW,
    })
    expect(await t.query(api.githubAccounts.get, { id: peer })).toEqual(peerBefore)
    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(2)
    expect(accounts.filter(account => account.usageProvider === 'codex')).toHaveLength(
      usageProvider === 'codex' ? 1 : 0
    )
  }
)

test('backfills an explicitly empty repository without inventing provider metadata', async () => {
  const t = convexTest(schema, modules)
  const id = await t.run(ctx =>
    ctx.db.insert('githubAccounts', {
      username: 'Alice',
      org: 'Corp',
      createdAt: 1,
      updatedAt: 2,
    })
  )
  const before = await t.query(api.githubAccounts.get, { id })
  expect(
    await t.mutation(api.githubAccounts.bulkImport, {
      accounts: [
        {
          username: 'alice',
          org: 'corp',
          repoRoot: '',
        },
      ],
    })
  ).toEqual([])
  expect(await t.query(api.githubAccounts.get, { id })).toEqual({
    ...before,
    repoRoot: '',
    updatedAt: NOW,
  })
})

test.each([{}, { repoRoot: 'D:/incoming', usageProvider: 'codex' as const }])(
  'preserves all defined metadata and timestamps on a no-op import %j',
  async imported => {
    const t = convexTest(schema, modules)
    const id = await t.run(ctx =>
      ctx.db.insert('githubAccounts', {
        username: 'Alice',
        org: 'Corp',
        repoRoot: '',
        usageProvider: 'copilot',
        createdAt: 1,
        updatedAt: 2,
      })
    )
    const before = await t.query(api.githubAccounts.get, { id })
    expect(
      await t.mutation(api.githubAccounts.bulkImport, {
        accounts: [
          {
            username: 'alice',
            org: 'corp',
            ...imported,
          },
        ],
      })
    ).toEqual([])
    expect(await t.query(api.githubAccounts.get, { id })).toEqual(before)
    expect(await t.query(api.githubAccounts.list)).toEqual([before])
  }
)

test.each([undefined, 'D:/backfilled'])(
  'keeps an existing Codex owner while importing a conflicting provider and repository %j',
  async repoRoot => {
    const t = convexTest(schema, modules)
    const ownerId = await t.run(ctx =>
      ctx.db.insert('githubAccounts', {
        username: 'owner',
        org: 'Corp',
        usageProvider: 'codex',
        createdAt: 1,
        updatedAt: 2,
      })
    )
    const id = await t.run(ctx =>
      ctx.db.insert('githubAccounts', {
        username: 'target',
        org: 'Corp',
        createdAt: 3,
        updatedAt: 4,
      })
    )
    const before = await t.query(api.githubAccounts.get, { id })
    const ownerBefore = await t.query(api.githubAccounts.get, { id: ownerId })
    expect(
      await t.mutation(api.githubAccounts.bulkImport, {
        accounts: [
          {
            username: 'target',
            org: 'corp',
            usageProvider: 'codex',
            ...(repoRoot === undefined ? {} : { repoRoot }),
          },
        ],
      })
    ).toEqual([])
    expect(await t.query(api.githubAccounts.get, { id: ownerId })).toEqual(ownerBefore)
    expect(await t.query(api.githubAccounts.get, { id })).toEqual(
      repoRoot === undefined
        ? before
        : {
            ...before,
            repoRoot,
            updatedAt: NOW,
          }
    )
    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(2)
    expect(
      accounts.filter(account => account.usageProvider === 'codex').map(account => account._id)
    ).toEqual([ownerId])
  }
)

function migrationFixture() {
  const t = convexTest(schema, modules)
  migrationsTest.register(t)
  return t
}

test('merges collisions as Copilot when their newest Codex assignment is not the global owner', async () => {
  const t = migrationFixture()
  const ids = await t.run(async ctx => {
    const keeper = await ctx.db.insert('githubAccounts', {
      username: 'Alice',
      org: 'Corp',
      repoRoot: 'D:/older',
      usageProvider: 'copilot',
      createdAt: 1,
      updatedAt: 4,
    })
    const duplicate = await ctx.db.insert('githubAccounts', {
      username: 'alice',
      org: 'corp',
      usageProvider: 'codex',
      createdAt: 2,
      updatedAt: 5,
    })
    const owner = await ctx.db.insert('githubAccounts', {
      username: 'owner',
      org: 'Other',
      usageProvider: 'codex',
      createdAt: 3,
      updatedAt: 10,
    })
    return { keeper, duplicate, owner }
  })
  const keeperBefore = await t.query(api.githubAccounts.get, { id: ids.keeper })
  const ownerBefore = await t.query(api.githubAccounts.get, { id: ids.owner })
  await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, {})
  expect(await t.query(api.githubAccounts.get, { id: ids.keeper })).toEqual({
    ...keeperBefore,
    usageProvider: 'copilot',
    updatedAt: 5,
  })
  expect(await t.query(api.githubAccounts.get, { id: ids.duplicate })).toBeNull()
  expect(await t.query(api.githubAccounts.get, { id: ids.owner })).toEqual(ownerBefore)
  const first = await t.query(api.githubAccounts.list)
  expect(first).toHaveLength(2)
  expect(
    first.filter(account => account.usageProvider === 'codex').map(account => account._id)
  ).toEqual([ids.owner])
  vi.mocked(Date.now).mockReturnValue(NOW + 100)
  await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, { reset: true })
  expect(await t.query(api.githubAccounts.list)).toEqual(first)
})

test('discards the selected Codex assignment and demotes outside owners in the same migration', async () => {
  const t = migrationFixture()
  const ids = await t.run(async ctx => {
    const keeper = await ctx.db.insert('githubAccounts', {
      username: 'Alice',
      org: 'Corp',
      repoRoot: 'D:/preserved',
      usageProvider: 'codex',
      createdAt: 1,
      updatedAt: 3,
    })
    const duplicate = await ctx.db.insert('githubAccounts', {
      username: 'alice',
      org: 'corp',
      usageProvider: 'copilot',
      createdAt: 2,
      updatedAt: 4,
    })
    const outside = await ctx.db.insert('githubAccounts', {
      username: 'outside',
      org: 'Other',
      usageProvider: 'codex',
      createdAt: 0,
      updatedAt: 1,
    })
    return { keeper, duplicate, outside }
  })
  const keeperBefore = await t.query(api.githubAccounts.get, { id: ids.keeper })
  const outsideBefore = await t.query(api.githubAccounts.get, { id: ids.outside })
  await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, {})
  expect(await t.query(api.githubAccounts.get, { id: ids.keeper })).toEqual({
    ...keeperBefore,
    usageProvider: 'copilot',
    updatedAt: 4,
  })
  expect(await t.query(api.githubAccounts.get, { id: ids.outside })).toEqual({
    ...outsideBefore,
    usageProvider: 'copilot',
    updatedAt: NOW,
  })
  expect(await t.query(api.githubAccounts.get, { id: ids.duplicate })).toBeNull()
  const first = await t.query(api.githubAccounts.list)
  expect(first).toHaveLength(2)
  expect(first.filter(account => account.usageProvider === 'codex')).toEqual([])
  vi.mocked(Date.now).mockReturnValue(NOW + 100)
  await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, { reset: true })
  expect(await t.query(api.githubAccounts.list)).toEqual(first)
})

test('selects a deterministic keeper and newest-defined metadata when timestamps tie', async () => {
  const t = migrationFixture()
  const ids = await t.run(async ctx => {
    const first = await ctx.db.insert('githubAccounts', {
      username: 'Alice',
      org: 'Corp',
      repoRoot: 'D:/first',
      usageProvider: 'codex',
      createdAt: 1,
      updatedAt: 10,
    })
    const second = await ctx.db.insert('githubAccounts', {
      username: 'alice',
      org: 'corp',
      repoRoot: 'D:/second',
      usageProvider: 'copilot',
      createdAt: 1,
      updatedAt: 10,
    })
    return [first, second] as const
  })
  const documents = await Promise.all(ids.map(id => t.query(api.githubAccounts.get, { id })))
  const keeperIndex = ids[0] < ids[1] ? 0 : 1
  const newestIndex = keeperIndex === 0 ? 1 : 0
  await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, {})
  expect(await t.query(api.githubAccounts.list)).toEqual([
    {
      ...documents[keeperIndex],
      repoRoot: newestIndex === 0 ? 'D:/first' : 'D:/second',
      usageProvider: newestIndex === 0 ? 'codex' : 'copilot',
      updatedAt: 10,
    },
  ])
  expect(await t.query(api.githubAccounts.get, { id: ids[newestIndex] })).toBeNull()
  const first = await t.query(api.githubAccounts.list)
  vi.mocked(Date.now).mockReturnValue(NOW + 100)
  await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, { reset: true })
  expect(await t.query(api.githubAccounts.list)).toEqual(first)
})
