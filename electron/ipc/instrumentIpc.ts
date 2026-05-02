/**
 * Transparent IPC instrumentation — wraps ipcMain.handle() so every
 * IPC handler automatically gets an OTel span and metrics recording.
 * Must be called BEFORE any handler registration.
 */

import { ipcMain } from 'electron'
import { withSpan, recordIpcCall, emitLog } from '../telemetry'
import { getErrorMessage, getErrorStack } from '../../src/utils/errorUtils'
import { classifyIpcResult, applyIpcSpanAttributes } from '../../src/utils/ipcClassification'

const originalHandle = ipcMain.handle.bind(ipcMain)

let instrumented = false

/**
 * Patch ipcMain.handle to wrap every handler with OTel tracing + metrics.
 * Each IPC call becomes a span named `ipc/{channel}` with duration and
 * error tracking. Call once at startup before registerAllHandlers().
 */
export function instrumentIpcHandlers(): void {
  if (instrumented) return
  instrumented = true

  ipcMain.handle = ((
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
  ) => {
    return originalHandle(channel, async (event, ...args) => {
      const start = performance.now()
      let error = false

      try {
        const result = await withSpan(`ipc/${channel}`, { 'ipc.channel': channel }, async span => {
          const res = await listener(event, ...args)
          applyIpcSpanAttributes(span, classifyIpcResult(res))
          return res
        })
        return result
      } catch (err: unknown) {
        error = true
        emitLog('ERROR', `IPC handler failed: ${channel}`, {
          'ipc.channel': channel,
          'error.message': getErrorMessage(err),
          'error.stack': getErrorStack(err),
        })
        throw err
      } finally {
        const durationMs = performance.now() - start
        recordIpcCall(channel, durationMs, error)
      }
    })
  }) as typeof ipcMain.handle
}
