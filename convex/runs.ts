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
        const job = await ctx.db.get("jobs", run.jobId);
        const schedule = run.scheduleId 
          ? await ctx.db.get("schedules", run.scheduleId)
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
    const run = await ctx.db.get("runs", args.id);
    if (!run) return null;

    const job = await ctx.db.get("jobs", run.jobId);
    const schedule = run.scheduleId 
      ? await ctx.db.get("schedules", run.scheduleId)
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
    const job = await ctx.db.get("jobs", args.jobId);
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
    await ctx.db.patch("runs", args.id, {
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
    const run = await ctx.db.get("runs", args.id);
    if (!run) {
      throw new Error(`Run ${args.id} not found`);
    }

    const completedAt = Date.now();
    await ctx.db.patch("runs", args.id, {
      status: "completed",
      output: args.output,
      outputFileId: args.outputFileId,
      completedAt,
      duration: completedAt - run.startedAt,
    });

    // Update schedule last run status if this was a scheduled run
    if (run.scheduleId) {
      await ctx.db.patch("schedules", run.scheduleId, {
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
    const run = await ctx.db.get("runs", args.id);
    if (!run) {
      throw new Error(`Run ${args.id} not found`);
    }

    const completedAt = Date.now();
    await ctx.db.patch("runs", args.id, {
      status: "failed",
      error: args.error,
      completedAt,
      duration: completedAt - run.startedAt,
    });

    // Update schedule last run status if this was a scheduled run
    if (run.scheduleId) {
      await ctx.db.patch("schedules", run.scheduleId, {
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
    const run = await ctx.db.get("runs", args.id);
    if (!run) {
      throw new Error(`Run ${args.id} not found`);
    }

    if (run.status !== "pending" && run.status !== "running") {
      throw new Error(`Cannot cancel run with status: ${run.status}`);
    }

    const completedAt = Date.now();
    await ctx.db.patch("runs", args.id, {
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

// Claim the oldest pending run atomically (returns run + job, or null if none pending)
export const claimPending = mutation({
  args: {},
  handler: async (ctx) => {
    // Get oldest pending run
    const pendingRun = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .first();

    if (!pendingRun) {
      return null;
    }

    // Mark as running atomically
    await ctx.db.patch("runs", pendingRun._id, {
      status: "running",
    });

    // Fetch the associated job
    const job = await ctx.db.get("jobs", pendingRun.jobId);
    if (!job) {
      // Job was deleted — fail the run
      const completedAt = Date.now();
      await ctx.db.patch("runs", pendingRun._id, {
        status: "failed",
        error: `Job ${pendingRun.jobId} not found`,
        completedAt,
        duration: completedAt - pendingRun.startedAt,
      });
      return null;
    }

    return {
      run: { ...pendingRun, status: "running" as const },
      job,
    };
  },
});

// Cleanup old runs (keep last N days)
export const cleanup = mutation({
  args: {
    olderThanDays: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    // Fetch old runs using take() to avoid unbounded .collect()
    // Filter in TypeScript code per Convex best practices (no .filter())
    const oldRuns = await ctx.db
      .query("runs")
      .withIndex("by_started")
      .order("asc")
      .take(500);

    let deleted = 0;
    for (const run of oldRuns) {
      // Only delete runs older than cutoff and not active
      if (run.startedAt >= cutoff) break;
      if (run.status !== "running" && run.status !== "pending") {
        await ctx.db.delete("runs", run._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
