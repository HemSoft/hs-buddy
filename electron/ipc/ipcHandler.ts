import type { IpcMainInvokeEvent } from 'electron'
import { getErrorMessage } from '../../src/utils/errorUtils'

/**
 * Wraps an IPC handler with a standard try/catch that returns
 * `{ success: false, error: string }` on failure.
 *
 * Currently used by tempoHandlers and todoistHandlers.
 * TODO: Adopt in all handler files for consistent error surfaces.
 */
export function ipcHandler<A extends unknown[], T>(
  fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<T>
) {
  return async (
    event: IpcMainInvokeEvent,
    ...args: A
  ): Promise<T | { success: false; error: string }> => {
    try {
      return await fn(event, ...args)
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  }
}
