/**
 * Bookmark validation — pure helpers extracted from convex/bookmarks.ts.
 */

/** Validate a URL is http/https only. Throws on invalid URL or disallowed protocol. */
export function validateBookmarkUrl(url: string): void {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed')
  }
}

/** Validate category is non-empty after trimming. */
export function validateCategory(category: string): void {
  if (!category.trim()) {
    throw new Error('Category is required')
  }
}

/** Validate tag count is within limits. */
export function validateTagCount(tags: string[], maxTags = 50): void {
  if (tags.length > maxTags) {
    throw new Error(`Maximum ${maxTags} tags allowed`)
  }
}

/**
 * Validate bookmark mutation args.
 * Each field is only validated if defined (for partial updates).
 */
export function validateBookmarkUpdate(args: {
  url?: string
  category?: string
  tags?: string[]
}): void {
  if (args.url !== undefined) validateBookmarkUrl(args.url)
  if (args.category !== undefined) validateCategory(args.category)
  if (args.tags) validateTagCount(args.tags)
}

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
