import { useCallback, useEffect, useRef, useState } from 'react'
import { GitHubClient } from '../api/github'
import { useGitHubAccounts } from './useConfig'
import { useTaskQueue } from './useTaskQueue'
import { throwIfAborted, isAbortError } from '../utils/errorUtils'
import {
  createNotificationSoundBlob,
  type NotificationSoundAsset,
} from '../utils/notificationSound'

const PENDING_REVIEW_KEY = 'hs-buddy:pending-copilot-reviews'
const COPILOT_REVIEW_POLL_MS = 15_000
const MAX_COPILOT_REVIEW_POLLS = 40

interface PendingCopilotReview {
  prUrl: string
  baselineReviewId: number
}

function savePendingReview(prUrl: string, baselineReviewId: number) {
  try {
    const all = JSON.parse(sessionStorage.getItem(PENDING_REVIEW_KEY) ?? '{}') as Record<
      string,
      PendingCopilotReview
    >
    all[prUrl] = { prUrl, baselineReviewId }
    sessionStorage.setItem(PENDING_REVIEW_KEY, JSON.stringify(all))
  } catch {
    // sessionStorage may be unavailable — polling still works
  }
}

function loadPendingReview(prUrl: string): PendingCopilotReview | null {
  try {
    const all = JSON.parse(sessionStorage.getItem(PENDING_REVIEW_KEY) ?? '{}') as Record<
      string,
      PendingCopilotReview
    >
    return all[prUrl] ?? null
  } catch {
    return null
  }
}

export function clearPendingReview(prUrl: string) {
  try {
    /* v8 ignore start */
    const all = JSON.parse(sessionStorage.getItem(PENDING_REVIEW_KEY) ?? '{}') as Record<
      /* v8 ignore stop */
      string,
      PendingCopilotReview
    >
    delete all[prUrl]
    sessionStorage.setItem(PENDING_REVIEW_KEY, JSON.stringify(all))
  } catch {
    // sessionStorage may be unavailable
  }
}

function isFreshCopilotReview(
  review: { id: number; user: { login: string } | null },
  baselineReviewId: number
): boolean {
  return review.user?.login === 'copilot-pull-request-reviewer[bot]' && review.id > baselineReviewId
}

/** Play the configured notification sound if enabled. Fire-and-forget. */
function playReviewCompleteSound() {
  void (window.ipcRenderer.invoke('config:get-notification-sound-enabled') as Promise<boolean>)
    .then(enabled => {
      if (!enabled) return
      return (
        window.ipcRenderer.invoke(
          'config:play-notification-sound'
        ) as Promise<NotificationSoundAsset | null>
      ).then(sound => {
        if (!sound) return
        const blob = createNotificationSoundBlob(sound)
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        /* v8 ignore start */
        audio.onended = () => URL.revokeObjectURL(url)
        audio.onerror = () => URL.revokeObjectURL(url)
        audio.play().catch(() => URL.revokeObjectURL(url))
        /* v8 ignore stop */
      })
    })
    .catch(() => {})
}

type CopilotReviewState = 'idle' | 'requesting' | 'monitoring' | 'done'

interface UseCopilotReviewMonitorOptions {
  prId: number
  prUrl: string
  ownerRepo: { owner: string; repo: string } | null
}

