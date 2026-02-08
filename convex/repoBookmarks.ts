import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Repo Bookmark CRUD operations
 */

// List all bookmarks
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("repoBookmarks").collect();
  },
});

// List bookmarks by folder
export const listByFolder = query({
  args: { folder: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repoBookmarks")
      .withIndex("by_folder", (q) => q.eq("folder", args.folder))
      .collect();
  },
});

// Get single bookmark by ID
export const get = query({
  args: { id: v.id("repoBookmarks") },
  handler: async (ctx, args) => {
    return await ctx.db.get("repoBookmarks", args.id);
  },
});

// Create new bookmark
export const create = mutation({
  args: {
    folder: v.string(),
    owner: v.string(),
    repo: v.string(),
    url: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate
    const existing = await ctx.db
      .query("repoBookmarks")
      .withIndex("by_owner_repo", (q) =>
        q.eq("owner", args.owner).eq("repo", args.repo)
      )
      .first();

    if (existing) {
      throw new Error(`Repo ${args.owner}/${args.repo} is already bookmarked`);
    }

    const now = Date.now();
    return await ctx.db.insert("repoBookmarks", {
      folder: args.folder,
      owner: args.owner,
      repo: args.repo,
      url: args.url,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update bookmark (move to different folder, update description)
export const update = mutation({
  args: {
    id: v.id("repoBookmarks"),
    folder: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("repoBookmarks", args.id);
    if (!existing) {
      throw new Error(`Bookmark ${args.id} not found`);
    }

    const updateData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.folder !== undefined) updateData.folder = args.folder;
    if (args.description !== undefined) updateData.description = args.description;

    await ctx.db.patch("repoBookmarks", args.id, updateData);
    return args.id;
  },
});

// Delete bookmark
export const remove = mutation({
  args: { id: v.id("repoBookmarks") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("repoBookmarks", args.id);
    if (!existing) {
      throw new Error(`Bookmark ${args.id} not found`);
    }
    await ctx.db.delete("repoBookmarks", args.id);
    return args.id;
  },
});
