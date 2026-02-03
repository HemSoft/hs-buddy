import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { CronExpressionParser, type CronExpressionOptions } from "cron-parser";

/**
 * Schedule Scanner Module
 *
 * Contains internal functions for scanning and processing due schedules.
 * Called by the cron job defined in crons.ts.
 */

/**
 * Query for schedules that are due for execution.
 *
 * A schedule is due when:
 * - enabled = true
 * - nextRunAt <= current time (or nextRunAt is not set)
 */
export const getDueSchedules = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all enabled schedules
    const enabledSchedules = await ctx.db
      .query("schedules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    // Filter to only due schedules
    return enabledSchedules.filter((schedule) => {
      // If nextRunAt is not set, it needs initialization
      if (!schedule.nextRunAt) return true;
      // If nextRunAt is in the past or now, it's due
      return schedule.nextRunAt <= now;
    });
  },
});

/**
 * Calculate the next run time for a cron expression.
 *
 * @param cronExpression - Standard 5-field cron expression (minute hour day month weekday)
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @param fromDate - Calculate next run from this date (defaults to now)
 * @returns Next run timestamp in milliseconds
 */
function calculateNextRunAt(
  cronExpression: string,
  timezone?: string,
  fromDate?: Date
): number {
  try {
    const options: CronExpressionOptions = {};

    if (timezone) {
      options.tz = timezone;
    }
    if (fromDate) {
      options.currentDate = fromDate;
    }

    const expression = CronExpressionParser.parse(cronExpression, options);
    const nextDate = expression.next();
    return nextDate.getTime();
  } catch (error) {
    // If cron parsing fails, schedule 1 hour from now as fallback
    console.error(`Failed to parse cron expression "${cronExpression}":`, error);
    return Date.now() + 60 * 60 * 1000;
  }
}

/**
 * Main scan and dispatch function.
 *
 * Called every minute by the cron job. This function:
 * 1. Queries for due schedules
 * 2. Creates pending runs for each due schedule
 * 3. Updates schedule timing (lastRunAt, nextRunAt)
 * 4. Handles edge cases like missed schedules
 */
export const scanAndDispatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let runsCreated = 0;
    let schedulesUpdated = 0;

    // Get all enabled schedules
    const enabledSchedules = await ctx.db
      .query("schedules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    for (const schedule of enabledSchedules) {
      // Check if schedule is due
      // A schedule is due if:
      // 1. nextRunAt is not set (needs initialization), OR
      // 2. nextRunAt <= now (time has come)
      const isDue = !schedule.nextRunAt || schedule.nextRunAt <= now;

      if (!isDue) {
        continue;
      }

      // Get the job to include input params in the run
      const job = await ctx.db.get(schedule.jobId);
      if (!job) {
        console.error(`Job ${schedule.jobId} not found for schedule ${schedule._id}`);
        // Disable the orphaned schedule
        await ctx.db.patch(schedule._id, {
          enabled: false,
          updatedAt: now,
        });
        continue;
      }

      // Check if there's already a pending or running run for this schedule
      // to prevent duplicate runs for the same interval
      const existingRun = await ctx.db
        .query("runs")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "pending"),
            q.eq(q.field("status"), "running")
          )
        )
        .first();

      if (existingRun) {
        // Skip - there's already a pending/running run for this schedule
        // Just update nextRunAt to prevent re-triggering
        const nextRunAt = calculateNextRunAt(
          schedule.cron,
          schedule.timezone ?? "America/New_York",
          new Date(now)
        );
        await ctx.db.patch(schedule._id, {
          nextRunAt,
          updatedAt: now,
        });
        schedulesUpdated++;
        continue;
      }

      // Create a new pending run
      await ctx.db.insert("runs", {
        jobId: schedule.jobId,
        scheduleId: schedule._id,
        status: "pending",
        triggeredBy: "schedule",
        input: schedule.params,
        startedAt: now,
      });
      runsCreated++;

      // Calculate next run time (from now, not from the missed time)
      const nextRunAt = calculateNextRunAt(
        schedule.cron,
        schedule.timezone ?? "America/New_York",
        new Date(now)
      );

      // Update schedule timing
      await ctx.db.patch(schedule._id, {
        lastRunAt: now,
        nextRunAt,
        updatedAt: now,
      });
      schedulesUpdated++;
    }

    // Log summary for debugging
    if (runsCreated > 0 || schedulesUpdated > 0) {
      console.log(
        `Schedule scan complete: ${runsCreated} runs created, ${schedulesUpdated} schedules updated`
      );
    }

    return {
      runsCreated,
      schedulesUpdated,
      scannedAt: now,
    };
  },
});

/**
 * Initialize nextRunAt for a schedule.
 *
 * Called when a schedule is created or enabled to set the initial nextRunAt.
 * This is a public mutation so the UI can trigger it when creating schedules.
 */
export const initializeNextRun = internalMutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${args.scheduleId} not found`);
    }

    const nextRunAt = calculateNextRunAt(
      schedule.cron,
      schedule.timezone ?? "America/New_York"
    );

    await ctx.db.patch(args.scheduleId, {
      nextRunAt,
      updatedAt: Date.now(),
    });

    return { nextRunAt };
  },
});
