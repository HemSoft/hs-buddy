/**
 * Pure helpers for directory-entry filtering and sorting.
 *
 * Extracted from electron/ipc/filesystemHandlers.ts so the decision
 * logic is testable independently of the Node fs layer.
 */

/** Directories that should never appear in file-browser listings */
export const SKIPPED_DIRECTORIES = new Set(['node_modules', '__pycache__', '.git'])

/** Returns `true` when a directory entry should be included in a listing. */
export function shouldIncludeDirEntry(name: string, isDirectory: boolean): boolean {
  if (name.startsWith('.')) return false
  if (isDirectory && SKIPPED_DIRECTORIES.has(name)) return false
  return true
}

/** Sort comparator: directories first, then case-insensitive alpha. */
export function compareDirEntries(
  a: { type: 'file' | 'directory'; name: string },
  b: { type: 'file' | 'directory'; name: string }
): number {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}
