import { Migrations } from '@convex-dev/migrations'
import { components, internal } from './_generated/api'
import schema from './schema'
import { backfillRunCount } from './lib/runStore'

const migrations = new Migrations(components.migrations, { schema })

export const backfillRunCounts = migrations.define({
  table: 'runs',
  batchSize: 50,
  migrateOne: backfillRunCount,
})

export const runBackfillRunCounts = migrations.runner(internal.migrations.backfillRunCounts)

export const mergeCaseCollidingGitHubAccounts = migrations.define({
  table: 'githubAccounts',
  batchSize: 50,
  parallelize: false,
  migrateOne: async (ctx, account) => {
    const accounts = await ctx.db.query('githubAccounts').collect()
    const normalizedUsername = account.username.toLowerCase()
    const normalizedOrg = account.org.toLowerCase()
    const collisions = accounts
      .filter(
        candidate =>
          candidate.username.toLowerCase() === normalizedUsername &&
          candidate.org.toLowerCase() === normalizedOrg
      )
      .sort((left, right) => left.createdAt - right.createdAt || left._id.localeCompare(right._id))
    const keeper = collisions[0]
    if (collisions.length < 2 || account._id !== keeper._id) return

    const newestFirst = [...collisions].sort(
      (left, right) => right.updatedAt - left.updatedAt || right._id.localeCompare(left._id)
    )
    const repoRoot = newestFirst.find(candidate => candidate.repoRoot)?.repoRoot
    const usageProvider = newestFirst.find(candidate => candidate.usageProvider)?.usageProvider
    await ctx.db.patch(keeper._id, {
      ...(repoRoot !== undefined && { repoRoot }),
      ...(usageProvider !== undefined && { usageProvider }),
      updatedAt: Math.max(...collisions.map(candidate => candidate.updatedAt)),
    })
    for (const duplicate of collisions.slice(1)) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- The migration is intentionally serial so later documents observe earlier duplicate removal.
      await ctx.db.delete(duplicate._id)
    }
  },
})

export const runMergeCaseCollidingGitHubAccounts = migrations.runner(
  internal.migrations.mergeCaseCollidingGitHubAccounts
)
