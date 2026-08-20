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
