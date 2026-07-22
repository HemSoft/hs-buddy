import { useCallback, useEffect, useRef, useState } from 'react'
import { GitHubClient } from '../api/github/client'
import { useGitHubAccounts } from './useConfig'
import { useTaskQueue } from './useTaskQueue'
import { throwIfAborted, isAbortError } from '../utils/errorUtils'
import {
  createNotificationSoundBlob,
  type NotificationSoundAsset,
} from '../utils/notificationSound'
import type { AIReviewProvider, PollResult, ReviewCheckpoint } from '../reviewProviders/types'
import { IPC_INVOKE } from '../ipc/contracts'

const STORAGE_KEY = 'hs-buddy:pending-ai-reviews'
const DEFAULT_POLL_MS = 15_000
const DEFAULT_MAX_POLLS = 40

function isPollCompleted(result: PollResult | undefined): boolean {
  return result?.status === 'completed'
}

function isPollFailed(result: PollResult | undefined): boolean {
  return result?.status === 'failed'
}

function isAIReviewMonitorStale(
  monitorSessionRef: { current: number },
  sessionId: number
): boolean {
  return monitorSessionRef.current !== sessionId
}

function didAbortAIReviewPoll(providerName: string, error: unknown): boolean {
  if (isAbortError(error)) return true
  console.debug(`${providerName} review poll failed:`, error)
  return false
}

async function shouldContinueAIReviewPolling(
  doPoll: () => Promise<PollResult | undefined>,
  handlePollResult: (result: PollResult | undefined) => 'stop' | 'continue',
  providerName: string
): Promise<boolean> {
  try {
    const result = await doPoll()
    return handlePollResult(result) !== 'stop'
  } catch (error: unknown) {
    if (didAbortAIReviewPoll(providerName, error)) return false
  }
  return true
}

interface PendingReview {
  providerId: string
  prUrl: string
  checkpoint: ReviewCheckpoint
}

function storageKey(providerId: string, prUrl: string): string {
  return `${providerId}:${prUrl}`
}

function savePendingReview(providerId: string, prUrl: string, checkpoint: ReviewCheckpoint) {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      PendingReview
    >
    all[storageKey(providerId, prUrl)] = { providerId, prUrl, checkpoint }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch (_: unknown) {
    // sessionStorage may be unavailable — polling still works in-memory
  }
}

function loadPendingReview(providerId: string, prUrl: string): PendingReview | null {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      PendingReview
    >
    return all[storageKey(providerId, prUrl)] ?? null
  } catch (_: unknown) {
    return null
  }
}

export function clearPendingAIReview(providerId: string, prUrl: string) {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      PendingReview
    >
    delete all[storageKey(providerId, prUrl)]
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch (_: unknown) {
    // sessionStorage may be unavailable
  }
}

/** Play the configured notification sound if enabled. Fire-and-forget. */
/* v8 ignore start — audio playback requires native IPC not available in unit tests */
function playReviewCompleteSound() {
  void (
    window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_NOTIFICATION_SOUND_ENABLED) as Promise<boolean>
  )
    .then(enabled => {
      if (!enabled) return
      return (
        window.ipcRenderer.invoke(
          IPC_INVOKE.CONFIG_PLAY_NOTIFICATION_SOUND
        ) as Promise<NotificationSoundAsset | null>
      ).then(sound => {
        if (!sound) return
        const blob = createNotificationSoundBlob(sound)
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => URL.revokeObjectURL(url)
        audio.onerror = () => URL.revokeObjectURL(url)
        audio.play().catch(() => URL.revokeObjectURL(url))
      })
    })
    .catch(() => {})
}
/* v8 ignore stop */

export type AIReviewState = 'idle' | 'requesting' | 'monitoring' | 'done'

function buildAIReviewMonitorResetKey(
  providerId: string,
  prId: number,
  prUrl: string,
  ownerRepo: { owner: string; repo: string } | null
): string {
  return `${providerId}:${prId}:${prUrl}:${ownerRepo?.owner ?? ''}:${ownerRepo?.repo ?? ''}`
}

function useResetAIReviewMonitorState(
  monitorResetKey: string,
  setReviewState: (state: AIReviewState) => void,
  setReviewBanner: (banner: { completedAt: number } | null) => void
) {
  /* v8 ignore start */
  useEffect(() => {
    setReviewState('idle')
    setReviewBanner(null)
  }, [monitorResetKey, setReviewState, setReviewBanner])
  /* v8 ignore stop */
}

interface UseAIReviewMonitorOptions {
  provider: AIReviewProvider
  prId: number
  prUrl: string
  ownerRepo: { owner: string; repo: string } | null
  pollIntervalMs?: number
  maxPolls?: number
}

