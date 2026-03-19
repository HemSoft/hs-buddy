import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  MinusCircle,
  PlayCircle,
  XCircle,
} from 'lucide-react'
import { GitHubClient, type PRChecksSummary } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import type { PRDetailInfo } from '../utils/prDetailView'
import { formatDistanceToNow, formatDateFull } from '../utils/dateUtils'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
import './PRChecksPanel.css'

interface PRChecksPanelProps {
  pr: PRDetailInfo
}

type CheckTone = 'success' | 'failure' | 'pending' | 'neutral'

function getCheckRunStatus(run: PRChecksSummary['checkRuns'][number]): {
  label: string
  tone: CheckTone
  icon: typeof CheckCircle2
} {
  if (run.status !== 'completed') {
    return {
      label: run.status === 'in_progress' ? 'In progress' : 'Queued',
      tone: 'pending',
      icon: PlayCircle,
    }
  }

  switch (run.conclusion) {
    case 'success':
      return { label: 'Passed', tone: 'success', icon: CheckCircle2 }
    case 'failure':
    case 'timed_out':
    case 'startup_failure':
    case 'action_required':
    case 'cancelled':
    case 'stale':
      return { label: run.conclusion.replace(/_/g, ' '), tone: 'failure', icon: XCircle }
    case 'neutral':
    case 'skipped':
      return { label: run.conclusion, tone: 'neutral', icon: MinusCircle }
    default:
      return { label: run.conclusion || 'Completed', tone: 'neutral', icon: MinusCircle }
  }
}

function getStatusContextState(state: string): {
  label: string
  tone: CheckTone
  icon: typeof CheckCircle2
} {
  switch (state) {
    case 'success':
      return { label: 'Passed', tone: 'success', icon: CheckCircle2 }
    case 'failure':
    case 'error':
      return { label: state === 'error' ? 'Error' : 'Failed', tone: 'failure', icon: XCircle }
    case 'pending':
      return { label: 'Pending', tone: 'pending', icon: Clock3 }
    default:
      return { label: state, tone: 'neutral', icon: MinusCircle }
  }
}

function getOverallStateLabel(state: PRChecksSummary['overallState']): string {
  switch (state) {
    case 'passing':
      return 'Passing'
    case 'failing':
      return 'Failing'
    case 'pending':
      return 'Pending'
    case 'neutral':
      return 'Neutral'
    default:
      return 'No checks'
  }
}

