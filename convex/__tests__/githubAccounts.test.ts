import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

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
})
