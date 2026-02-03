import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * List all GitHub accounts
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("githubAccounts").collect();
  },
});

/**
 * Get a single GitHub account by ID
 */
export const get = query({
  args: { id: v.id("githubAccounts") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Get a GitHub account by username and org
 */
export const getByUsernameOrg = query({
  args: { username: v.string(), org: v.string() },
  handler: async (ctx, { username, org }) => {
    const accounts = await ctx.db
      .query("githubAccounts")
      .withIndex("by_username", (q) => q.eq("username", username))
      .collect();
    return accounts.find((a) => a.org === org) ?? null;
  },
});

/**
 * Create a new GitHub account
 */
export const create = mutation({
  args: {
    username: v.string(),
    org: v.string(),
  },
  handler: async (ctx, { username, org }) => {
    // Check for duplicates
    const existing = await ctx.db
      .query("githubAccounts")
      .withIndex("by_username", (q) => q.eq("username", username))
      .collect();
    
    if (existing.some((a) => a.org === org)) {
      throw new Error(`GitHub account ${username}@${org} already exists`);
    }

    const now = Date.now();
    return await ctx.db.insert("githubAccounts", {
      username,
      org,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing GitHub account
 */
export const update = mutation({
  args: {
    id: v.id("githubAccounts"),
    username: v.optional(v.string()),
    org: v.optional(v.string()),
  },
  handler: async (ctx, { id, username, org }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("GitHub account not found");
    }

    await ctx.db.patch(id, {
      ...(username !== undefined && { username }),
      ...(org !== undefined && { org }),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Remove a GitHub account
 */
export const remove = mutation({
  args: { id: v.id("githubAccounts") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

/**
 * Bulk import accounts (for migration from electron-store)
 */
export const bulkImport = mutation({
  args: {
    accounts: v.array(v.object({
      username: v.string(),
      org: v.string(),
    })),
  },
  handler: async (ctx, { accounts }) => {
    const now = Date.now();
    const results = [];

    for (const account of accounts) {
      // Skip duplicates
      const existing = await ctx.db
        .query("githubAccounts")
        .withIndex("by_username", (q) => q.eq("username", account.username))
        .collect();
      
      if (existing.some((a) => a.org === account.org)) {
        continue;
      }

      const id = await ctx.db.insert("githubAccounts", {
        username: account.username,
        org: account.org,
        createdAt: now,
        updatedAt: now,
      });
      results.push(id);
    }

    return results;
  },
});
