/**
 * Pure helpers for stats mutation operations.
 *
 * Extracted from convex/buddyStats.ts so the field validation
 * and patch-building logic is testable without Convex context.
 */

/** Validate that all field names in the record are in the allowed set. Throws on invalid. */
export function validateStatFields(fields: Record<string, number>, validFields: Set<string>): void {
  for (const key of Object.keys(fields)) {
    if (!validFields.has(key)) {
      throw new Error(`Invalid stat field: ${key}`)
    }
  }
}

/**
 * Build the increment patch from field entries + existing values.
 * Returns a record with each field set to `existing + amount`.
 */
export function buildIncrementPatch(
  entries: Array<[string, number]>,
  existing: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [key, amount] of entries) {
    const raw = existing[key]
    const current = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    patch[key] = current + amount
  }
  return patch
}

/**
 * Build the initial document for a fresh stats insert.
 * Spreads defaults, applies the requested field values, and adds timestamps.
 */
export function buildInitialStatsDoc(
  defaults: Record<string, unknown>,
  entries: Array<[string, number]>,
  now: number
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    ...defaults,
    firstLaunchDate: now,
    createdAt: now,
    updatedAt: now,
  }
  for (const [key, amount] of entries) {
    doc[key] = amount
  }
  return doc
}
