import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { GitHubClient } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import type { PRDetailInfo } from '../utils/prDetailView'
import type { PRDetailSection } from '../utils/prDetailView'
import type { PRHistorySummary, PRLinkedIssue } from '../api/github'
import { formatDistanceToNow, formatDateFull } from '../utils/dateUtils'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
import {
  createNotificationSoundBlob,
  type NotificationSoundAsset,
} from '../utils/notificationSound'
import { throwIfAborted } from '../utils/errorUtils'
import { PullRequestHistoryPanel } from './PullRequestHistoryPanel'
import { PRChecksPanel } from './PRChecksPanel'
import { PRFilesChangedPanel } from './PRFilesChangedPanel'
import { PRThreadsPanel } from './PRThreadsPanel'
import { PRReviewsPanel } from './PRReviewsPanel'
import './PullRequestDetailPanel.css'

interface PullRequestDetailPanelProps {
  pr: PRDetailInfo
  section?: PRDetailSection | null
}

const SECTION_LABELS: Record<PRDetailSection, string> = {
  conversation: 'Conversation',
  commits: 'Commits',
  checks: 'Checks',
  'files-changed': 'Files changed',
  'ai-reviews': 'AI Reviews',
}

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

function clearPendingReview(prUrl: string) {
  try {
    const all = JSON.parse(sessionStorage.getItem(PENDING_REVIEW_KEY) ?? '{}') as Record<
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
        audio.onended = () => URL.revokeObjectURL(url)
        audio.onerror = () => URL.revokeObjectURL(url)
        audio.play().catch(() => URL.revokeObjectURL(url))
      })
    })
    .catch(() => {})
}

function formatRelative(date: string | null): string {
  if (!date) return ''
  return formatDistanceToNow(date)
}

