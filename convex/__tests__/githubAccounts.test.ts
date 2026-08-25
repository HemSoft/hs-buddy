import { convexTest } from 'convex-test'
import migrationsTest from '@convex-dev/migrations/test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api, internal } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

describe('githubAccounts', () => {
  test('list returns empty array when no accounts exist', async () => {
    const t = convexTest(schema, modules)
    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toEqual([])
  })

  test('create inserts a new GitHub account', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.githubAccounts.create, {
      username: 'jdoe',
      org: 'acme',
    })
    expect(id).toBeTruthy()

    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].username).toBe('jdoe')
    expect(accounts[0].org).toBe('acme')
  })

  test('create throws on duplicate username+org combination', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'alice', org: 'corp' })

    await expect(
      t.mutation(api.githubAccounts.create, { username: 'alice', org: 'corp' })
    ).rejects.toThrow('GitHub account alice@corp already exists')
  })

  test('create rejects duplicate identities that differ only by case', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'Alice', org: 'Corp' })

    await expect(
      t.mutation(api.githubAccounts.create, { username: 'alice', org: 'corp' })
    ).rejects.toThrow('GitHub account alice@corp already exists')
  })

  test('create rejects invalid GitHub account slugs', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(api.githubAccounts.create, { username: 'bad slug', org: 'corp' })
    ).rejects.toThrow("Invalid GitHub account slug: 'bad slug'")
    await expect(
      t.mutation(api.githubAccounts.create, { username: 'alice', org: '-corp' })
    ).rejects.toThrow("Invalid GitHub account slug: '-corp'")
  })

  test('create allows same username with different orgs', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'bob', org: 'org1' })
    await t.mutation(api.githubAccounts.create, { username: 'bob', org: 'org2' })

    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(2)
  })

  test('get returns account by ID', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.githubAccounts.create, { username: 'carol', org: 'x' })

    const account = await t.query(api.githubAccounts.get, { id })
    expect(account?.username).toBe('carol')
  })

  test('getByUsernameOrg returns matching account', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'dave', org: 'myorg' })

    const account = await t.query(api.githubAccounts.getByUsernameOrg, {
      username: 'dave',
      org: 'myorg',
    })
    expect(account?.username).toBe('dave')
    expect(account?.org).toBe('myorg')
  })

  test('getByUsernameOrg returns null when no match', async () => {
    const t = convexTest(schema, modules)
    const account = await t.query(api.githubAccounts.getByUsernameOrg, {
      username: 'nobody',
      org: 'nowhere',
    })
    expect(account).toBeNull()
  })

  test('update modifies username, org, and repoRoot', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.githubAccounts.create, { username: 'eve', org: 'old' })

    await t.mutation(api.githubAccounts.update, {
      id,
      username: 'eve-new',
      org: 'new-org',
      repoRoot: '/home/eve/code',
    })

    const account = await t.query(api.githubAccounts.get, { id })
    expect(account?.username).toBe('eve-new')
    expect(account?.org).toBe('new-org')
    expect(account?.repoRoot).toBe('/home/eve/code')
  })

  test('update rejects a case-variant duplicate identity', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'Alice', org: 'Corp' })
    const id = await t.mutation(api.githubAccounts.create, { username: 'bob', org: 'other' })

    await expect(
      t.mutation(api.githubAccounts.update, { id, username: 'alice', org: 'corp' })
    ).rejects.toThrow('GitHub account alice@corp already exists')
  })

  test('update rejects invalid GitHub account slugs', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.githubAccounts.create, { username: 'alice', org: 'corp' })

    await expect(
      t.mutation(api.githubAccounts.update, { id, username: 'bad slug' })
    ).rejects.toThrow("Invalid GitHub account slug: 'bad slug'")
  })

  test('update permits non-identity changes on legacy case-variant duplicates', async () => {
    const t = convexTest(schema, modules)
    const now = Date.now()
    const id = await t.run(async ctx => {
      await ctx.db.insert('githubAccounts', {
        username: 'Alice',
        org: 'Corp',
        createdAt: now,
        updatedAt: now,
      })
      return ctx.db.insert('githubAccounts', {
        username: 'alice',
        org: 'corp',
        createdAt: now + 1,
        updatedAt: now + 1,
      })
    })

    await expect(
      t.mutation(api.githubAccounts.update, { id, repoRoot: 'D:/github/example' })
    ).resolves.toBeNull()
    expect((await t.query(api.githubAccounts.get, { id }))?.repoRoot).toBe('D:/github/example')
  })

  test('migration merges legacy case-variant identities without losing metadata', async () => {
    const t = convexTest(schema, modules)
    migrationsTest.register(t)
    const ids = await t.run(async ctx => {
      const first = await ctx.db.insert('githubAccounts', {
        username: 'Alice',
        org: 'Corp',
        usageProvider: 'codex',
        createdAt: 1,
        updatedAt: 1,
      })
      const second = await ctx.db.insert('githubAccounts', {
        username: 'alice',
        org: 'corp',
        repoRoot: '',
        createdAt: 2,
        updatedAt: 2,
      })
      return { first, second }
    })

    await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, {})

    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({
      _id: ids.first,
      username: 'Alice',
      org: 'Corp',
      repoRoot: '',
      usageProvider: 'codex',
      updatedAt: 2,
    })
    expect(await t.query(api.githubAccounts.get, { id: ids.second })).toBeNull()
  })

  test('migration preserves only the newest global Codex owner', async () => {
    const t = convexTest(schema, modules)
    migrationsTest.register(t)
    const ids = await t.run(async ctx => {
      const oldOwner = await ctx.db.insert('githubAccounts', {
        username: 'old-owner',
        org: 'Org',
        usageProvider: 'codex',
        createdAt: 1,
        updatedAt: 1,
      })
      const keeper = await ctx.db.insert('githubAccounts', {
        username: 'Alice',
        org: 'Org',
        createdAt: 2,
        updatedAt: 2,
      })
      await ctx.db.insert('githubAccounts', {
        username: 'alice',
        org: 'org',
        usageProvider: 'codex',
        createdAt: 3,
        updatedAt: 3,
      })
      return { oldOwner, keeper }
    })

    await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, {})

    expect((await t.query(api.githubAccounts.get, { id: ids.oldOwner }))?.usageProvider).toBe(
      'copilot'
    )
    expect((await t.query(api.githubAccounts.get, { id: ids.keeper }))?.usageProvider).toBe('codex')
    expect(
      (await t.query(api.githubAccounts.list)).filter(a => a.usageProvider === 'codex')
    ).toHaveLength(1)
  })

  test('migration does not reassign Codex when the selected owner is discarded', async () => {
    const t = convexTest(schema, modules)
    migrationsTest.register(t)
    const oldOwner = await t.run(async ctx => {
      const id = await ctx.db.insert('githubAccounts', {
        username: 'old-owner',
        org: 'Org',
        usageProvider: 'codex',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('githubAccounts', {
        username: 'Alice',
        org: 'Org',
        usageProvider: 'codex',
        createdAt: 2,
        updatedAt: 3,
      })
      await ctx.db.insert('githubAccounts', {
        username: 'alice',
        org: 'org',
        usageProvider: 'copilot',
        createdAt: 3,
        updatedAt: 4,
      })
      return id
    })

    await t.mutation(internal.migrations.runMergeCaseCollidingGitHubAccounts, {})

    expect((await t.query(api.githubAccounts.get, { id: oldOwner }))?.usageProvider).toBe('copilot')
    expect(
      (await t.query(api.githubAccounts.list)).filter(account => account.usageProvider === 'codex')
    ).toHaveLength(0)
  })

  test('usage provider is optional and can be changed to Codex', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.githubAccounts.create, {
      username: 'HemSoft',
      org: 'HemSoft',
    })

    expect((await t.query(api.githubAccounts.get, { id }))?.usageProvider).toBeUndefined()

    await t.mutation(api.githubAccounts.update, { id, usageProvider: 'codex' })
    expect((await t.query(api.githubAccounts.get, { id }))?.usageProvider).toBe('codex')
  })

  test('updating an account to Codex atomically demotes the previous owner', async () => {
    const t = convexTest(schema, modules)
    const firstId = await t.mutation(api.githubAccounts.create, {
      username: 'first',
      org: 'HemSoft',
      usageProvider: 'codex',
    })
    const secondId = await t.mutation(api.githubAccounts.create, {
      username: 'second',
      org: 'HemSoft',
    })

    await t.mutation(api.githubAccounts.update, { id: secondId, usageProvider: 'codex' })

    expect((await t.query(api.githubAccounts.get, { id: firstId }))?.usageProvider).toBe('copilot')
    expect((await t.query(api.githubAccounts.get, { id: secondId }))?.usageProvider).toBe('codex')
  })

  test('creating a Codex account atomically demotes the previous owner', async () => {
    const t = convexTest(schema, modules)
    const firstId = await t.mutation(api.githubAccounts.create, {
      username: 'first',
      org: 'HemSoft',
      usageProvider: 'codex',
    })

    const secondId = await t.mutation(api.githubAccounts.create, {
      username: 'second',
      org: 'HemSoft',
      usageProvider: 'codex',
    })

    expect((await t.query(api.githubAccounts.get, { id: firstId }))?.usageProvider).toBe('copilot')
    expect((await t.query(api.githubAccounts.get, { id: secondId }))?.usageProvider).toBe('codex')
  })

  test('update throws when account does not exist', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.githubAccounts.create, { username: 'gone', org: 'gone' })
    await t.mutation(api.githubAccounts.remove, { id })

    await expect(
      t.mutation(api.githubAccounts.update, { id, username: 'updated' })
    ).rejects.toThrow('GitHub account not found')
  })

  test('remove deletes an account', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.githubAccounts.create, { username: 'frank', org: 'z' })

    await t.mutation(api.githubAccounts.remove, { id })

    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(0)
  })

  test('bulkImport inserts multiple accounts', async () => {
    const t = convexTest(schema, modules)
    const ids = await t.mutation(api.githubAccounts.bulkImport, {
      accounts: [
        { username: 'g1', org: 'org' },
        { username: 'g2', org: 'org' },
      ],
    })

    expect(ids).toHaveLength(2)

    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(2)
  })

  test('bulkImport skips invalid legacy identities without dropping valid accounts', async () => {
    const t = convexTest(schema, modules)
    const ids = await t.mutation(api.githubAccounts.bulkImport, {
      accounts: [
        { username: 'bad slug', org: 'org' },
        { username: 'valid-user', org: 'valid-org' },
      ],
    })

    expect(ids).toHaveLength(1)
    expect(await t.query(api.githubAccounts.list)).toMatchObject([
      { username: 'valid-user', org: 'valid-org' },
    ])
  })

  test('bulkImport skips duplicate username+org combinations', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'existing', org: 'org' })

    const ids = await t.mutation(api.githubAccounts.bulkImport, {
      accounts: [
        { username: 'existing', org: 'org' },
        { username: 'newuser', org: 'org' },
      ],
    })

    expect(ids).toHaveLength(1)

    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts).toHaveLength(2)
  })

  test('bulkImport skips case-variant duplicate identities', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.create, { username: 'Existing', org: 'Org' })

    const ids = await t.mutation(api.githubAccounts.bulkImport, {
      accounts: [
        { username: 'existing', org: 'org' },
        { username: 'newuser', org: 'org' },
      ],
    })

    expect(ids).toHaveLength(1)
    expect(await t.query(api.githubAccounts.list)).toHaveLength(2)
  })

  test('bulkImport merges metadata from case-variant identities in source order', async () => {
    const t = convexTest(schema, modules)
    const ids = await t.mutation(api.githubAccounts.bulkImport, {
      accounts: [
        {
          username: 'Alice',
          org: 'Org',
          repoRoot: 'D:/old',
          usageProvider: 'codex',
        },
        {
          username: 'alice',
          org: 'org',
          repoRoot: '',
          usageProvider: 'copilot',
        },
      ],
    })

    expect(ids).toHaveLength(1)
    expect(await t.query(api.githubAccounts.get, { id: ids[0] })).toMatchObject({
      username: 'Alice',
      org: 'Org',
      repoRoot: '',
      usageProvider: 'copilot',
    })
  })

  test('bulkImport leaves only the last imported Codex owner selected', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.githubAccounts.bulkImport, {
      accounts: [
        { username: 'first', org: 'HemSoft', usageProvider: 'codex' },
        { username: 'second', org: 'HemSoft', usageProvider: 'codex' },
      ],
    })

    const accounts = await t.query(api.githubAccounts.list)
    expect(accounts.find(account => account.username === 'first')?.usageProvider).toBe('copilot')
    expect(accounts.find(account => account.username === 'second')?.usageProvider).toBe('codex')
  })
})
