import { v } from 'convex/values'
import { query, mutation, internalQuery, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

async function transferCodexOwnership(ctx: MutationCtx, ownerId?: Id<'githubAccounts'>) {
  const accounts = await ctx.db.query('githubAccounts').collect()
  await Promise.all(
    accounts
      .filter(account => account._id !== ownerId && account.usageProvider === 'codex')
      .map(account =>
        ctx.db.patch('githubAccounts', account._id, {
          usageProvider: 'copilot',
          updatedAt: Date.now(),
        })
      )
  )
}

function isSameAccountIdentity(
  left: { username: string; org: string },
  right: { username: string; org: string }
) {
  return (
    left.username.toLowerCase() === right.username.toLowerCase() &&
    left.org.toLowerCase() === right.org.toLowerCase()
  )
}

async function accountIdentityExists(
  ctx: MutationCtx,
  identity: { username: string; org: string },
  excludeId?: Id<'githubAccounts'>
) {
  const accounts = await ctx.db.query('githubAccounts').collect()
  return accounts.some(
    account => account._id !== excludeId && isSameAccountIdentity(account, identity)
  )
}

/**
 * Internal: return every tracked account for snapshot collection runs.
 */
export const listForSnapshotRun = internalQuery({
  args: {},
  handler: async ctx => {
    return ctx.db.query('githubAccounts').collect()
  },
})

/**
 * List all GitHub accounts
 */
export const list = query({
  args: {},
  handler: async ctx => {
    return ctx.db.query('githubAccounts').collect()
  },
})

/**
 * Get a single GitHub account by ID
 */
export const get = query({
  args: { id: v.id('githubAccounts') },
  handler: async (ctx, { id }) => {
    return ctx.db.get('githubAccounts', id)
  },
})

/**
 * Get a GitHub account by username and org
 */
export const getByUsernameOrg = query({
  args: { username: v.string(), org: v.string() },
  handler: async (ctx, { username, org }) => {
    const accounts = await ctx.db
      .query('githubAccounts')
      .withIndex('by_username', q => q.eq('username', username))
      .collect()
    return accounts.find(a => a.org === org) ?? null
  },
})

/**
 * Create a new GitHub account
 */
export const create = mutation({
  args: {
    username: v.string(),
    org: v.string(),
    usageProvider: v.optional(v.union(v.literal('copilot'), v.literal('codex'))),
  },
  handler: async (ctx, { username, org, usageProvider }) => {
    if (await accountIdentityExists(ctx, { username, org })) {
      throw new Error(`GitHub account ${username}@${org} already exists`)
    }

    if (usageProvider === 'codex') await transferCodexOwnership(ctx)
    const now = Date.now()
    return await ctx.db.insert('githubAccounts', {
      username,
      org,
      ...(usageProvider !== undefined && { usageProvider }),
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update an existing GitHub account
 */
export const update = mutation({
  args: {
    id: v.id('githubAccounts'),
    username: v.optional(v.string()),
    org: v.optional(v.string()),
    repoRoot: v.optional(v.string()),
    usageProvider: v.optional(v.union(v.literal('copilot'), v.literal('codex'))),
  },
  handler: async (ctx, { id, username, org, repoRoot, usageProvider }) => {
    const existing = await ctx.db.get('githubAccounts', id)
    if (!existing) {
      throw new Error('GitHub account not found')
    }

    const updatedIdentity = {
      username: username ?? existing.username,
      org: org ?? existing.org,
    }
    if (await accountIdentityExists(ctx, updatedIdentity, id)) {
      throw new Error(
        `GitHub account ${updatedIdentity.username}@${updatedIdentity.org} already exists`
      )
    }

    if (usageProvider === 'codex') await transferCodexOwnership(ctx, id)

    await ctx.db.patch('githubAccounts', id, {
      ...(username !== undefined && { username }),
      ...(org !== undefined && { org }),
      ...(repoRoot !== undefined && { repoRoot }),
      ...(usageProvider !== undefined && { usageProvider }),
      updatedAt: Date.now(),
    })
  },
})

/**
 * Remove a GitHub account
 */
export const remove = mutation({
  args: { id: v.id('githubAccounts') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete('githubAccounts', id)
  },
})

/**
 * Bulk import accounts (for migration from electron-store)
 */
export const bulkImport = mutation({
  args: {
    accounts: v.array(
      v.object({
        username: v.string(),
        org: v.string(),
        usageProvider: v.optional(v.union(v.literal('copilot'), v.literal('codex'))),
      })
    ),
  },
  handler: async (ctx, { accounts }) => {
    const now = Date.now()
    const results = []

    for (const account of accounts) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Bulk import checks and inserts sequentially so normalized duplicates within the same batch are skipped.
      if (await accountIdentityExists(ctx, account)) {
        continue
      }

      if (account.usageProvider === 'codex') await transferCodexOwnership(ctx)

      const id = await ctx.db.insert('githubAccounts', {
        username: account.username,
        org: account.org,
        ...(account.usageProvider !== undefined && { usageProvider: account.usageProvider }),
        createdAt: now,
        updatedAt: now,
      })
      results.push(id)
    }

    return results
  },
})