export function PullRequestDetailPanel({ pr, section = null }: PullRequestDetailPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)

  const [branches, setBranches] = useState<{ headBranch: string; baseBranch: string } | null>(
    pr.headBranch && pr.baseBranch ? { headBranch: pr.headBranch, baseBranch: pr.baseBranch } : null
  )
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState<string | null>(null)
  const [youApproved, setYouApproved] = useState(pr.iApproved)
  const [linkedIssues, setLinkedIssues] = useState<PRLinkedIssue[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [copilotReviewState, setCopilotReviewState] = useState<
    'idle' | 'requesting' | 'monitoring' | 'done'
  >('idle')
  const [copilotReviewBanner, setCopilotReviewBanner] = useState<{
    completedAt: number
  } | null>(null)
  const monitorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monitorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monitorCountRef = useRef(0)
  const monitorSessionRef = useRef(0)
  const accountsRef = useRef(accounts)

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
    (sessionId: number, prUrl: string) => {
      clearCopilotReviewTimers()
      if (monitorSessionRef.current !== sessionId) return

      clearPendingReview(prUrl)
      setCopilotReviewState('done')
      setCopilotReviewBanner({ completedAt: Date.now() })
      playReviewCompleteSound()
      setRefreshKey(k => k + 1)
      monitorTimeoutRef.current = setTimeout(() => {
        if (monitorSessionRef.current !== sessionId) return
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
      ownerRepo,
      prUrl,
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
        const client = new GitHubClient({ accounts: accountsRef.current }, 7)
        const reviews = await client.listPRReviews(ownerRepo.owner, ownerRepo.repo, pr.id)
        return reviews.find(review => isFreshCopilotReview(review, baselineReviewId))
      }

      const scheduleNextPoll = () => {
        if (monitorSessionRef.current !== sessionId) return
        monitorTimerRef.current = setTimeout(pollOnce, COPILOT_REVIEW_POLL_MS)
      }

      const pollOnce = async () => {
        if (monitorSessionRef.current !== sessionId) return

        monitorCountRef.current++
        if (monitorCountRef.current > MAX_COPILOT_REVIEW_POLLS) {
          clearCopilotReviewTimers()
          clearPendingReview(prUrl)
          if (monitorSessionRef.current === sessionId) setCopilotReviewState('idle')
          return
        }

        try {
          const freshCopilotReview = await findFreshCopilotReview()
          if (freshCopilotReview) {
            finishCopilotReviewMonitor(sessionId, prUrl)
            return
          }
        } catch (pollErr) {
          console.debug('Copilot review poll failed:', pollErr)
        }

        scheduleNextPoll()
      }

      if (runImmediately) {
        void (async () => {
          try {
            const freshCopilotReview = await findFreshCopilotReview()
            if (freshCopilotReview) {
              finishCopilotReviewMonitor(sessionId, prUrl)
              return
            }
          } catch (pollErr) {
            console.debug('Copilot review poll failed:', pollErr)
          }

          scheduleNextPoll()
        })()
        return
      }

      scheduleNextPoll()
    },
    [clearCopilotReviewTimers, finishCopilotReviewMonitor, pr.id]
  )

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    accountsRef.current = accounts
  }, [accounts])

  useEffect(() => {
    setYouApproved(pr.iApproved)
  }, [pr.id, pr.url, pr.iApproved])

  useEffect(() => {
    setHistoryUpdatedAt(null)
    setLinkedIssues([])
  }, [pr.id, pr.repository, pr.url])

  const fetchBranches = useCallback(async () => {
    if (pr.headBranch && pr.baseBranch) {
      setBranches({ headBranch: pr.headBranch, baseBranch: pr.baseBranch })
      return
    }

    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo) {
      setBranches(null)
      return
    }

    try {
      const result = await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRBranches(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `pr-branches-${pr.repository}-${pr.id}` }
      )
      setBranches(result)
    } catch {
      setBranches(null)
    }
  }, [accounts, pr.id, pr.repository, pr.url, pr.headBranch, pr.baseBranch])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  // Clean up monitor timers and reset state on unmount or PR change
  useEffect(() => {
    stopCopilotReviewMonitor()
    setCopilotReviewState('idle')
    setCopilotReviewBanner(null)

    // Check sessionStorage for a pending review request from a previous mount
    const pending = loadPendingReview(pr.url)
    if (pending) {
      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      if (ownerRepo) {
        startCopilotReviewMonitor({
          ownerRepo,
          prUrl: pr.url,
          baselineReviewId: pending.baselineReviewId,
          runImmediately: true,
        })
      }
    }

    return stopCopilotReviewMonitor
  }, [pr.id, pr.url, startCopilotReviewMonitor, stopCopilotReviewMonitor])

  const handleRequestCopilotReview = useCallback(async () => {
    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo || copilotReviewState !== 'idle') return
    setCopilotReviewState('requesting')
    try {
      // Snapshot the highest existing Copilot review ID (server-side baseline)
      // so detection is immune to client clock skew
      const c0 = new GitHubClient({ accounts: accountsRef.current }, 7)
      const existingReviews = await c0.listPRReviews(ownerRepo.owner, ownerRepo.repo, pr.id)
      const baselineReviewId = existingReviews
        .filter(r => r.user?.login === 'copilot-pull-request-reviewer[bot]')
        .reduce((max, r) => Math.max(max, r.id), 0)

      await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const c = new GitHubClient({ accounts: accountsRef.current }, 7)
          await c.requestCopilotReview(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `copilot-review-${pr.repository}-${pr.id}` }
      )

      // Enter monitor mode — use self-scheduling setTimeout to avoid overlap
      savePendingReview(pr.url, baselineReviewId)
      startCopilotReviewMonitor({
        ownerRepo,
        prUrl: pr.url,
        baselineReviewId,
      })
    } catch (err) {
      console.error('Failed to request Copilot review:', err)
      setCopilotReviewState('idle')
    }
  }, [pr.url, pr.repository, pr.id, copilotReviewState, startCopilotReviewMonitor])

  const activityAt = historyUpdatedAt || pr.updatedAt || pr.date || pr.created
  const activityRelative = formatRelative(activityAt)
  const createdRelative = formatRelative(pr.created)
  const stateLabel = pr.state?.trim() || 'open'
  const sectionLabel = section ? (SECTION_LABELS[section] ?? null) : null
  const checksUrl = `${pr.url}/checks`
  const filesChangedUrl = `${pr.url}/files`
  const isFocusedSection = section !== null
  const showOverview = !isFocusedSection

  // Derive effective linked issue: prefer API data, fall back to branch name parsing
  const branchIssue = (() => {
    if (linkedIssues.length > 0) return null
    const branch = branches?.headBranch || pr.headBranch
    if (!branch) return null
    const match = branch.match(/issue-(\d+)/)
    if (!match) return null
    const num = Number(match[1])
    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo) return null
    return {
      number: num,
      title: '',
      url: `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}/issues/${num}`,
    }
  })()
  const effectiveIssue = linkedIssues[0] ?? branchIssue

  const handleHistoryLoaded = useCallback(
    (history: PRHistorySummary) => {
      setHistoryUpdatedAt(history.updatedAt || null)
      setLinkedIssues(history.linkedIssues)

      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      const namespace = pr.org || ownerRepo?.owner || ''

      const scopedAccounts = namespace
        ? accounts.filter(account => account.org.toLowerCase() === namespace.toLowerCase())
        : []

      const candidateLogins = new Set(
        (scopedAccounts.length > 0 ? scopedAccounts : accounts).map(account =>
          account.username.toLowerCase()
        )
      )

      if (candidateLogins.size === 0) {
        return
      }

      const approvedByYou = history.reviewers.some(
        reviewer =>
          reviewer.status === 'approved' && candidateLogins.has(reviewer.login.toLowerCase())
      )

      setYouApproved(approvedByYou)
    },
    [accounts, pr.org, pr.url]
  )

  return (
    <div className="pr-detail-container">
      <div className="pr-detail-header">
        <div className="pr-detail-title-wrap">
          <div className="pr-detail-title-row">
            <h2 className="pr-detail-title">
              <GitPullRequest size={18} />
              <span className="pr-detail-title-text">{pr.title}</span>
              <span className="pr-detail-pr-number">#{pr.id}</span>
            </h2>
            <span className={`pr-detail-state-badge pr-detail-state-${stateLabel.toLowerCase()}`}>
              {stateLabel}
            </span>
          </div>
          <div className="pr-detail-subtitle">
            <span className="pr-detail-author">{pr.author}</span>
            <span className="pr-detail-dot">·</span>
            <span>{pr.org || pr.source}</span>
            <span className="pr-detail-dot">·</span>
            <span>{pr.repository}</span>
            {branches?.baseBranch && branches?.headBranch && (
              <>
                <span className="pr-detail-dot">·</span>
                <span className="pr-detail-branch-flow">
                  <GitBranch size={12} />
                  into <strong>{branches.baseBranch}</strong> from{' '}
                  <strong>{branches.headBranch}</strong>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="pr-detail-header-actions">
          <button
            className={`pr-detail-refresh-btn${
              copilotReviewState === 'monitoring' ? ' pr-detail-copilot-monitoring' : ''
            }${copilotReviewState === 'done' ? ' pr-detail-copilot-done' : ''}`}
            onClick={handleRequestCopilotReview}
            title={
              copilotReviewState === 'requesting'
                ? 'Requesting Copilot review…'
                : copilotReviewState === 'monitoring'
                  ? 'Waiting for Copilot review…'
                  : copilotReviewState === 'done'
                    ? 'Copilot review complete!'
                    : 'Request Copilot Review'
            }
            disabled={copilotReviewState !== 'idle'}
          >
            {copilotReviewState === 'requesting' ? (
              <Loader2 size={14} className="pr-detail-spin" />
            ) : copilotReviewState === 'done' ? (
              <CheckCircle2 size={14} />
            ) : (
              <Sparkles size={14} className={copilotReviewState === 'monitoring' ? 'pulse' : ''} />
            )}
          </button>
          <button
            className="pr-detail-refresh-btn"
            onClick={() => setRefreshKey(k => k + 1)}
            title="Refresh PR data"
          >
            <RefreshCw size={14} />
          </button>
          <button className="pr-detail-open-btn" onClick={() => window.shell.openExternal(pr.url)}>
            <ExternalLink size={14} />
            Open on GitHub
          </button>
        </div>
      </div>

      {copilotReviewBanner && (
        <div className="pr-detail-review-banner">
          <div className="pr-detail-review-banner-content">
            <CheckCircle2 size={16} />
            <div className="pr-detail-review-banner-text">
              <strong>Copilot review complete</strong>
              <span>
                Finished {formatDistanceToNow(copilotReviewBanner.completedAt)} — page refreshed
                with latest data
              </span>
            </div>
          </div>
          <button
            className="pr-detail-review-banner-dismiss"
            onClick={() => {
              setCopilotReviewBanner(null)
              clearPendingReview(pr.url)
            }}
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {sectionLabel && (
        <div className="pr-detail-section-note">
          <span>Tree section: {sectionLabel}</span>
          {section === 'checks' && (
            <button
              className="pr-detail-open-btn"
              onClick={() => window.shell.openExternal(checksUrl)}
            >
              <ExternalLink size={14} />
              Open Checks
            </button>
          )}
          {section === 'files-changed' && (
            <button
              className="pr-detail-open-btn"
              onClick={() => window.shell.openExternal(filesChangedUrl)}
            >
              <ExternalLink size={14} />
              Open Files Changed
            </button>
          )}
        </div>
      )}

      {showOverview && (
        <>
          <div className="pr-detail-grid">
            <div className="pr-detail-card">
              <div className="pr-detail-card-title">Status</div>
              <div className="pr-detail-card-value pr-detail-state">{pr.state}</div>
            </div>
            <div className="pr-detail-card">
              <div className="pr-detail-card-title">Approvals</div>
              <div className="pr-detail-card-value">
                {pr.approvalCount}/{pr.assigneeCount > 0 ? pr.assigneeCount : '?'}
              </div>
            </div>
            <div className="pr-detail-card">
              <div className="pr-detail-card-title">You Approved</div>
              <div className="pr-detail-card-value">{youApproved ? 'Yes' : 'No'}</div>
            </div>
            <div
              className={`pr-detail-card${effectiveIssue ? ' pr-detail-card-interactive' : ''}`}
              role={effectiveIssue ? 'button' : undefined}
              tabIndex={effectiveIssue ? 0 : undefined}
              onClick={
                effectiveIssue ? () => window.shell.openExternal(effectiveIssue.url) : undefined
              }
              onKeyDown={
                effectiveIssue
                  ? (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        window.shell.openExternal(effectiveIssue.url)
                      }
                    }
                  : undefined
              }
              title={
                effectiveIssue
                  ? `Open Issue #${effectiveIssue.number} on GitHub`
                  : 'No linked issue'
              }
            >
              <div className="pr-detail-card-title">
                <CircleDot size={12} />
                Linked Issue
              </div>
              <div className="pr-detail-card-value">
                {effectiveIssue ? (
                  <span className="pr-detail-linked-issue">#{effectiveIssue.number}</span>
                ) : (
                  <span className="pr-detail-card-secondary">None</span>
                )}
              </div>
            </div>
          </div>

          <div className="pr-detail-meta-list">
            <div className="pr-detail-meta-item pr-detail-meta-item-author">
              <div className="pr-detail-meta-label">
                <User size={14} />
                Author
              </div>
              <div className="pr-detail-meta-value">
                {pr.authorAvatarUrl && (
                  <img src={pr.authorAvatarUrl} alt={pr.author} className="pr-detail-avatar" />
                )}
                <span className="pr-detail-author-text">{pr.author}</span>
              </div>
            </div>
            <div className="pr-detail-meta-item">
              <div className="pr-detail-meta-label">
                <Clock size={14} />
                Created
                {createdRelative && (
                  <span className="pr-detail-meta-relative">({createdRelative})</span>
                )}
              </div>
              <div className="pr-detail-meta-value">{formatDateFull(pr.created)}</div>
            </div>
            <div className="pr-detail-meta-item">
              <div className="pr-detail-meta-label">
                <Check size={14} />
                Last Activity
                {activityRelative && (
                  <span className="pr-detail-meta-relative">({activityRelative})</span>
                )}
              </div>
              <div className="pr-detail-meta-value">{formatDateFull(activityAt)}</div>
            </div>
          </div>
        </>
      )}

      {section === 'conversation' && <PRThreadsPanel key={refreshKey} pr={pr} />}
      {section === 'commits' && (
        <PullRequestHistoryPanel
          key={refreshKey}
          pr={pr}
          embedded
          focus="commits"
          onLoaded={handleHistoryLoaded}
        />
      )}
      {section === 'checks' && <PRChecksPanel key={refreshKey} pr={pr} />}
      {section === 'files-changed' && <PRFilesChangedPanel key={refreshKey} pr={pr} />}
      {section === 'ai-reviews' && <PRReviewsPanel key={refreshKey} pr={pr} />}

      {!isFocusedSection && (
        <>
          <PullRequestHistoryPanel
            key={refreshKey}
            pr={pr}
            embedded
            onLoaded={handleHistoryLoaded}
          />
          <PRThreadsPanel key={`threads-${refreshKey}`} pr={pr} />
        </>
      )}
    </div>
  )
}
