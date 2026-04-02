import type { IpcMainInvokeEvent } from 'electron'
import { getErrorMessage } from '../utils'

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
