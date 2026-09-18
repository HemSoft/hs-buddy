/** Recover missed schedules at startup through server-owned transactions. */
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { CONVEX_URL } from '../config'
import { getErrorMessage } from '../../src/utils/errorUtils'
import {
  type OfflineSyncResult,
  createOfflineSyncResult,
  isMissedSchedule,
  accumulateScheduleResult,
  buildOfflineSyncSummary,
} from '../../src/utils/scheduleUtils'

async function processMissedSchedules(
  client: ConvexHttpClient,
  schedules: Doc<'schedules'>[],
  result: OfflineSyncResult
): Promise<void> {
  for (const schedule of schedules) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Recover schedules sequentially to avoid a burst of bounded catch-up transactions at startup.
      const { runsCreated, action } = await client.mutation(api.schedules.recoverMissed, {
        id: schedule._id,
      })
      accumulateScheduleResult(result, runsCreated, action)
      console.log(`[OfflineSync] "${schedule.name}" → ${action}`)
    } catch (err: unknown) {
      const msg = `Failed to process "${schedule.name}": ${getErrorMessage(err)}`
      result.errors.push(msg)
      console.error(`[OfflineSync] ${msg}`)
    }
  }
}

/** Client snapshots select candidates only; Convex rechecks every schedule. */
export async function runOfflineSync(convexUrl?: string): Promise<OfflineSyncResult> {
  const client = new ConvexHttpClient(convexUrl ?? CONVEX_URL)
  const now = Date.now()
  const result = createOfflineSyncResult()

  try {
    const schedules = await client.query(api.schedules.listEnabled, {})
    const missedSchedules = schedules.filter(schedule => isMissedSchedule(schedule, now))

    if (missedSchedules.length === 0) {
      console.log('[OfflineSync] No missed schedules found')
      return result
    }

    console.log(`[OfflineSync] Processing ${missedSchedules.length} missed schedule(s)...`)
    await processMissedSchedules(client, missedSchedules, result)
    console.log(`[OfflineSync] Complete: ${buildOfflineSyncSummary(result)}`)
  } catch (err: unknown) {
    const msg = `Offline sync failed: ${getErrorMessage(err)}`
    result.errors.push(msg)
    console.error(`[OfflineSync] ${msg}`)
  }

  return result
}
