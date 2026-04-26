export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Return the Error message if error is an Error, otherwise the given fallback. */
export function getErrorMessageWithFallback(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

const UNHELPFUL_MESSAGES = new Set(['', 'undefined', 'null', '[object Object]'])

/** Return the error message, falling back to a user-friendly string when the
 *  raw message would be meaningless (e.g. "[object Object]" or "undefined"). */
export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  const msg = getErrorMessage(error)
  return UNHELPFUL_MESSAGES.has(msg) ? fallback : msg
}

const ABORT_ERROR_MESSAGE = 'Cancelled'
const ABORT_ERROR_NAME = 'AbortError'

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException(ABORT_ERROR_MESSAGE, ABORT_ERROR_NAME)
}

export function getErrorStack(error: unknown): string {
  return error instanceof Error ? (error.stack ?? '') : ''
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === ABORT_ERROR_NAME
}
