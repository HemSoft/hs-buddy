import { v } from "convex/values";
import { mutation, query, type DatabaseReader } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function getRunByResult(db: DatabaseReader, resultId: Id<"copilotResults">) {
  const rows = await db
    .query("prReviewRuns")
    .withIndex("by_result", (q) => q.eq("resultId", resultId))
    .take(1);

  return rows[0] ?? null;
}

// List recent review runs for a specific PR (newest first)
export const listByPr = query({
  args: {
    owner: v.string(),
    repo: v.string(),
    prNumber: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    return await ctx.db
      .query("prReviewRuns")
      .withIndex("by_pr", q => q.eq("owner", args.owner).eq("repo", args.repo).eq("prNumber", args.prNumber))
      .order("desc")
      .take(limit);
  },
});

// Get latest review run for a specific PR
export const latestByPr = query({
  args: {
    owner: v.string(),
    repo: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("prReviewRuns")
      .withIndex("by_pr", q => q.eq("owner", args.owner).eq("repo", args.repo).eq("prNumber", args.prNumber))
      .order("desc")
      .take(1);

    return rows[0] ?? null;
  },
});

// Create a new PR review run linked to a Copilot resultId
export const create = mutation({
  args: {
    owner: v.string(),
    repo: v.string(),
    prNumber: v.number(),
    prUrl: v.string(),
    prTitle: v.string(),
    resultId: v.id("copilotResults"),
    prompt: v.string(),
    model: v.optional(v.string()),
    ghAccount: v.optional(v.string()),
    reviewedHeadSha: v.optional(v.string()),
    reviewedThreadStats: v.optional(
      v.object({
        total: v.number(),
        unresolved: v.number(),
        outdated: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("prReviewRuns", {
      owner: args.owner,
      repo: args.repo,
      prNumber: args.prNumber,
      prUrl: args.prUrl,
      prTitle: args.prTitle,
      status: "pending",
      resultId: args.resultId,
      prompt: args.prompt,
      model: args.model,
      ghAccount: args.ghAccount,
      reviewedHeadSha: args.reviewedHeadSha,
      reviewedThreadStats: args.reviewedThreadStats,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markRunningByResult = mutation({
  args: {
    resultId: v.id("copilotResults"),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await getRunByResult(ctx.db, args.resultId);
    if (!row) return;

    await ctx.db.patch(row._id, {
      status: "running",
      model: args.model ?? row.model,
      updatedAt: Date.now(),
    });
  },
});

export const completeByResult = mutation({
  args: {
    resultId: v.id("copilotResults"),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await getRunByResult(ctx.db, args.resultId);
    if (!row) return;

    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "completed",
      model: args.model ?? row.model,
      completedAt: now,
      updatedAt: now,
      error: undefined,
    });
  },
});

export const failByResult = mutation({
  args: {
    resultId: v.id("copilotResults"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await getRunByResult(ctx.db, args.resultId);
    if (!row) return;

    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "failed",
      error: args.error,
      completedAt: now,
      updatedAt: now,
    });
  },
});
