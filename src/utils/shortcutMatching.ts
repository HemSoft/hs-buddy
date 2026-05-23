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

function hasCtrlOrCmd(input: KeyInput): boolean {
  return Boolean(input.control || input.meta)
}

function isMissingCtrlOrCmd(entry: ShortcutEntry, input: KeyInput): boolean {
  return entry.ctrlOrCmd === true && !hasCtrlOrCmd(input)
}

function isMissingShift(entry: ShortcutEntry, input: KeyInput): boolean {
  return entry.shift === true && !input.shift
}

/** Returns true when the keyboard input matches the shortcut definition. */
export function matchesShortcut(entry: ShortcutEntry, input: KeyInput): boolean {
  if (isMissingCtrlOrCmd(entry, input)) return false
  if (isMissingShift(entry, input)) return false
  return input.key === entry.key
}
