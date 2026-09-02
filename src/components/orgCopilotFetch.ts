import { startTransition, type Dispatch } from 'react'
import type { useTaskQueue } from '../hooks/useTaskQueue'
import { dataCache } from '../services/dataCache'
import { getTaskQueue } from '../services/taskQueue'
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'
import { orgCopilotReducer, type OrgCopilotUsageData } from './orgDetailReducer'

type CopilotDispatch = Dispatch<Parameters<typeof orgCopilotReducer>[1]>

/* v8 ignore start */
function handleCopilotSuccess(
  data: {
    org: string
    premiumRequests: number
    grossCost: number
    discount: number
    netCost: number
    businessSeats: number
    fetchedAt: number
  },
  dispatch: CopilotDispatch,
  cacheKey: string
) {
  const metrics: OrgCopilotUsageData = {
    org: data.org,
    premiumRequests: data.premiumRequests,
    grossCost: data.grossCost,
    discount: data.discount,
    netCost: data.netCost,
    businessSeats: data.businessSeats,
    fetchedAt: data.fetchedAt,
  }
  startTransition(() => {
    dispatch({ type: 'success', usage: metrics })
  })
  dataCache.set(cacheKey, metrics)
}
/* v8 ignore stop */

export function getCachedCopilotData(cacheKey: string): OrgCopilotUsageData | null {
  return dataCache.get<OrgCopilotUsageData>(cacheKey)?.data ?? null
}

/* v8 ignore start */
function handleCopilotFetchResult(
  result: { success: boolean; data?: Parameters<typeof handleCopilotSuccess>[0] },
  dispatch: CopilotDispatch,
  cacheKey: string
) {
  if (result.success && result.data) {
    handleCopilotSuccess(result.data, dispatch, cacheKey)
  } else {
    dispatch({ type: 'error', error: null })
  }
}

function handleCopilotCatchError(error: unknown, dispatch: CopilotDispatch) {
  if (isAbortError(error)) return
  dispatch({ type: 'error', error: getErrorMessage(error) })
}
/* v8 ignore stop */

async function hydrateCachedCopilot(
  cacheKey: string,
  dispatchCopilot: CopilotDispatch,
  isCurrent?: () => boolean
): Promise<'stale' | 'hydrated' | 'miss'> {
  const cached = (await dataCache.getOrLoad<OrgCopilotUsageData>(cacheKey))?.data
  if (isCurrent?.() === false) return 'stale'
  if (!cached) return 'miss'
  dispatchCopilot({ type: 'hydrate-cache', usage: cached })
  return 'hydrated'
}

function shouldStopAfterCacheHydration(
  result: 'stale' | 'hydrated' | 'miss',
  forceRefresh: boolean
): boolean {
  return result === 'stale' || (result === 'hydrated' && !forceRefresh)
}

function resolveCopilotHasUsage(
  hasUsage: boolean,
  cacheResult: 'stale' | 'hydrated' | 'miss'
): boolean {
  return hasUsage || cacheResult === 'hydrated'
}

export async function runCopilotFetch({
  org,
  preferredAccount,
  forceRefresh,
  isUserNamespace,
  copilotCacheKey,
  copilotTaskName,
  enqueue,
  hasUsage,
  dispatchCopilot,
  isCurrent,
}: {
  org: string
  preferredAccount?: string
  forceRefresh: boolean
  isUserNamespace: boolean
  copilotCacheKey: string
  copilotTaskName: string
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  hasUsage: boolean
  dispatchCopilot: CopilotDispatch
  isCurrent?: () => boolean
}): Promise<void> {
  if (isUserNamespace) return
  const cacheResult = await hydrateCachedCopilot(copilotCacheKey, dispatchCopilot, isCurrent)
  if (shouldStopAfterCacheHydration(cacheResult, forceRefresh)) return
  const queue = getTaskQueue('github')
  if (queue.hasTaskWithName(copilotTaskName)) return
  dispatchCopilot({
    type: 'start-loading',
    hasUsage: resolveCopilotHasUsage(hasUsage, cacheResult),
  })
  try {
    const result = await enqueue(
      async signal => {
        throwIfAborted(signal)
        return await window.github.getCopilotUsage(org, preferredAccount)
      },
      { name: copilotTaskName, priority: -1 }
    )
    if (isCurrent?.() === false) return
    handleCopilotFetchResult(result, dispatchCopilot, copilotCacheKey)
  } catch (fetchError: unknown) {
    if (isCurrent?.() === false) return
    handleCopilotCatchError(fetchError, dispatchCopilot)
  }
}
