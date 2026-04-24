/** Platform detection utilities for cross-platform UI and keyboard handling. */

export const isMac = navigator.platform.toUpperCase().includes('MAC')

/** Return the platform-appropriate modifier label (⌘ on macOS, Ctrl on others). */
export const modLabel = isMac ? '⌘' : 'Ctrl'

/** Check whether the platform modifier key is pressed (Cmd on macOS, Ctrl on others). */
export function isModKey(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}
