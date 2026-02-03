import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Run history operations
 */

// List recent runs (last N runs)
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_started")
      .order("desc")
      .take(limit);

    // Fetch job info for each run
    const runsWithJobs = await Promise.all(
      runs.map(async (run) => {
        const job = await ctx.db.get(run.jobId);
        const schedule = run.scheduleId 
          ? await ctx.db.get(run.scheduleId)
          : null;
        
        return {
          ...run,
          job: job ? {
            _id: job._id,
            name: job.name,
            workerType: job.workerType,
          } : null,
          schedule: schedule ? {
            _id: schedule._id,
            name: schedule.name,
          } : null,
        };
      })
    );

    return runsWithJobs;
  },
});

// List runs for a specific job
export const listByJob = query({
  args: {
    jobId: v.id("jobs"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    return await ctx.db
      .query("runs")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .take(limit);
  },
});

// List runs for a specific schedule
export const listBySchedule = query({
  args: {
    scheduleId: v.id("schedules"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    return await ctx.db
      .query("runs")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .order("desc")
      .take(limit);
  },
});

// Get single run by ID
export const get = query({
  args: { id: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) return null;

    const job = await ctx.db.get(run.jobId);
    const schedule = run.scheduleId 
      ? await ctx.db.get(run.scheduleId)
      : null;

    return {
      ...run,
      job,
      schedule,
    };
  },
});

// Create new run (when starting execution)
export const create = mutation({
  args: {
    jobId: v.id("jobs"),
    scheduleId: v.optional(v.id("schedules")),
    triggeredBy: v.union(
      v.literal("manual"),
      v.literal("schedule"),
      v.literal("api")
    ),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Verify job exists
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    const id = await ctx.db.insert("runs", {
      jobId: args.jobId,
      scheduleId: args.scheduleId,
      status: "pending",
      triggeredBy: args.triggeredBy,
      input: args.input,
      startedAt: Date.now(),
    });

    return id;
  },
});

// Update run status to running
export const markRunning = mutation({
  args: { id: v.id("runs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "running",
    });
  },
});

// Complete a run successfully
export const complete = mutation({
  args: {
    id: v.id("runs"),
    output: v.optional(v.any()),
    outputFileId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error(`Run ${args.id} not found`);
    }

    const completedAt = Date.now();
    await ctx.db.patch(args.id, {
      status: "completed",
      output: args.output,
      outputFileId: args.outputFileId,
      completedAt,
      duration: completedAt - run.startedAt,
    });

    // Update schedule last run status if this was a scheduled run
    if (run.scheduleId) {
      await ctx.db.patch(run.scheduleId, {
        lastRunAt: completedAt,
        lastRunStatus: "completed",
      });
    }
  },
});

// Fail a run
export const fail = mutation({
  args: {
    id: v.id("runs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error(`Run ${args.id} not found`);
    }

    const completedAt = Date.now();
    await ctx.db.patch(args.id, {
      status: "failed",
      error: args.error,
      completedAt,
      duration: completedAt - run.startedAt,
    });

    // Update schedule last run status if this was a scheduled run
    if (run.scheduleId) {
      await ctx.db.patch(run.scheduleId, {
        lastRunAt: completedAt,
        lastRunStatus: "failed",
      });
    }
  },
});

// Cancel a run
export const cancel = mutation({
  args: { id: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error(`Run ${args.id} not found`);
    }

    if (run.status !== "pending" && run.status !== "running") {
      throw new Error(`Cannot cancel run with status: ${run.status}`);
    }

    const completedAt = Date.now();
    await ctx.db.patch(args.id, {
      status: "cancelled",
      completedAt,
      duration: completedAt - run.startedAt,
    });
  },
});

// Get runs by status (for monitoring pending/running)
export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    return await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(limit);
  },
});

// Cleanup old runs (keep last N days)
export const cleanup = mutation({
  args: {
    olderThanDays: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldRuns = await ctx.db
      .query("runs")
      .withIndex("by_started")
      .filter((q) => q.lt(q.field("startedAt"), cutoff))
      .collect();

    let deleted = 0;
    for (const run of oldRuns) {
      // Don't delete if still running
      if (run.status !== "running" && run.status !== "pending") {
        await ctx.db.delete(run._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
