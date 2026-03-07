import { CronExpressionParser, type CronExpressionOptions } from "cron-parser";

/**
 * Calculate the next run time for a cron expression.
 *
 * @param cronExpression - Standard 5-field cron expression (minute hour day month weekday)
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @param fromDate - Calculate next run from this date (defaults to now)
 * @returns Next run timestamp in milliseconds
 */
export function calculateNextRunAt(
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
