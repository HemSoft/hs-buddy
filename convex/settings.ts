import { v } from 'convex/values'
import { query, mutation, type DatabaseReader } from './_generated/server'

// Default settings values
const DEFAULT_SETTINGS = {
  pr: {
    refreshInterval: 15, // minutes
    autoRefresh: true,
    recentlyMergedDays: 7,
  },
  copilot: {
    ghAccount: '', // empty = use currently-active gh CLI account
    model: 'claude-sonnet-4.5',
    premiumModel: 'claude-opus-4.6',
  },
}

function definedFields<T extends Record<string, unknown>>(updates: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

async function getDefaultSettings(db: DatabaseReader) {
  return db
    .query('settings')
    .withIndex('by_key', q => q.eq('key', 'default'))
    .first()
}

/**
 * Get the application settings (creates defaults if not exists)
 */
export const get = query({
  args: {},
  handler: async ctx => {
    const settings = await getDefaultSettings(ctx.db)

    // Return settings or defaults
    return (
      settings ?? {
        key: 'default' as const,
        ...DEFAULT_SETTINGS,
        viewModes: {} as Record<string, 'card' | 'list'>,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    )
  },
})

/**
 * Update PR settings
 */
export const updatePR = mutation({
  args: {
    refreshInterval: v.optional(v.number()),
    autoRefresh: v.optional(v.boolean()),
    recentlyMergedDays: v.optional(v.number()),
  },
  handler: async (ctx, updates) => {
    const existing = await getDefaultSettings(ctx.db)

    const now = Date.now()

    if (existing) {
      // Update existing settings
      await ctx.db.patch('settings', existing._id, {
        pr: {
          ...existing.pr,
          ...definedFields(updates),
        },
        updatedAt: now,
      })
      return existing._id
    } else {
      // Create new settings document
      return await ctx.db.insert('settings', {
        key: 'default',
        pr: {
          ...DEFAULT_SETTINGS.pr,
          ...definedFields(updates),
        },
        createdAt: now,
        updatedAt: now,
      })
    }
  },
})

/**
 * Update Copilot settings
 */
export const updateCopilot = mutation({
  args: {
    ghAccount: v.optional(v.string()),
    model: v.optional(v.string()),
    premiumModel: v.optional(v.string()),
  },
  handler: async (ctx, updates) => {
    const existing = await getDefaultSettings(ctx.db)

    const now = Date.now()
    const currentCopilot = existing?.copilot ?? DEFAULT_SETTINGS.copilot

    if (existing) {
      await ctx.db.patch(existing._id, {
        copilot: {
          ...currentCopilot,
          ...definedFields(updates),
        },
        updatedAt: now,
      })
      return existing._id
    } else {
      return await ctx.db.insert('settings', {
        key: 'default',
        pr: DEFAULT_SETTINGS.pr,
        copilot: {
          ...DEFAULT_SETTINGS.copilot,
          ...definedFields(updates),
        },
        createdAt: now,
        updatedAt: now,
      })
    }
  },
})

/**
 * Reset settings to defaults
 */
export const reset = mutation({
  args: {},
  handler: async ctx => {
    const existing = await getDefaultSettings(ctx.db)

    const now = Date.now()

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...DEFAULT_SETTINGS,
        viewModes: {},
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('settings', {
        key: 'default',
        ...DEFAULT_SETTINGS,
        viewModes: {},
        createdAt: now,
        updatedAt: now,
      })
    }
  },
})

/**
 * Update a single view mode preference (card/list) by page key
 */
export const updateViewMode = mutation({
  args: {
    pageKey: v.string(),
    mode: v.union(v.literal('card'), v.literal('list')),
  },
  handler: async (ctx, { pageKey, mode }) => {
    const existing = await getDefaultSettings(ctx.db)
    const now = Date.now()

    if (existing) {
      const viewModes = { ...(existing.viewModes ?? {}), [pageKey]: mode }
      await ctx.db.patch(existing._id, { viewModes, updatedAt: now })
      return existing._id
    } else {
      return await ctx.db.insert('settings', {
        key: 'default',
        ...DEFAULT_SETTINGS,
        viewModes: { [pageKey]: mode },
        createdAt: now,
        updatedAt: now,
      })
    }
  },
})

/**
 * Initialize settings with values from electron-store migration
 */
export const initFromMigration = mutation({
  args: {
    pr: v.object({
      refreshInterval: v.number(),
      autoRefresh: v.boolean(),
      recentlyMergedDays: v.number(),
    }),
  },
  handler: async (ctx, { pr }) => {
    const existing = await getDefaultSettings(ctx.db)

    // Only initialize if settings don't exist
    if (!existing) {
      const now = Date.now()
      await ctx.db.insert('settings', {
        key: 'default',
        pr,
        createdAt: now,
        updatedAt: now,
      })
    }
  },
})
