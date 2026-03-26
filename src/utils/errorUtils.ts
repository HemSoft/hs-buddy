export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const ABORT_ERROR_MESSAGE = 'Cancelled'
const ABORT_ERROR_NAME = 'AbortError'

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException(ABORT_ERROR_MESSAGE, ABORT_ERROR_NAME)
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === ABORT_ERROR_NAME
}
