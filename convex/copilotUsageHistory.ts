import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Copilot Usage History Module
 *
 * Immutable snapshot storage for Copilot billing/spend telemetry.
 * Rows are insert-only — never updated or deleted — so prior history
 * is always intact even when an upstream fetch fails.
 */

/**
 * Store a single immutable usage snapshot.
 * Called from the Electron IPC layer after fetching upstream metrics.
 */
export const store = mutation({
  args: {
    accountUsername: v.string(),
    org: v.string(),
    billingYear: v.number(),
    billingMonth: v.number(),
    premiumRequests: v.number(),
    grossCost: v.number(),
    discount: v.number(),
    netCost: v.number(),
    businessSeats: v.number(),
    budgetAmount: v.optional(v.number()),
    spent: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("copilotUsageHistory", {
      ...args,
      snapshotAt: Date.now(),
    });
  },
});

/**
 * Return the daily time-series for a single account within a billing period.
 */
export const listByAccountPeriod = query({
  args: {
    accountUsername: v.string(),
    org: v.string(),
    billingYear: v.number(),
    billingMonth: v.number(),
  },
  handler: async (ctx, { accountUsername, org, billingYear, billingMonth }) => {
    return await ctx.db
      .query("copilotUsageHistory")
      .withIndex("by_account_period", (q) =>
        q
          .eq("accountUsername", accountUsername)
          .eq("org", org)
          .eq("billingYear", billingYear)
          .eq("billingMonth", billingMonth)
      )
      .collect();
  },
});

/**
 * Return all snapshots for an org within a billing period (across accounts).
 */
export const listByOrgPeriod = query({
  args: {
    org: v.string(),
    billingYear: v.number(),
    billingMonth: v.number(),
  },
  handler: async (ctx, { org, billingYear, billingMonth }) => {
    const rows = await ctx.db
      .query("copilotUsageHistory")
      .withIndex("by_org", (q) => q.eq("org", org))
      .collect();
    return rows.filter(
      (r) => r.billingYear === billingYear && r.billingMonth === billingMonth
    );
  },
});

/**
 * Return snapshots in a time range (all accounts), ordered by snapshot time.
 */
export const listByTimeRange = query({
  args: {
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, { startMs, endMs }) => {
    return await ctx.db
      .query("copilotUsageHistory")
      .withIndex("by_snapshot", (q) =>
        q.gte("snapshotAt", startMs).lte("snapshotAt", endMs)
      )
      .collect();
  },
});
