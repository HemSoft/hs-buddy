/**
 * Pure worker result builders — no Electron or SDK dependencies.
 *
 * Extracted from electron/workers to reduce cyclomatic complexity
 * in untested code, keeping decision logic testable in src/.
 */

import type { WorkerResult } from '../types/worker'
import { getErrorMessage } from './errorUtils'
import { truncateOutput } from './shellUtils'

const DEFAULT_MAX_OUTPUT = 1_024_000

/** Build a successful worker result with optional output truncation. */
export function workerSuccess(
  rawOutput: string,
  startMs: number,
  maxOutput = DEFAULT_MAX_OUTPUT
): WorkerResult {
  const trimmed = truncateOutput(rawOutput, maxOutput)
  return {
    success: true,
    output: trimmed.length > 0 ? trimmed : undefined,
    exitCode: 0,
    duration: Date.now() - startMs,
  }
}

/** Build a failure worker result from an unknown error. */
export function workerFailure(error: unknown, startMs: number): WorkerResult {
  return {
    success: false,
    error: getErrorMessage(error),
    duration: Date.now() - startMs,
  }
}

/** Build an immediate failure for a missing config field. */
export function workerConfigError(missingField: string): WorkerResult {
  return {
    success: false,
    error: `No ${missingField} specified in job config`,
    duration: 0,
  }
}

/**
 * Resolve optional worker config values with defaults.
 *
 * Moves nullish-coalescing branches out of the worker execute methods
 * so they don't inflate cyclomatic complexity in untested electron/ code.
 */
export function resolvePromptDefaults(
  config: { model?: string; timeout?: number },
  defaults: { model: string; timeout: number }
): { model: string; timeout: number } {
  return {
    model: config.model ?? defaults.model,
    timeout: config.timeout ?? defaults.timeout,
  }
}
