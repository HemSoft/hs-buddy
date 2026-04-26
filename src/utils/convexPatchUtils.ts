/**
 * Generic Convex patch helpers — pure functions for building mutation update payloads.
 *
 * Used by convex/bookmarks.ts, convex/jobs.ts, and any Convex handler that
 * patches records from a partial-update args shape.
 */

/** Build a patch object from mutation args, excluding `id` and setting `updatedAt`. */
export function buildUpdateData(
  args: Record<string, unknown>,
  now: number
): Record<string, unknown> {
  const updateData: Record<string, unknown> = { updatedAt: now }
  for (const [key, value] of Object.entries(args)) {
    if (key !== 'id' && value !== undefined) updateData[key] = value
  }
  return updateData
}
