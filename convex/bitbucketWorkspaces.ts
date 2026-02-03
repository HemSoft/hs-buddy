import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * List all Bitbucket workspaces
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("bitbucketWorkspaces").collect();
  },
});

/**
 * Get a single Bitbucket workspace by ID
 */
export const get = query({
  args: { id: v.id("bitbucketWorkspaces") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Get a Bitbucket workspace by name
 */
export const getByWorkspace = query({
  args: { workspace: v.string() },
  handler: async (ctx, { workspace }) => {
    return await ctx.db
      .query("bitbucketWorkspaces")
      .withIndex("by_workspace", (q) => q.eq("workspace", workspace))
      .first();
  },
});

/**
 * Create a new Bitbucket workspace
 */
export const create = mutation({
  args: {
    workspace: v.string(),
    username: v.string(),
    userDisplayName: v.string(),
  },
  handler: async (ctx, { workspace, username, userDisplayName }) => {
    // Check for duplicates
    const existing = await ctx.db
      .query("bitbucketWorkspaces")
      .withIndex("by_workspace", (q) => q.eq("workspace", workspace))
      .first();
    
    if (existing) {
      throw new Error(`Bitbucket workspace ${workspace} already exists`);
    }

    const now = Date.now();
    return await ctx.db.insert("bitbucketWorkspaces", {
      workspace,
      username,
      userDisplayName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing Bitbucket workspace
 */
export const update = mutation({
  args: {
    id: v.id("bitbucketWorkspaces"),
    workspace: v.optional(v.string()),
    username: v.optional(v.string()),
    userDisplayName: v.optional(v.string()),
  },
  handler: async (ctx, { id, workspace, username, userDisplayName }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Bitbucket workspace not found");
    }

    await ctx.db.patch(id, {
      ...(workspace !== undefined && { workspace }),
      ...(username !== undefined && { username }),
      ...(userDisplayName !== undefined && { userDisplayName }),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Remove a Bitbucket workspace
 */
export const remove = mutation({
  args: { id: v.id("bitbucketWorkspaces") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
