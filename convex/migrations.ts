import { Migrations } from '@convex-dev/migrations'
import { components, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import schema from './schema'
import { backfillRunCount } from './lib/runStore'

const migrations = new Migrations(components.migrations, { schema })

export const backfillRunCounts = migrations.define({
  table: 'runs',
  batchSize: 50,
  migrateOne: backfillRunCount,
})

export const runBackfillRunCounts = migrations.runner(internal.migrations.backfillRunCounts)

type GitHubAccountDocument = Doc<'githubAccounts'>

function byNewestAccount(left: GitHubAccountDocument, right: GitHubAccountDocument) {
  return right.updatedAt - left.updatedAt || right._id.localeCompare(left._id)
}

function findCodexOwner(accounts: GitHubAccountDocument[]) {
  return accounts.filter(account => account.usageProvider === 'codex').sort(byNewestAccount)[0]
}

function findIdentityCollisions(accounts: GitHubAccountDocument[], account: GitHubAccountDocument) {
  const normalizedUsername = account.username.toLowerCase()
  const normalizedOrg = account.org.toLowerCase()
  return accounts
    .filter(
      candidate =>
        candidate.username.toLowerCase() === normalizedUsername &&
        candidate.org.toLowerCase() === normalizedOrg
    )
    .sort((left, right) => left.createdAt - right.createdAt || left._id.localeCompare(right._id))
}

async function demoteConflictingCodexOwner(
  ctx: MutationCtx,
  account: GitHubAccountDocument,
  codexOwner: GitHubAccountDocument | undefined
) {
  if (account.usageProvider === 'codex' && account._id !== codexOwner?._id) {
    await ctx.db.patch(account._id, { usageProvider: 'copilot', updatedAt: Date.now() })
  }
}

async function mergeIdentityCollisions(
  ctx: MutationCtx,
  collisions: GitHubAccountDocument[],
  codexOwner: GitHubAccountDocument | undefined
) {
  const keeper = collisions[0]
  const newestFirst = [...collisions].sort(byNewestAccount)
  const repoRoot = newestFirst.find(candidate => candidate.repoRoot !== undefined)?.repoRoot
  const newestProvider = newestFirst.find(
    candidate => candidate.usageProvider !== undefined
  )?.usageProvider
  const usageProvider =
    newestProvider === 'codex' && !collisions.some(candidate => candidate._id === codexOwner?._id)
      ? 'copilot'
      : newestProvider
  await ctx.db.patch(keeper._id, {
    ...(repoRoot !== undefined && { repoRoot }),
    ...(usageProvider !== undefined && { usageProvider }),
    updatedAt: Math.max(...collisions.map(candidate => candidate.updatedAt)),
  })
  for (const duplicate of collisions.slice(1)) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- The migration is intentionally serial so later documents observe earlier duplicate removal.
    await ctx.db.delete(duplicate._id)
  }
}

export const mergeCaseCollidingGitHubAccounts = migrations.define({
  table: 'githubAccounts',
  batchSize: 50,
  parallelize: false,
  migrateOne: async (ctx, migrationAccount) => {
    const account = await ctx.db.get(migrationAccount._id)
    if (!account) return
    const accounts = await ctx.db.query('githubAccounts').collect()
    const codexOwner = findCodexOwner(accounts)
    const collisions = findIdentityCollisions(accounts, account)
    if (collisions.length < 2) {
      await demoteConflictingCodexOwner(ctx, account, codexOwner)
      return
    }
    if (account._id !== collisions[0]._id) return
    await mergeIdentityCollisions(ctx, collisions, codexOwner)
  },
})

export const runMergeCaseCollidingGitHubAccounts = migrations.runner(
  internal.migrations.mergeCaseCollidingGitHubAccounts
)
