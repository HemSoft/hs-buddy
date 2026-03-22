import { exec } from 'node:child_process'
import { promisify } from 'node:util'

export const execAsync = promisify(exec)

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Format a Date as YYYY-MM-DD using local timezone (avoids UTC conversion) */
export function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
