import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Repo Folder CRUD operations
 */

// List all folders sorted by sortOrder
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("repoFolders")
      .withIndex("by_sort_order")
      .collect();
  },
});

// Get single folder by ID
export const get = query({
  args: { id: v.id("repoFolders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Create new folder
export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate name
    const existing = await ctx.db
      .query("repoFolders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      throw new Error(`Folder "${args.name}" already exists`);
    }

    // Get max sort order
    const allFolders = await ctx.db.query("repoFolders").collect();
    const maxOrder = allFolders.reduce((max, f) => Math.max(max, f.sortOrder), -1);

    const now = Date.now();
    return await ctx.db.insert("repoFolders", {
      name: args.name,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Rename folder (also updates bookmarks referencing the old name)
export const rename = mutation({
  args: {
    id: v.id("repoFolders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`Folder ${args.id} not found`);
    }

    // Check for duplicate name
    if (args.name !== existing.name) {
      const duplicate = await ctx.db
        .query("repoFolders")
        .withIndex("by_name", (q) => q.eq("name", args.name))
        .first();

      if (duplicate) {
        throw new Error(`Folder "${args.name}" already exists`);
      }

      // Update all bookmarks that reference the old folder name
      const bookmarks = await ctx.db
        .query("repoBookmarks")
        .withIndex("by_folder", (q) => q.eq("folder", existing.name))
        .collect();

      for (const bookmark of bookmarks) {
        await ctx.db.patch(bookmark._id, {
          folder: args.name,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(args.id, {
      name: args.name,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

// Delete folder (and all its bookmarks)
export const remove = mutation({
  args: { id: v.id("repoFolders") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`Folder ${args.id} not found`);
    }

    // Delete all bookmarks in this folder
    const bookmarks = await ctx.db
      .query("repoBookmarks")
      .withIndex("by_folder", (q) => q.eq("folder", existing.name))
      .collect();

    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});
