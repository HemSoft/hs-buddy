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

/**
 * Copilot Usage Snapshot
 *
 * Runs once per day to mark Copilot usage snapshots as due.
 * The actual data collection is performed by the Electron IPC layer
 * when it sees the pending marker; this cron only coordinates timing.
 */
crons.daily(
  "collect copilot usage snapshots",
  { hourUTC: 6, minuteUTC: 0 },
  internal.scheduleScanner.markSnapshotsDue
);

export default crons;
