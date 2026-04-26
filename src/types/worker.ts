/** Result returned by any worker after execution — shared between src/ and electron/. */
export interface WorkerResult {
  success: boolean
  output?: string
  error?: string
  exitCode?: number
  duration: number // milliseconds
}