export function useAIReviewMonitor({
  provider,
  prId,
  prUrl,
  ownerRepo,
  pollIntervalMs = DEFAULT_POLL_MS,
  maxPolls = DEFAULT_MAX_POLLS,
}: UseAIReviewMonitorOptions) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const accountsRef = useRef(accounts)
  const enqueueRef = useRef(enqueue)
  const [reviewState, setReviewState] = useState<AIReviewState>('idle')
  const [reviewBanner, setReviewBanner] = useState<{ completedAt: number } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const monitorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monitorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monitorCountRef = useRef(0)
  const monitorSessionRef = useRef(0)
  const requestSessionRef = useRef(0)
  const monitorResetKey = buildAIReviewMonitorResetKey(provider.id, prId, prUrl, ownerRepo)
  useResetAIReviewMonitorState(monitorResetKey, setReviewState, setReviewBanner)

  useEffect(() => {
    accountsRef.current = accounts
  }, [accounts])
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const clearTimers = useCallback(() => {
    if (monitorTimerRef.current) {
      clearTimeout(monitorTimerRef.current)
      monitorTimerRef.current = null
    }
    if (monitorTimeoutRef.current) {
      clearTimeout(monitorTimeoutRef.current)
      monitorTimeoutRef.current = null
    }
  }, [])

  const finishMonitor = useCallback(
    (sessionId: number, reviewPrUrl: string) => {
      clearTimers()
      /* v8 ignore start */
      if (monitorSessionRef.current !== sessionId) return
      /* v8 ignore stop */
      clearPendingAIReview(provider.id, reviewPrUrl)
      setReviewState('done')
      setReviewBanner({ completedAt: Date.now() })
      playReviewCompleteSound()
      setRefreshKey(k => k + 1)
      monitorTimeoutRef.current = setTimeout(() => {
        /* v8 ignore start */ if (monitorSessionRef.current !== sessionId) return
        /* v8 ignore stop */ setReviewState('idle')
        monitorTimeoutRef.current = null
      }, 3000)
    },
    [clearTimers, provider.id]
  )

  const stopMonitor = useCallback(() => {
    monitorSessionRef.current++
    clearTimers()
  }, [clearTimers])

  const startMonitor = useCallback(
    ({
      ownerRepo: monitorOwnerRepo,
      prUrl: monitorPrUrl,
      checkpoint,
      runImmediately = false,
    }: {
      ownerRepo: { owner: string; repo: string }
      prUrl: string
      checkpoint: ReviewCheckpoint
      runImmediately?: boolean
    }) => {
      const sessionId = monitorSessionRef.current
      setReviewState('monitoring')
      monitorCountRef.current = 0
      const doPoll = async () =>
        enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            /* v8 ignore start */
            if (monitorSessionRef.current !== sessionId) return undefined
            /* v8 ignore stop */
            const client = new GitHubClient({ accounts: accountsRef.current }, 7)
            const result = await provider.poll(
              client,
              monitorOwnerRepo.owner,
              monitorOwnerRepo.repo,
              prId,
              checkpoint
            )
            throwIfAborted(signal)
            /* v8 ignore start */
            if (monitorSessionRef.current !== sessionId) return undefined
            /* v8 ignore stop */
            return result
          },
          { name: `${provider.id}-review-poll-${prId}` }
        )
      const handlePollResult = (result: PollResult | undefined): 'stop' | 'continue' => {
        if (isPollCompleted(result)) {
          finishMonitor(sessionId, monitorPrUrl)
          return 'stop'
        }
        if (isPollFailed(result)) {
          clearTimers()
          clearPendingAIReview(provider.id, monitorPrUrl)
          /* v8 ignore next */ if (monitorSessionRef.current === sessionId) setReviewState('idle')
          return 'stop'
        }
        return 'continue'
      }
      const scheduleNextPoll = () => {
        /* v8 ignore start */ if (monitorSessionRef.current !== sessionId) return
        /* v8 ignore stop */ monitorTimerRef.current = setTimeout(pollOnce, pollIntervalMs)
      }
      const pollOnce = async () => {
        /* v8 ignore start */ if (isAIReviewMonitorStale(monitorSessionRef, sessionId)) return
        /* v8 ignore stop */ monitorCountRef.current++
        if (monitorCountRef.current > maxPolls) {
          clearTimers()
          clearPendingAIReview(provider.id, monitorPrUrl)
          /* v8 ignore start */ if (monitorSessionRef.current === sessionId) setReviewState('idle')
          /* v8 ignore stop */ return
        }
        if (!(await shouldContinueAIReviewPolling(doPoll, handlePollResult, provider.name))) return
        scheduleNextPoll()
      }
      if (runImmediately) {
        void shouldContinueAIReviewPolling(doPoll, handlePollResult, provider.name).then(cont => {
          if (cont) scheduleNextPoll()
        })
        return
      }
      scheduleNextPoll()
    },
    [clearTimers, finishMonitor, prId, provider, pollIntervalMs, maxPolls]
  )

  useEffect(() => {
    requestSessionRef.current++
    stopMonitor()
    const pending = loadPendingReview(provider.id, prUrl)
    if (pending && ownerRepo)
      startMonitor({ ownerRepo, prUrl, checkpoint: pending.checkpoint, runImmediately: true })
    return stopMonitor
  }, [prId, prUrl, ownerRepo, provider.id, startMonitor, stopMonitor])

  const handleRequestReview = useCallback(async () => {
    if (!ownerRepo || reviewState !== 'idle') return
    const requestId = requestSessionRef.current
    setReviewState('requesting')
    try {
      await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts: accountsRef.current }, 7)
          const checkpoint = await provider.getCheckpoint(
            client,
            ownerRepo.owner,
            ownerRepo.repo,
            prId
          )
          throwIfAborted(signal)
          /* v8 ignore start */ if (requestSessionRef.current !== requestId)
            return /* v8 ignore stop */
          await provider.trigger(client, ownerRepo.owner, ownerRepo.repo, prId)
          throwIfAborted(signal)
          /* v8 ignore start */ if (requestSessionRef.current !== requestId)
            return /* v8 ignore stop */
          savePendingReview(provider.id, prUrl, checkpoint)
          startMonitor({ ownerRepo, prUrl, checkpoint })
        },
        { name: `${provider.id}-review-request-${prId}` }
      )
    } catch (err: unknown) {
      /* v8 ignore start */ if (isAbortError(err)) return
      /* v8 ignore stop */ console.error(`Failed to request ${provider.name} review:`, err)
      setReviewState('idle')
    }
  }, [prUrl, prId, reviewState, ownerRepo, provider, startMonitor])

  return {
    reviewState,
    reviewBanner,
    setReviewBanner,
    refreshKey,
    setRefreshKey,
    handleRequestReview,
  }
}
