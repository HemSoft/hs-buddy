/**
 * Transparent IPC instrumentation — wraps ipcMain.handle() so every
 * IPC handler automatically gets an OTel span and metrics recording.
 * Must be called BEFORE any handler registration.
 */

import { ipcMain } from 'electron'
import { withSpan, recordIpcCall, emitLog } from '../telemetry'

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
          // Tag error results (convention: { success: false })
          if (res && typeof res === 'object' && 'success' in res && !res.success) {
            span.setAttribute('ipc.result', 'error')
            if ('error' in res) span.setAttribute('ipc.error_message', String(res.error))
          } else {
            span.setAttribute('ipc.result', 'ok')
          }
          return res
        })
        return result
      } catch (err) {
        error = true
        emitLog('ERROR', `IPC handler failed: ${channel}`, {
          'ipc.channel': channel,
          'error.message': err instanceof Error ? err.message : String(err),
          'error.stack': err instanceof Error ? (err.stack ?? '') : '',
        })
        throw err
      } finally {
        const durationMs = performance.now() - start
        recordIpcCall(channel, durationMs, error)
      }
    })
  }) as typeof ipcMain.handle
}
