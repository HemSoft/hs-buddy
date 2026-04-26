/**
 * Bookmark validation — pure helpers extracted from convex/bookmarks.ts.
 */

export { buildUpdateData } from './convexPatchUtils'

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

/**
 * Resolve the effective URL and category for a bookmark update,
 * falling back to the existing values when not provided.
 */
export function resolveBookmarkUpdateTargets(
  args: { url?: string; category?: string },
  existing: { url: string; category: string }
): { targetUrl: string; targetCategory: string; needsDuplicateCheck: boolean } {
  const targetUrl = args.url ?? existing.url
  const targetCategory = args.category ?? existing.category
  const needsDuplicateCheck = args.url !== undefined || args.category !== undefined
  return { targetUrl, targetCategory, needsDuplicateCheck }
}
