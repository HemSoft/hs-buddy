import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Default settings values
const DEFAULT_SETTINGS = {
  pr: {
    refreshInterval: 15, // minutes
    autoRefresh: true,
    recentlyMergedDays: 7,
  },
};

/**
 * Get the application settings (creates defaults if not exists)
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .first();

    // Return settings or defaults
    return settings ?? {
      key: "default" as const,
      ...DEFAULT_SETTINGS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
});

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
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing settings
      await ctx.db.patch("settings", existing._id, {
        pr: {
          ...existing.pr,
          ...(updates.refreshInterval !== undefined && { refreshInterval: updates.refreshInterval }),
          ...(updates.autoRefresh !== undefined && { autoRefresh: updates.autoRefresh }),
          ...(updates.recentlyMergedDays !== undefined && { recentlyMergedDays: updates.recentlyMergedDays }),
        },
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new settings document
      return await ctx.db.insert("settings", {
        key: "default",
        pr: {
          ...DEFAULT_SETTINGS.pr,
          ...(updates.refreshInterval !== undefined && { refreshInterval: updates.refreshInterval }),
          ...(updates.autoRefresh !== undefined && { autoRefresh: updates.autoRefresh }),
          ...(updates.recentlyMergedDays !== undefined && { recentlyMergedDays: updates.recentlyMergedDays }),
        },
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Reset settings to defaults
 */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch("settings", existing._id, {
        ...DEFAULT_SETTINGS,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("settings", {
        key: "default",
        ...DEFAULT_SETTINGS,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

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
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .first();

    // Only initialize if settings don't exist
    if (!existing) {
      const now = Date.now();
      await ctx.db.insert("settings", {
        key: "default",
        pr,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
