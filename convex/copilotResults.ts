import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Copilot SDK Results — CRUD operations for captured Copilot prompt results.
 */

// List recent results (newest first)
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("copilotResults")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});

// List results by category
export const listByCategory = query({
  args: {
    category: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("copilotResults")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .order("desc")
      .take(limit);
  },
});

// List results by status
export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("copilotResults")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(limit);
  },
});

// Get single result by ID
export const get = query({
  args: { id: v.id("copilotResults") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Count pending/running results (for badges)
export const countActive = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("copilotResults")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(100);
    const running = await ctx.db
      .query("copilotResults")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(100);
    return { pending: pending.length, running: running.length };
  },
});

// Create a new pending result (called when user initiates a prompt)
export const create = mutation({
  args: {
    prompt: v.string(),
    category: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("copilotResults", {
      prompt: args.prompt,
      status: "pending",
      category: args.category,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
    return id;
  },
});

// Mark a result as running
export const markRunning = mutation({
  args: {
    id: v.id("copilotResults"),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "running",
      model: args.model,
    });
  },
});

// Complete a result with markdown output
export const complete = mutation({
  args: {
    id: v.id("copilotResults"),
    result: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error(`CopilotResult ${args.id} not found`);

    const completedAt = Date.now();
    await ctx.db.patch(args.id, {
      status: "completed",
      result: args.result,
      model: args.model,
      completedAt,
      duration: completedAt - doc.createdAt,
    });
  },
});

// Fail a result
export const fail = mutation({
  args: {
    id: v.id("copilotResults"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error(`CopilotResult ${args.id} not found`);

    const completedAt = Date.now();
    await ctx.db.patch(args.id, {
      status: "failed",
      error: args.error,
      completedAt,
      duration: completedAt - doc.createdAt,
    });
  },
});

// Delete a result
export const remove = mutation({
  args: { id: v.id("copilotResults") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Cleanup old results (keep last N days)
export const cleanup = mutation({
  args: {
    olderThanDays: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
    const oldResults = await ctx.db
      .query("copilotResults")
      .withIndex("by_created")
      .order("asc")
      .take(500);

    let deleted = 0;
    for (const result of oldResults) {
      if (result.createdAt >= cutoff) break;
      if (result.status !== "running" && result.status !== "pending") {
        await ctx.db.delete(result._id);
        deleted++;
      }
    }
    return { deleted };
  },
});
