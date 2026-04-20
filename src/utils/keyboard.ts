import type { KeyboardEvent } from 'react'

/**
 * Creates a keyboard event handler that triggers an action on Enter or Space.
 * Eliminates the repeated pattern found 27+ times in the codebase:
 * ```tsx
 * onKeyDown={e => {
 *   if (e.key === 'Enter' || e.key === ' ') {
 *     e.preventDefault()
 *     action()
 *   }
 * }}
 * ```
 */
export function onKeyboardActivate(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      action()
    }
  }
}
