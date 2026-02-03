import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Convex Cron Jobs for Buddy Workflows
 *
 * Schedules periodic tasks that run in the Convex cloud.
 */

const crons = cronJobs();

/**
 * Schedule Scanner
 *
 * Runs every minute to check for due schedules.
 * - Queries schedules where enabled=true AND nextRunAt <= now
 * - Creates pending runs for due schedules
 * - Updates schedule timing (lastRunAt, nextRunAt)
 */
crons.interval(
  "scan due schedules",
  { minutes: 1 },
  internal.scheduleScanner.scanAndDispatch
);

export default crons;
