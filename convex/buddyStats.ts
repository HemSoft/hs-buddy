import { v } from 'convex/values'
import { mutation, query, type DatabaseReader } from './_generated/server'
import { SINGLETON_KEY } from './lib/domain'
import {
  validateStatFields,
  buildIncrementPatch,
  buildInitialStatsDoc,
} from '../src/utils/statsMutationUtils'

/**
 * Buddy Stats — centralized usage statistics (singleton pattern)
 *
 * All counters are stored in a single document keyed by "default".
 * Multiple clients (desktop, mobile, web) share the same stats.
 */

/** Zero-value defaults for all stat fields */
const DEFAULT_STATS = {
  appLaunches: 0,
  tabsOpened: 0,
  prsViewed: 0,
  prsReviewed: 0,
  prsMergedWatched: 0,
  reposBrowsed: 0,
  repoDetailViews: 0,
  jobsCreated: 0,
  runsTriggered: 0,
  runsCompleted: 0,
  runsFailed: 0,
  schedulesCreated: 0,
  bookmarksCreated: 0,
  settingsChanged: 0,
  searchesPerformed: 0,
  copilotPrReviews: 0,
  firstLaunchDate: 0,
  totalUptimeMs: 0,
}

/** Valid counter field names for increment/batchIncrement */
const COUNTER_FIELDS = new Set([
  'appLaunches',
  'tabsOpened',
  'prsViewed',
  'prsReviewed',
  'prsMergedWatched',
  'reposBrowsed',
  'repoDetailViews',
  'jobsCreated',
  'runsTriggered',
  'runsCompleted',
  'runsFailed',
  'schedulesCreated',
  'bookmarksCreated',
  'settingsChanged',
  'searchesPerformed',
  'copilotPrReviews',
])

async function getDefaultStats(db: DatabaseReader) {
  return db
    .query('buddyStats')
    .withIndex('by_key', q => q.eq('key', SINGLETON_KEY))
    .first()
}

// ── Queries ───────────────────────────────────────────────────────────────

/**
 * Get the buddy stats document (returns defaults if not yet created)
 */
export const get = query({
  args: {},
  handler: async ctx => {
    const doc = await getDefaultStats(ctx.db)

    if (doc) return doc

    // Return in-memory defaults (not persisted) until first mutation
    return {
      key: SINGLETON_KEY,
      ...DEFAULT_STATS,
      lastSessionStart: undefined,
      createdAt: 0,
      updatedAt: 0,
    }
  },
})

// ── Mutations ─────────────────────────────────────────────────────────────

/**
 * Increment a single counter field by a given amount (default 1).
 */
export const increment = mutation({
  args: {
    field: v.string(),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, { field, amount }) => {
    if (!COUNTER_FIELDS.has(field)) {
      throw new Error(`Invalid stat field: ${field}`)
    }

    const amt = amount ?? 1
    const now = Date.now()

    const existing = await getDefaultStats(ctx.db)

    if (existing) {
      const current = ((existing as Record<string, unknown>)[field] as number) ?? 0
      await ctx.db.patch('buddyStats', existing._id, {
        [field]: current + amt,
        updatedAt: now,
      })
      return existing._id
    }

    // First-ever stat write — create the document
    return await ctx.db.insert('buddyStats', {
      key: SINGLETON_KEY,
      ...DEFAULT_STATS,
      [field]: amt,
      firstLaunchDate: now,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Increment multiple counter fields in a single transaction.
 * Accepts a record of { fieldName: incrementAmount }.
 */
export const batchIncrement = mutation({
  args: {
    fields: v.any(), // Record<string, number>
  },
  handler: async (ctx, { fields }) => {
    const entries = Object.entries(fields as Record<string, number>)
    validateStatFields(fields as Record<string, number>, COUNTER_FIELDS)

    const now = Date.now()

    const existing = await getDefaultStats(ctx.db)

    if (existing) {
      const patch = buildIncrementPatch(entries, existing as Record<string, unknown>)
      patch.updatedAt = now
      await ctx.db.patch('buddyStats', existing._id, patch)
      return existing._id
    }

    const doc = buildInitialStatsDoc({ key: SINGLETON_KEY, ...DEFAULT_STATS }, entries, now)
    return await ctx.db.insert('buddyStats', doc as never)
  },
})

/**
 * Record a new session start.
 * Idempotent: if lastSessionStart is already set (e.g., React strict mode
 * double-mount), this is a no-op to avoid double-counting appLaunches
 * and resetting the session timer.
 */
export const recordSessionStart = mutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()

    const existing = await getDefaultStats(ctx.db)

    if (existing) {
      // If a session is already active, don't double-count
      if (existing.lastSessionStart) {
        return existing._id
      }

      const patch: Record<string, unknown> = {
        appLaunches: existing.appLaunches + 1,
        lastSessionStart: now,
        updatedAt: now,
      }
      // Set firstLaunchDate if it was never set (or zero)
      if (!existing.firstLaunchDate) {
        patch.firstLaunchDate = now
      }
      await ctx.db.patch('buddyStats', existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert('buddyStats', {
      key: SINGLETON_KEY,
      ...DEFAULT_STATS,
      appLaunches: 1,
      firstLaunchDate: now,
      lastSessionStart: now,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Record session end — flush accumulated uptime.
 * Reads lastSessionStart, computes elapsed, adds to totalUptimeMs, clears lastSessionStart.
 */
export const recordSessionEnd = mutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()

    const existing = await getDefaultStats(ctx.db)

    if (!existing || !existing.lastSessionStart) return

    const elapsed = Math.max(0, now - existing.lastSessionStart)

    await ctx.db.patch('buddyStats', existing._id, {
      totalUptimeMs: existing.totalUptimeMs + elapsed,
      lastSessionStart: undefined,
      updatedAt: now,
    })
  },
})

/**
 * Checkpoint uptime without ending the session.
 * Flushes accumulated time and resets lastSessionStart to now.
 * Used as a periodic heartbeat (every 5 min) to guard against crashes.
 */
export const checkpointUptime = mutation({
  args: {},
  handler: async ctx => {
    const now = Date.now()

    const existing = await getDefaultStats(ctx.db)

    if (!existing || !existing.lastSessionStart) return

    const elapsed = Math.max(0, now - existing.lastSessionStart)

    await ctx.db.patch('buddyStats', existing._id, {
      totalUptimeMs: existing.totalUptimeMs + elapsed,
      lastSessionStart: now,
      updatedAt: now,
    })
  },
})
