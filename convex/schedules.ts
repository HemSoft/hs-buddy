import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { CronExpressionParser, type CronExpressionOptions } from "cron-parser";

/**
 * Calculate the next run time for a cron expression.
 */
function calculateNextRunAt(
  cronExpression: string,
  timezone?: string,
  fromDate?: Date
): number {
  try {
    const options: CronExpressionOptions = {};
    if (timezone) options.tz = timezone;
    if (fromDate) options.currentDate = fromDate;

    const expression = CronExpressionParser.parse(cronExpression, options);
    return expression.next().getTime();
  } catch (error) {
    console.error(`Failed to parse cron "${cronExpression}":`, error);
    return Date.now() + 60 * 60 * 1000; // Fallback: 1 hour from now
  }
}

/**
 * Schedule CRUD operations
 */

// List all schedules with job info
export const list = query({
  args: {},
  handler: async (ctx) => {
    const schedules = await ctx.db.query("schedules").collect();
    
    // Fetch associated jobs
    const schedulesWithJobs = await Promise.all(
      schedules.map(async (schedule) => {
        const job = await ctx.db.get(schedule.jobId);
        return {
          ...schedule,
          job: job ? {
            _id: job._id,
            name: job.name,
            workerType: job.workerType,
          } : null,
        };
      })
    );

    return schedulesWithJobs;
  },
});

// List only enabled schedules (for scheduler)
export const listEnabled = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("schedules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});

// Get single schedule by ID
export const get = query({
  args: { id: v.id("schedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.id);
    if (!schedule) return null;

    const job = await ctx.db.get(schedule.jobId);
    return {
      ...schedule,
      job: job ? {
        _id: job._id,
        name: job.name,
        workerType: job.workerType,
        description: job.description,
      } : null,
    };
  },
});

// Create new schedule
export const create = mutation({
  args: {
    jobId: v.id("jobs"),
    name: v.string(),
    description: v.optional(v.string()),
    cron: v.string(),
    timezone: v.optional(v.string()),
    enabled: v.boolean(),
    params: v.optional(v.any()),
    missedPolicy: v.union(
      v.literal("catchup"),
      v.literal("skip"),
      v.literal("last")
    ),
  },
  handler: async (ctx, args) => {
    // Verify job exists
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    const now = Date.now();
    const timezone = args.timezone ?? "America/New_York";

    // Calculate nextRunAt if schedule is enabled
    const nextRunAt = args.enabled
      ? calculateNextRunAt(args.cron, timezone)
      : undefined;

    const id = await ctx.db.insert("schedules", {
      jobId: args.jobId,
      name: args.name,
      description: args.description,
      cron: args.cron,
      timezone,
      enabled: args.enabled,
      params: args.params,
      missedPolicy: args.missedPolicy,
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

// Update existing schedule
export const update = mutation({
  args: {
    id: v.id("schedules"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    cron: v.optional(v.string()),
    timezone: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    params: v.optional(v.any()),
    missedPolicy: v.optional(v.union(
      v.literal("catchup"),
      v.literal("skip"),
      v.literal("last")
    )),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Schedule ${id} not found`);
    }

    const now = Date.now();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.cron !== undefined) updateData.cron = updates.cron;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
    if (updates.params !== undefined) updateData.params = updates.params;
    if (updates.missedPolicy !== undefined) updateData.missedPolicy = updates.missedPolicy;

    // Recalculate nextRunAt if cron, timezone, or enabled changed
    const cronChanged = updates.cron !== undefined && updates.cron !== existing.cron;
    const timezoneChanged = updates.timezone !== undefined && updates.timezone !== existing.timezone;
    const enabledChanged = updates.enabled !== undefined && updates.enabled !== existing.enabled;
    const isEnabled = updates.enabled ?? existing.enabled;

    if (isEnabled && (cronChanged || timezoneChanged || enabledChanged)) {
      const newCron = updates.cron ?? existing.cron;
      const newTimezone = updates.timezone ?? existing.timezone ?? "America/New_York";
      updateData.nextRunAt = calculateNextRunAt(newCron, newTimezone);
    } else if (!isEnabled) {
      updateData.nextRunAt = undefined;
    }

    await ctx.db.patch(id, updateData);
    return id;
  },
});

// Delete schedule
export const remove = mutation({
  args: { id: v.id("schedules") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`Schedule ${args.id} not found`);
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

// Toggle schedule enabled/disabled
export const toggle = mutation({
  args: { id: v.id("schedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error(`Schedule ${args.id} not found`);
    }

    const newEnabled = !schedule.enabled;
    const now = Date.now();

    // Calculate nextRunAt if being enabled
    const nextRunAt = newEnabled
      ? calculateNextRunAt(schedule.cron, schedule.timezone ?? "America/New_York")
      : undefined;

    await ctx.db.patch(args.id, {
      enabled: newEnabled,
      nextRunAt,
      updatedAt: now,
    });

    return newEnabled;
  },
});

// Update last run info (called after execution)
export const updateLastRun = mutation({
  args: {
    id: v.id("schedules"),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastRunAt: Date.now(),
      lastRunStatus: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Advance nextRunAt to the next future occurrence (used by offline sync)
export const advanceNextRun = mutation({
  args: {
    id: v.id("schedules"),
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error(`Schedule ${args.id} not found`);
    }

    const patch: Record<string, unknown> = {
      nextRunAt: args.nextRunAt,
      updatedAt: Date.now(),
    };

    if (args.lastRunAt !== undefined) {
      patch.lastRunAt = args.lastRunAt;
    }

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});
