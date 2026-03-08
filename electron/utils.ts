import { exec } from 'node:child_process'
import { promisify } from 'node:util'

export const execAsync = promisify(exec)

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
