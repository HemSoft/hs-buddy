import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Session Digests — efficiency metrics for Copilot sessions.
 * Upserted by sessionId so re-computing doesn't create duplicates.
 */

export const upsert = mutation({
  args: {
    sessionId: v.string(),
    workspaceName: v.string(),
    model: v.optional(v.string()),
    agentMode: v.optional(v.string()),
    requestCount: v.number(),
    totalPromptTokens: v.number(),
    totalOutputTokens: v.number(),
    totalToolCalls: v.number(),
    totalDurationMs: v.number(),
    tokenEfficiency: v.number(),
    toolDensity: v.number(),
    searchChurn: v.number(),
    estimatedCost: v.number(),
    dominantTools: v.array(v.string()),
    firstPrompt: v.optional(v.string()),
    sessionDate: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessionDigests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, digestedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("sessionDigests", {
      ...args,
      digestedAt: now,
    });
  },
});

export const listByWorkspace = query({
  args: {
    workspaceName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessionDigests")
      .withIndex("by_workspace", (q) => q.eq("workspaceName", args.workspaceName))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessionDigests")
      .withIndex("by_date")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getBySessionId = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessionDigests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});