export function useCopilotReviewMonitor({
  prId,
  prUrl,
  ownerRepo,
}: UseCopilotReviewMonitorOptions) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const accountsRef = useRef(accounts)
  const enqueueRef = useRef(enqueue)
  const [copilotReviewState, setCopilotReviewState] = useState<CopilotReviewState>('idle')
  const [copilotReviewBanner, setCopilotReviewBanner] = useState<{ completedAt: number } | null>(
    null
  )
  const [refreshKey, setRefreshKey] = useState(0)
  const monitorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monitorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monitorCountRef = useRef(0)
  const monitorSessionRef = useRef(0)
  const requestSessionRef = useRef(0)

  useEffect(() => {
    accountsRef.current = accounts
  }, [accounts])

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const clearCopilotReviewTimers = useCallback(() => {
    if (monitorTimerRef.current) {
      clearTimeout(monitorTimerRef.current)
      monitorTimerRef.current = null
    }
    if (monitorTimeoutRef.current) {
      clearTimeout(monitorTimeoutRef.current)
      monitorTimeoutRef.current = null
    }
  }, [])

  const finishCopilotReviewMonitor = useCallback(
    (sessionId: number, reviewPrUrl: string) => {
      clearCopilotReviewTimers()
      /* v8 ignore start */
      if (monitorSessionRef.current !== sessionId) return
      /* v8 ignore stop */
      clearPendingReview(reviewPrUrl)
      setCopilotReviewState('done')
      setCopilotReviewBanner({ completedAt: Date.now() })
      playReviewCompleteSound()
      setRefreshKey(k => k + 1)
      monitorTimeoutRef.current = setTimeout(() => {
        /* v8 ignore start */
        if (monitorSessionRef.current !== sessionId) return
        /* v8 ignore stop */
        setCopilotReviewState('idle')
        monitorTimeoutRef.current = null
      }, 3000)
    },
    [clearCopilotReviewTimers]
  )

  const stopCopilotReviewMonitor = useCallback(() => {
    monitorSessionRef.current++
    clearCopilotReviewTimers()
  }, [clearCopilotReviewTimers])

  const startCopilotReviewMonitor = useCallback(
    ({
      ownerRepo: monitorOwnerRepo,
      prUrl: monitorPrUrl,
      baselineReviewId,
      runImmediately = false,
    }: {
      ownerRepo: { owner: string; repo: string }
      prUrl: string
      baselineReviewId: number
      runImmediately?: boolean
    }) => {
      const sessionId = monitorSessionRef.current
      setCopilotReviewState('monitoring')
      monitorCountRef.current = 0

      const findFreshCopilotReview = async () => {
        return enqueueRef.current(
          async signal => {
            throwIfAborted(signal)
            /* v8 ignore start */
            if (monitorSessionRef.current !== sessionId) return undefined
            /* v8 ignore stop */
            const client = new GitHubClient({ accounts: accountsRef.current }, 7)
            const reviews = await client.listPRReviews(
              monitorOwnerRepo.owner,
              monitorOwnerRepo.repo,
              prId
            )
            throwIfAborted(signal)
            /* v8 ignore start */
            if (monitorSessionRef.current !== sessionId) return undefined
            /* v8 ignore stop */
            return reviews.find(review => isFreshCopilotReview(review, baselineReviewId))
          },
          { name: `copilot-review-poll-${prId}` }
        )
      }

      const scheduleNextPoll = () => {
        /* v8 ignore start */
        if (monitorSessionRef.current !== sessionId) return
        /* v8 ignore stop */
        monitorTimerRef.current = setTimeout(pollOnce, COPILOT_REVIEW_POLL_MS)
      }

      const pollOnce = async () => {
        /* v8 ignore start */
        if (monitorSessionRef.current !== sessionId) return
        /* v8 ignore stop */
        monitorCountRef.current++
        if (monitorCountRef.current > MAX_COPILOT_REVIEW_POLLS) {
          clearCopilotReviewTimers()
          clearPendingReview(monitorPrUrl)
          /* v8 ignore start */
          if (monitorSessionRef.current === sessionId) setCopilotReviewState('idle')
          /* v8 ignore stop */
          return
        }
        try {
          const freshCopilotReview = await findFreshCopilotReview()
          if (freshCopilotReview) {
            finishCopilotReviewMonitor(sessionId, monitorPrUrl)
            return
          }
        } catch (pollErr) {
          /* v8 ignore start */
          if (isAbortError(pollErr)) return
          /* v8 ignore stop */
          console.debug('Copilot review poll failed:', pollErr)
        }
        scheduleNextPoll()
      }

      if (runImmediately) {
        void (async () => {
          try {
            const freshCopilotReview = await findFreshCopilotReview()
            if (freshCopilotReview) {
              finishCopilotReviewMonitor(sessionId, monitorPrUrl)
              return
            }
            /* v8 ignore start */
          } catch (pollErr) {
            /* v8 ignore stop */
            /* v8 ignore start */
            if (isAbortError(pollErr)) return
            /* v8 ignore stop */
            console.debug('Copilot review poll failed:', pollErr)
          }
          scheduleNextPoll()
        })()
        return
      }

      scheduleNextPoll()
    },
    [clearCopilotReviewTimers, finishCopilotReviewMonitor, prId]
  )

  // Clean up monitor timers and restore pending review on PR change
  useEffect(() => {
    requestSessionRef.current++
    stopCopilotReviewMonitor()
    setCopilotReviewState('idle')
    setCopilotReviewBanner(null)

    const pending = loadPendingReview(prUrl)
    if (pending && ownerRepo) {
      startCopilotReviewMonitor({
        ownerRepo,
        prUrl,
        baselineReviewId: pending.baselineReviewId,
        runImmediately: true,
      })
    }

    return stopCopilotReviewMonitor
  }, [prId, prUrl, ownerRepo, startCopilotReviewMonitor, stopCopilotReviewMonitor])

  const handleRequestCopilotReview = useCallback(async () => {
    if (!ownerRepo || copilotReviewState !== 'idle') return
    const requestId = requestSessionRef.current
    setCopilotReviewState('requesting')
    try {
      await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const c0 = new GitHubClient({ accounts: accountsRef.current }, 7)
          const existingReviews = await c0.listPRReviews(ownerRepo.owner, ownerRepo.repo, prId)
          const baselineReviewId = existingReviews
            .filter(r => r.user?.login === 'copilot-pull-request-reviewer[bot]')
            .reduce((max, r) => Math.max(max, r.id), 0)

          throwIfAborted(signal)
          /* v8 ignore start */
          if (requestSessionRef.current !== requestId) return
          /* v8 ignore stop */

          const c = new GitHubClient({ accounts: accountsRef.current }, 7)
          await c.requestCopilotReview(ownerRepo.owner, ownerRepo.repo, prId)

          throwIfAborted(signal)
          /* v8 ignore start */
          if (requestSessionRef.current !== requestId) return
          /* v8 ignore stop */

          savePendingReview(prUrl, baselineReviewId)
          startCopilotReviewMonitor({
            ownerRepo,
            prUrl,
            baselineReviewId,
          })
        },
        { name: `copilot-review-request-${prId}` }
      )
    } catch (err) {
      /* v8 ignore start */
      if (isAbortError(err)) return
      /* v8 ignore stop */
      console.error('Failed to request Copilot review:', err)
      setCopilotReviewState('idle')
    }
  }, [prUrl, prId, copilotReviewState, ownerRepo, startCopilotReviewMonitor])

  return {
    copilotReviewState,
    copilotReviewBanner,
    setCopilotReviewBanner,
    refreshKey,
    setRefreshKey,
    handleRequestCopilotReview,
  }
}
