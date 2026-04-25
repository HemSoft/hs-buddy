/**
 * Task Dispatcher — Polls Convex for pending runs and executes them.
 *
 * Runs in the Electron main process on a 10-second interval.
 * Claims one pending run at a time (serial queue), dispatches to the
 * appropriate worker, and reports results back to Convex.
 */

import { ConvexHttpClient } from 'convex/browser'
import type { Id } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'
import { execWorker } from './execWorker'
import { aiWorker } from './aiWorker'
import { skillWorker } from './skillWorker'
import { fetchCopilotMetrics } from '../ipc/githubHandlers'
import type { Worker, JobConfig } from './types'
import { CONVEX_URL } from '../config'
import { getErrorMessage } from '../../src/utils/errorUtils'

const POLL_INTERVAL = 10_000 // 10 seconds

/** Map worker type → worker implementation */
const workers: Record<string, Worker> = {
  exec: execWorker,
  ai: aiWorker,
  skill: skillWorker,
}

class Dispatcher {
  private client: ConvexHttpClient
  private timer: ReturnType<typeof setInterval> | null = null
  private processing = false
  private abortController: AbortController | null = null
  private consecutiveErrors = 0
  private lastErrorTime = 0
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

    // Exponential backoff on consecutive errors (time-based guard)
    if (this.consecutiveErrors > 0) {
      const backoff = Math.min(
        POLL_INTERVAL * Math.pow(2, this.consecutiveErrors - 1),
        this.MAX_BACKOFF
      )
      if (Date.now() < this.lastErrorTime + backoff) {
        return
      }
    }

    this.processing = true
    try {
      await this.claimAndExecute()
      this.consecutiveErrors = 0 // reset on success
    } catch (err) {
      this.consecutiveErrors++
      this.lastErrorTime = Date.now()
      // Only log first error and every 6th after (once per minute at 10s interval)
      if (this.consecutiveErrors === 1 || this.consecutiveErrors % 6 === 0) {
        const msg = getErrorMessage(err)
        console.warn(`[Dispatcher] Convex unreachable (attempt ${this.consecutiveErrors}): ${msg}`)
      }
    } finally {
      this.processing = false
    }
  }

  private async executeWorkerRun(
    run: { _id: Id<'runs'> },
    worker: (typeof workers)[string],
    config: JobConfig
  ): Promise<void> {
    this.abortController = new AbortController()
    try {
      const result = await worker.execute(config, this.abortController.signal)
      if (result.success) {
        console.log(`[Dispatcher] Run ${run._id} completed in ${result.duration}ms`)
        await this.client.mutation(api.runs.complete, {
          id: run._id,
          output: { stdout: result.output, exitCode: result.exitCode, duration: result.duration },
        })
      } else {
        console.warn(`[Dispatcher] Run ${run._id} failed: ${result.error}`)
        await this.client.mutation(api.runs.fail, {
          id: run._id,
          error: result.error ?? 'Unknown error',
        })
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err)
      console.error(`[Dispatcher] Run ${run._id} threw:`, errorMessage)
      await this.client.mutation(api.runs.fail, { id: run._id, error: errorMessage })
    } finally {
      this.abortController = null
    }
  }

  /** Claim a pending run from Convex and dispatch to the right worker */
  private async claimAndExecute(): Promise<void> {
    const claimed = await this.client.mutation(api.runs.claimPending, {})
    if (!claimed) return

    const { run, job } = claimed
    console.log(`[Dispatcher] Claimed run ${run._id} for job "${job.name}" (${job.workerType})`)

    try {
      const worker = workers[job.workerType]
      if (!worker) {
        console.error(`[Dispatcher] Unknown worker type: ${job.workerType}`)
        await this.client.mutation(api.runs.fail, {
          id: run._id,
          error: `Unknown worker type: ${job.workerType}`,
        })
        return
      }

      if (
        job.workerType === 'exec' &&
        (job.config as JobConfig).command === '__copilot_snapshot__'
      ) {
        await this.executeSnapshotCollection(run)
        return
      }

      await this.executeWorkerRun(run, worker, job.config as JobConfig)
    } finally {
      setImmediate(() => this.poll())
    }
  }

  private async collectAccountSnapshot(username: string, org: string): Promise<boolean> {
    const result = await fetchCopilotMetrics(org, username)
    if (!result.success) {
      console.warn(`[Dispatcher] Snapshot fetch failed for ${username}@${org}: ${result.error}`)
      return false
    }
    try {
      await this.client.mutation(api.copilotUsageHistory.store, {
        accountUsername: username,
        org: result.data.org,
        billingYear: result.data.billingYear,
        billingMonth: result.data.billingMonth,
        premiumRequests: result.data.premiumRequests,
        grossCost: result.data.grossCost,
        discount: result.data.discount,
        netCost: result.data.netCost,
        businessSeats: result.data.businessSeats,
        ...(result.data.budgetAmount != null ? { budgetAmount: result.data.budgetAmount } : {}),
        spent: result.data.spent,
      })
      return true
    } catch (storeErr) {
      console.error(
        `[Dispatcher] Snapshot store failed for ${username}@${org}: ${getErrorMessage(storeErr)}`
      )
      return false
    }
  }

  /** Collect Copilot usage snapshots and persist to copilotUsageHistory */
  private async executeSnapshotCollection(run: {
    _id: Id<'runs'>
    input?: { accounts?: Array<{ username: string; org: string }> }
  }): Promise<void> {
    const accounts = run.input?.accounts as Array<{ username: string; org: string }> | undefined
    if (!accounts || accounts.length === 0) {
      await this.client.mutation(api.runs.fail, {
        id: run._id,
        error: 'No accounts provided for snapshot collection',
      })
      return
    }

    const start = Date.now()
    let succeeded = 0
    let failed = 0

    for (const { username, org } of accounts) {
      const ok = await this.collectAccountSnapshot(username, org)
      if (ok) succeeded++
      else failed++
    }

    const duration = Date.now() - start
    console.log(
      `[Dispatcher] Snapshot collection: ${succeeded} succeeded, ${failed} failed in ${duration}ms`
    )

    await this.client.mutation(api.runs.complete, {
      id: run._id,
      output: {
        stdout: `Snapshot collection: ${succeeded} succeeded, ${failed} failed`,
        exitCode: failed > 0 ? 1 : 0,
        duration,
      },
    })
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
