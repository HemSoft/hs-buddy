/**
 * IPC result classification — pure helpers for telemetry instrumentation.
 *
 * Extracted from electron/ipc/instrumentIpc.ts to reduce cyclomatic
 * complexity and keep decision logic testable.
 */

interface IpcResultClassification {
  outcome: 'ok' | 'error'
  errorMessage?: string
}

const hasOwn = Object.prototype.hasOwnProperty

/** Type guard: true when result is an object with `{ success: false }`. */
function isErrorResult(result: unknown): result is { success: false; error?: unknown } {
  return (
    result !== null &&
    typeof result === 'object' &&
    hasOwn.call(result, 'success') &&
    (result as { success: boolean }).success === false
  )
}

/** Classify an IPC handler's return value as ok or error. */
export function classifyIpcResult(result: unknown): IpcResultClassification {
  if (!isErrorResult(result)) return { outcome: 'ok' }
  const errorMessage =
    hasOwn.call(result, 'error') && result.error !== undefined ? String(result.error) : undefined
  return { outcome: 'error', errorMessage }
}

/** Apply classification attributes to a span-like object. */
export function applyIpcSpanAttributes(
  span: { setAttribute(key: string, value: string): void },
  classified: IpcResultClassification
): void {
  span.setAttribute('ipc.result', classified.outcome)
  if (classified.errorMessage) {
    span.setAttribute('ipc.error_message', classified.errorMessage)
  }
}