export function PRChecksPanel({ pr }: PRChecksPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  const latestRequestRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checks, setChecks] = useState<PRChecksSummary | null>(null)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchChecks = useCallback(async () => {
    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId

    setLoading(true)
    setError(null)

    try {
      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      if (!ownerRepo) {
        throw new Error('Could not parse owner/repo from PR URL')
      }

      const result = await enqueueRef.current(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRChecks(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `pr-checks-${pr.repository}-${pr.id}` }
      )

      if (requestId !== latestRequestRef.current) {
        return
      }

      setChecks(result)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      if (requestId !== latestRequestRef.current) {
        return
      }

      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false)
      }
    }
  }, [accounts, pr.id, pr.repository, pr.url])

  useEffect(() => {
    fetchChecks()
  }, [fetchChecks])

  if (error) {
    return (
      <div className="pr-checks-error">
        <p className="pr-checks-error-title">Failed to load checks</p>
        <p className="pr-checks-error-detail">{error}</p>
        <button className="pr-checks-retry" onClick={fetchChecks}>
          Retry
        </button>
      </div>
    )
  }

  if (!checks) {
    return (
      <div className="pr-checks-loading">
        <Loader2 size={28} className="spin" />
        <p>Loading checks…</p>
      </div>
    )
  }

  return (
    <div className="pr-checks-container">
      <div className="pr-checks-summary-grid">
        <div className={`pr-checks-summary-card tone-${checks.overallState}`}>
          <div className="pr-checks-summary-label">Overall</div>
          <div className="pr-checks-summary-value">{getOverallStateLabel(checks.overallState)}</div>
        </div>
        <div className="pr-checks-summary-card">
          <div className="pr-checks-summary-label">Total</div>
          <div className="pr-checks-summary-value">{checks.totalCount}</div>
        </div>
        <div className="pr-checks-summary-card tone-passing">
          <div className="pr-checks-summary-label">Passing</div>
          <div className="pr-checks-summary-value">{checks.successfulCount}</div>
        </div>
        <div className="pr-checks-summary-card tone-failing">
          <div className="pr-checks-summary-label">Failing</div>
          <div className="pr-checks-summary-value">{checks.failedCount}</div>
        </div>
        <div className="pr-checks-summary-card tone-pending">
          <div className="pr-checks-summary-label">Pending</div>
          <div className="pr-checks-summary-value">{checks.pendingCount}</div>
        </div>
      </div>

      <div className="pr-checks-headline-row">
        <div className="pr-checks-headline-meta">
          <span className="pr-checks-headline-label">Head SHA</span>
          <code className="pr-checks-headline-sha">{checks.headSha.slice(0, 12)}</code>
        </div>
        <button
          className="pr-checks-open-btn"
          onClick={() => window.shell.openExternal(`${pr.url}/checks`)}
        >
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>

      {checks.totalCount === 0 && (
        <div className="pr-checks-empty-state">
          <AlertCircle size={28} />
          <p>No checks or commit statuses were reported for this pull request.</p>
        </div>
      )}

      <div className="pr-checks-section">
        <div className="pr-checks-section-title">Check Runs</div>
        {checks.checkRuns.length === 0 ? (
          <div className="pr-checks-empty">No GitHub check runs</div>
        ) : (
          <div className="pr-checks-list">
            {checks.checkRuns.map(run => {
              const status = getCheckRunStatus(run)
              const StatusIcon = status.icon
              const runUrl = run.detailsUrl
              const finishedAt = run.completedAt || run.startedAt
              return (
                <div key={run.id} className="pr-checks-row">
                  <div className="pr-checks-row-main">
                    <div className={`pr-checks-badge tone-${status.tone}`}>
                      <StatusIcon size={14} />
                      <span>{status.label}</span>
                    </div>
                    <div className="pr-checks-row-copy">
                      <div className="pr-checks-row-title">{run.name}</div>
                      <div className="pr-checks-row-subtitle">
                        <span>{run.appName || 'GitHub App'}</span>
                        {finishedAt && (
                          <>
                            <span className="pr-checks-dot">•</span>
                            <span title={formatDateFull(finishedAt)}>
                              {formatDistanceToNow(finishedAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {runUrl && (
                    <button
                      className="pr-checks-link"
                      type="button"
                      onClick={() => window.shell.openExternal(runUrl)}
                    >
                      Details
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="pr-checks-section">
        <div className="pr-checks-section-title">Commit Statuses</div>
        {checks.statusContexts.length === 0 ? (
          <div className="pr-checks-empty">No legacy commit status contexts</div>
        ) : (
          <div className="pr-checks-list">
            {checks.statusContexts.map(statusContext => {
              const status = getStatusContextState(statusContext.state)
              const StatusIcon = status.icon
              const updatedAt = statusContext.updatedAt || statusContext.createdAt
              return (
                <div key={statusContext.id} className="pr-checks-row">
                  <div className="pr-checks-row-main">
                    <div className={`pr-checks-badge tone-${status.tone}`}>
                      <StatusIcon size={14} />
                      <span>{status.label}</span>
                    </div>
                    <div className="pr-checks-row-copy">
                      <div className="pr-checks-row-title">{statusContext.context}</div>
                      <div className="pr-checks-row-subtitle">
                        <span>{statusContext.description || 'No description provided'}</span>
                        {updatedAt && (
                          <>
                            <span className="pr-checks-dot">•</span>
                            <span title={formatDateFull(updatedAt)}>
                              {formatDistanceToNow(updatedAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {statusContext.targetUrl && (
                    <button
                      className="pr-checks-link"
                      type="button"
                      onClick={() => window.shell.openExternal(statusContext.targetUrl!)}
                    >
                      Details
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
