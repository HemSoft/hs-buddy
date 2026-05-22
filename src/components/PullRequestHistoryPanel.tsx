import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  GitCommit,
  History,
  MessageCircle,
  MessageSquareWarning,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { GitHubClient, type PRHistorySummary } from '../api/github'
import { useGitHubAccounts, useCopilotSettings } from '../hooks/useConfig'
import { useLatest } from '../hooks/useLatest'
import { useTaskQueue } from '../hooks/useTaskQueue'
import type { PRDetailInfo } from '../utils/prDetailView'
import { formatDistanceToNow, formatDateFull } from '../utils/dateUtils'
import { parseOwnerRepoFromUrl, PR_URL_PARSE_ERROR } from '../utils/githubUrl'
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'
import { buildAddressCommentsPrompt } from '../utils/assistantPrompts'
import { PanelLoadingState, PanelErrorState } from './shared/PanelStates'
import './PullRequestHistoryPanel.css'

interface PullRequestHistoryPanelProps {
  pr: PRDetailInfo
  embedded?: boolean
  focus?: 'all' | 'commits'
  onLoaded?: (history: PRHistorySummary) => void
}

function PullRequestHistoryHeader({ pr, embedded }: { pr: PRDetailInfo; embedded: boolean }) {
  if (embedded) {
    return (
      <div className="pr-history-inline-title">
        <History size={16} />
        PR History
      </div>
    )
  }

  return (
    <div className="pr-history-header">
      <div className="pr-history-title-wrap">
        <h2 className="pr-history-title">
          <History size={18} />
          PR History
        </h2>
        <div className="pr-history-subtitle">
          <span>{pr.org || pr.source}</span>
          <span className="pr-history-dot">·</span>
          <span>{pr.repository}</span>
          <span className="pr-history-dot">·</span>
          <span>#{pr.id}</span>
        </div>
      </div>
      <button className="pr-history-open" onClick={() => window.shell.openExternal(pr.url)}>
        <ExternalLink size={14} />
        Open PR
      </button>
    </div>
  )
}

