/**
 * Keyboard shortcut matching — pure logic extracted from electron/menu.ts.
 *
 * Uses a structural type so both Electron.Input and plain test objects conform.
 */

interface KeyInput {
  key: string
  control?: boolean
  meta?: boolean
  shift?: boolean
}

interface ShortcutEntry {
  key: string
  ctrlOrCmd?: boolean
  shift?: boolean
}

/** Returns true when the keyboard input matches the shortcut definition. */
export function matchesShortcut(entry: ShortcutEntry, input: KeyInput): boolean {
  const ctrlOrCmd = input.control || input.meta
  if (entry.ctrlOrCmd && !ctrlOrCmd) return false
  if (entry.shift && !input.shift) return false
  return input.key === entry.key
}
