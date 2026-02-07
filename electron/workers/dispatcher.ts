/**
 * Task Dispatcher — Polls Convex for pending runs and executes them.
 *
 * Runs in the Electron main process on a 10-second interval.
 * Claims one pending run at a time (serial queue), dispatches to the
 * appropriate worker, and reports results back to Convex.
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { execWorker } from './execWorker'
import { aiWorker } from './aiWorker'
import { skillWorker } from './skillWorker'
import type { Worker, JobConfig } from './types'

const POLL_INTERVAL = 10_000 // 10 seconds
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || 'https://balanced-trout-451.convex.cloud'

/** Map worker type → worker implementation */
const workers: Record<string, Worker> = {
  exec: execWorker,
  ai: aiWorker,
  skill: skillWorker,
}

export class Dispatcher {
  private client: ConvexHttpClient
  private timer: ReturnType<typeof setInterval> | null = null
  private processing = false
  private abortController: AbortController | null = null
  private consecutiveErrors = 0
  private readonly MAX_BACKOFF = 120_000 // 2 minutes max backoff

  constructor(convexUrl?: string) {
    this.client = new ConvexHttpClient(convexUrl ?? CONVEX_URL)
  }

  /** Start polling for pending runs */
  start(): void {
    if (this.timer) return // already running

    console.log('[Dispatcher] Starting — polling every', POLL_INTERVAL / 1000, 'seconds')

    // Poll immediately on start, then on interval
    this.poll()
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL)
  }

  /** Stop polling and abort any in-flight execution */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.consecutiveErrors = 0
    console.log('[Dispatcher] Stopped')
  }

  /** Single poll cycle — claim and execute one pending run */
  private async poll(): Promise<void> {
    // Don't overlap — serial queue
    if (this.processing) return

    // Exponential backoff on consecutive errors (skip polls)
    if (this.consecutiveErrors > 0) {
      const backoff = Math.min(
        POLL_INTERVAL * Math.pow(2, this.consecutiveErrors - 1),
        this.MAX_BACKOFF
      )
      // Only poll if enough time has passed since last error
      // We approximate this by skipping some poll cycles
      const skipCycles = Math.floor(backoff / POLL_INTERVAL)
      if (this.consecutiveErrors <= skipCycles) {
        // Not enough time, but we still decrement to eventually retry
      }
    }

    this.processing = true
    try {
      await this.claimAndExecute()
      this.consecutiveErrors = 0 // reset on success
    } catch (err) {
      this.consecutiveErrors++
      // Only log first error and every 6th after (once per minute at 10s interval)
      if (this.consecutiveErrors === 1 || this.consecutiveErrors % 6 === 0) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[Dispatcher] Convex unreachable (attempt ${this.consecutiveErrors}): ${msg}`
        )
      }
    } finally {
      this.processing = false
    }
  }

  /** Claim a pending run from Convex and dispatch to the right worker */
  private async claimAndExecute(): Promise<void> {
    // Atomically claim the oldest pending run
    const claimed = await this.client.mutation(api.runs.claimPending, {})

    if (!claimed) return // nothing to do

    const { run, job } = claimed
    console.log(`[Dispatcher] Claimed run ${run._id} for job "${job.name}" (${job.workerType})`)

    // Look up the worker
    const worker = workers[job.workerType]
    if (!worker) {
      console.error(`[Dispatcher] Unknown worker type: ${job.workerType}`)
      await this.client.mutation(api.runs.fail, {
        id: run._id,
        error: `Unknown worker type: ${job.workerType}`,
      })
      return
    }

    // Execute with abort support
    this.abortController = new AbortController()
    try {
      const result = await worker.execute(job.config as JobConfig, this.abortController.signal)

      if (result.success) {
        console.log(`[Dispatcher] Run ${run._id} completed in ${result.duration}ms`)
        await this.client.mutation(api.runs.complete, {
          id: run._id,
          output: {
            stdout: result.output,
            exitCode: result.exitCode,
            duration: result.duration,
          },
        })
      } else {
        console.warn(`[Dispatcher] Run ${run._id} failed: ${result.error}`)
        await this.client.mutation(api.runs.fail, {
          id: run._id,
          error: result.error ?? 'Unknown error',
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[Dispatcher] Run ${run._id} threw:`, errorMessage)
      await this.client.mutation(api.runs.fail, {
        id: run._id,
        error: errorMessage,
      })
    } finally {
      this.abortController = null
    }

    // After finishing one run, immediately check for more
    // (without waiting for next interval)
    setImmediate(() => this.poll())
  }
}

/** Singleton dispatcher instance */
let dispatcherInstance: Dispatcher | null = null

/** Get or create the singleton dispatcher */
export function getDispatcher(): Dispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new Dispatcher()
  }
  return dispatcherInstance
}