function PullRequestHistoryOverview({ history, pr }: { history: PRHistorySummary; pr: PRDetailInfo }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const { premiumModel } = useCopilotSettings()
  const { accounts } = useGitHubAccounts()

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey); window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true) }
  }, [menu])

  const handleAddressComments = useCallback(() => {
    const org = pr.org || pr.source
    const prompt = buildAddressCommentsPrompt({ prId: pr.id, org, repository: pr.repository, url: pr.url })
    window.dispatchEvent(new CustomEvent('assistant:send-prompt', { detail: { prompt, model: premiumModel } }))
    setMenu(null)
  }, [pr.id, pr.org, pr.source, pr.repository, pr.url, premiumModel])

  const handleRequestCopilotReview = useCallback(() => {
    const parsed = parseOwnerRepoFromUrl(pr.url)
    if (!parsed) return
    void new GitHubClient({ accounts }, 7).requestCopilotReview(parsed.owner, parsed.repo, pr.id)
    setMenu(null)
  }, [pr.url, pr.id, accounts])

  return (
    <>
      <div className="pr-history-grid">
        <div className="pr-history-card"><div className="label">Created</div><div className="value">{formatDateFull(history.createdAt)}</div></div>
        <div className="pr-history-card"><div className="label">Last Updated</div><div className="value">{formatDateFull(history.updatedAt)}</div></div>
        <div className="pr-history-card"><div className="label">Merged</div><div className="value">{formatDateFull(history.mergedAt)}</div></div>
      </div>
      <div className="pr-history-metrics">
        <div className="metric-row"><span className="metric-label"><GitCommit size={14} /> Commits</span><span className="metric-value">{history.commitCount}</span></div>
        <div className="metric-row"><span className="metric-label"><MessageCircle size={14} /> Comments (Total)</span><span className="metric-value">{history.totalComments}</span></div>
        <div className="metric-row nested"><span className="metric-label">Issue comments</span><span className="metric-value">{history.issueCommentCount}</span></div>
        <div className="metric-row nested"><span className="metric-label">Review comments</span><span className="metric-value">{history.reviewCommentCount}</span></div>
      </div>
      <div className="pr-history-thread-status">
        <h3>Review Thread Status</h3>
        <div className="thread-grid">
          <div className="thread-card"><div className="thread-label">Total</div><div className="thread-value">{history.threadsTotal}</div></div>
          <div className="thread-card"><div className="thread-label">Outdated</div><div className="thread-value">{history.threadsOutdated}</div></div>
          <div className="thread-card">
            <div className="thread-label-row">
              <div className="thread-label">Addressed</div>
              <div className="thread-indicator good" aria-label="Addressed"><CheckCircle2 size={12} />Good</div>
            </div>
            <div className="thread-value">{history.threadsAddressed}</div>
          </div>
          <div className="thread-card thread-card-interactive" onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }} title="Right-click for actions">
            <div className="thread-label-row">
              <div className="thread-label">Unaddressed</div>
              <div className="thread-indicator bad" aria-label="Unaddressed"><XCircle size={12} />Bad</div>
            </div>
            <div className="thread-value">{history.threadsUnaddressed}</div>
          </div>
        </div>
        {menu && (
          <>
            <div className="pr-context-menu-overlay" onClick={() => setMenu(null)} aria-hidden="true" />
            <div className="pr-context-menu" style={{ top: menu.y, left: menu.x }}>
              <button onClick={handleAddressComments} disabled={history.threadsUnaddressed === 0}><MessageSquareWarning size={14} />Address Unresolved Comments</button>
              <button onClick={handleRequestCopilotReview}><Sparkles size={14} />Request Copilot Review</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function PullRequestReviewers({ history }: { history: PRHistorySummary }) {
  return (
    <div className="pr-history-reviewers">
      <h3>Assigned Reviewers</h3>
      {history.reviewers.length === 0 ? (
        <div className="pr-history-empty">No assigned reviewers</div>
      ) : (
        <div className="reviewer-list">
          {history.reviewers.map(reviewer => (
            <div key={reviewer.login} className="reviewer-item">
              <div className="reviewer-left">
                {reviewer.avatarUrl ? (
                  <img src={reviewer.avatarUrl} alt={reviewer.login} className="reviewer-avatar" />
                ) : (
                  <div className="reviewer-avatar reviewer-avatar-fallback">
                    {reviewer.login.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="reviewer-name" title={reviewer.login}>
                  {reviewer.name ? `${reviewer.name} (${reviewer.login})` : reviewer.login}
                </span>
              </div>
              <div className="reviewer-right">
                <span className={`reviewer-status reviewer-status-${reviewer.status}`}>
                  {reviewer.status}
                </span>
                {reviewer.updatedAt && (
                  <span className="reviewer-time">{formatDistanceToNow(reviewer.updatedAt)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PullRequestTimeline({
  focus,
  timeline,
}: {
  focus: 'all' | 'commits'
  timeline: NonNullable<PRHistorySummary['timeline']>
}) {
  return (
    <div className="pr-history-timeline">
      {/* v8 ignore start — PullRequestTimeline is only used in CommitsFocusView (focus='commits') */}
      <h3>{focus === 'commits' ? 'Commit Timeline' : 'Activity Timeline'}</h3>
      {/* v8 ignore stop */}
      {timeline.length === 0 ? (
        <div className="pr-history-empty">No timeline events</div>
      ) : (
        <div className="timeline-list">
          {timeline.map(event => {
            const url = event.url
            return (
              <div key={event.id} className="timeline-item">
                <div className="timeline-meta">
                  <span className="timeline-type">{event.type}</span>
                  <span className="timeline-dot">•</span>
                  <span className="timeline-author">{event.author}</span>
                  <span className="timeline-dot">•</span>
                  <span className="timeline-time" title={formatDateFull(event.occurredAt)}>
                    {formatDistanceToNow(event.occurredAt)}
                  </span>
                </div>
                <div className="timeline-summary">
                  {url ? (
                    <button
                      type="button"
                      className="timeline-link"
                      onClick={() => window.shell.openExternal(url)}
                    >
                      {event.summary}
                    </button>
                  ) : (
                    event.summary
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function handleHistoryFetchError(
  err: unknown,
  requestId: number,
  latestRef: { current: number },
  setError: (e: string | null) => void
): void {
  if (isAbortError(err)) return
  if (requestId !== latestRef.current) return
  setError(getErrorMessage(err))
}

function resolveHistoryOwnerRepo(pr: PRDetailInfo) {
  const ownerRepo = parseOwnerRepoFromUrl(pr.url)
  if (!ownerRepo) {
    throw new Error(PR_URL_PARSE_ERROR)
  }
  return ownerRepo
}

function applyFetchedHistory(
  result: PRHistorySummary,
  requestId: number,
  latestRef: { current: number },
  setHistory: (history: PRHistorySummary) => void,
  onLoaded?: (history: PRHistorySummary) => void
) {
  if (requestId !== latestRef.current) return
  setHistory(result)
  if (onLoaded) {
    onLoaded(result)
  }
}

function shouldFinalizeHistoryRequest(requestId: number, latestRef: { current: number }) {
  return requestId === latestRef.current
}

function resolveHistoryTimeline(history: PRHistorySummary) {
  return history.timeline ?? []
}

function filterTimelineByFocus(
  focus: 'all' | 'commits',
  timeline: NonNullable<PRHistorySummary['timeline']>
) {
  if (focus !== 'commits') return timeline
  return timeline.filter(event => event.type === 'commit')
}

function resolveHistoryContainerClassName(embedded: boolean) {
  return `pr-history-container ${embedded ? 'embedded' : ''}`
}

function HistoryAllSections({
  history,
  pr,
}: {
  history: PRHistorySummary
  pr: PullRequestHistoryPanelProps['pr']
}) {
  return (
    <>
      <PullRequestHistoryOverview history={history} pr={pr} />
      <PullRequestReviewers history={history} />
      <div className="pr-history-footer">
        <Clock size={13} />
        Thread status is derived from GitHub review thread resolution/outdated state.
      </div>
    </>
  )
}

function HistoryFocusSections({
  focus,
  history,
  pr,
  activeTimeline,
}: {
  focus: 'all' | 'commits'
  history: PRHistorySummary
  pr: PullRequestHistoryPanelProps['pr']
  activeTimeline: NonNullable<PRHistorySummary['timeline']>
}) {
  if (focus === 'commits') {
    return <CommitsFocusView history={history} activeTimeline={activeTimeline} focus={focus} />
  }

  return <HistoryAllSections history={history} pr={pr} />
}

function renderPullRequestHistoryPanelState({
  loading,
  error,
  history,
  fetchHistory,
  pr,
  embedded,
  focus,
}: {
  loading: boolean
  error: string | null
  history: PRHistorySummary | null
  fetchHistory: () => void
  pr: PullRequestHistoryPanelProps['pr']
  embedded: boolean
  focus: 'all' | 'commits'
}) {
  if (loading && !history) {
    return <PanelLoadingState message="Loading PR history…" className="pr-history-loading" />
  }

  if (error) {
    return (
      <PanelErrorState
        title="Failed to load PR history"
        error={error}
        onRetry={fetchHistory}
        className="pr-history-error"
      />
    )
  }

  if (!history) {
    return <PanelLoadingState message="Loading PR history…" className="pr-history-loading" />
  }

  return <PRHistoryContent pr={pr} embedded={embedded} focus={focus} history={history} />
}

function usePRHistoryFetch(pr: PRDetailInfo, onLoaded?: (history: PRHistorySummary) => void) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useLatest(enqueue)
  const latestRequestRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<PRHistorySummary | null>(null)

  const fetchHistory = useCallback(async () => {
    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId

    setLoading(true)
    setError(null)

    try {
      const ownerRepo = resolveHistoryOwnerRepo(pr)
      const result = await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRHistory(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `pr-history-${pr.repository}-${pr.id}` }
      )

      applyFetchedHistory(result, requestId, latestRequestRef, setHistory, onLoaded)
    } catch (err: unknown) {
      handleHistoryFetchError(err, requestId, latestRequestRef, setError)
    } finally {
      if (shouldFinalizeHistoryRequest(requestId, latestRequestRef)) {
        setLoading(false)
      }
    }
  }, [accounts, pr, onLoaded, enqueueRef])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return { loading, error, history, fetchHistory }
}

function CommitsFocusView({
  history,
  activeTimeline,
  focus,
}: {
  history: PRHistorySummary
  activeTimeline: PRHistorySummary['timeline']
  focus: 'commits'
}) {
  return (
    <>
      <div className="pr-history-metrics">
        <div className="metric-row">
          <span className="metric-label">
            <GitCommit size={14} /> Commits
          </span>
          <span className="metric-value">{history.commitCount}</span>
        </div>
      </div>
      <PullRequestTimeline focus={focus} timeline={activeTimeline} />
    </>
  )
}

function PRHistoryContent({
  pr,
  embedded,
  focus,
  history,
}: {
  pr: PullRequestHistoryPanelProps['pr']
  embedded: boolean
  focus: 'all' | 'commits'
  history: PRHistorySummary
}) {
  const timeline = resolveHistoryTimeline(history)
  const activeTimeline = filterTimelineByFocus(focus, timeline)

  return (
    <div className={resolveHistoryContainerClassName(embedded)}>
      <PullRequestHistoryHeader pr={pr} embedded={embedded} />
      <HistoryFocusSections focus={focus} history={history} pr={pr} activeTimeline={activeTimeline} />
    </div>
  )
}

export function PullRequestHistoryPanel({
  pr,
  embedded = false,
  focus = 'all',
  onLoaded,
}: PullRequestHistoryPanelProps) {
  const { loading, error, history, fetchHistory } = usePRHistoryFetch(pr, onLoaded)

  return renderPullRequestHistoryPanelState({
    loading,
    error,
    history,
    fetchHistory,
    pr,
    embedded,
    focus,
  })
}
