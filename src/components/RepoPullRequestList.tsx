import { useEffect, useCallback, useReducer, useRef } from 'react'
import {
  GitPullRequest,
  GitPullRequestClosed,
  GitMerge,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertCircle,
  Clock,
  GitBranch,
  ThumbsUp,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoPullRequest } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import { dataCache } from '../services/dataCache'
import { createPRDetailViewId } from '../utils/prDetailView'
import { getErrorMessage, isAbortError } from '../utils/errorUtils'
import { ViewModeToggle } from './shared/ViewModeToggle'
import { useViewMode } from '../hooks/useViewMode'
import './RepoPullRequestList.css'
import './shared/ListView.css'

interface RepoPullRequestListProps {
  owner: string
  repo: string
  prState?: 'open' | 'closed'
  onOpenPR?: (viewId: string) => void
}

interface RepoPullRequestListState {
  prs: RepoPullRequest[]
  loading: boolean
  error: string | null
}

type RepoPullRequestListAction =
  | { type: 'RESET_FROM_CACHE'; payload: RepoPullRequestListState }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: RepoPullRequest[] }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'FETCH_FINISH' }

function getRepoPullRequestListState(cacheKey: string): RepoPullRequestListState {
  const cachedEntry = dataCache.get<RepoPullRequest[]>(cacheKey)

  return {
    prs: cachedEntry?.data || [],
    loading: !cachedEntry?.data,
    error: null,
  }
}

function repoPullRequestListReducer(
  state: RepoPullRequestListState,
  action: RepoPullRequestListAction
): RepoPullRequestListState {
  switch (action.type) {
    case 'RESET_FROM_CACHE':
      return action.payload
    case 'FETCH_START':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { prs: action.payload, loading: false, error: null }
    case 'FETCH_ERROR':
      return { ...state, error: action.payload }
    case 'FETCH_FINISH':
      return { ...state, loading: false }
  }
}

function mapToPRDetailId(pr: RepoPullRequest, owner: string): string {
  return createPRDetailViewId({
    source: 'GitHub',
    repository: pr.url.split('/')[4] || pr.url,
    id: pr.number,
    title: pr.title,
    author: pr.author,
    authorAvatarUrl: pr.authorAvatarUrl || undefined,
    url: pr.url,
    state: pr.state,
    approvalCount: pr.approvalCount ?? 0,
    assigneeCount: pr.assigneeCount ?? 0,
    iApproved: pr.iApproved ?? false,
    created: pr.createdAt ? new Date(pr.createdAt) : null,
    updatedAt: pr.updatedAt,
    headBranch: pr.headBranch,
    baseBranch: pr.baseBranch,
    date: pr.updatedAt || pr.createdAt,
    org: owner,
  })
}

export function RepoPullRequestList({
  owner,
  repo,
  prState = 'open',
  onOpenPR,
}: RepoPullRequestListProps) {
  const cacheKey = `repo-prs:${prState}:${owner}/${repo}`
  const [state, dispatch] = useReducer(
    repoPullRequestListReducer,
    cacheKey,
    getRepoPullRequestListState
  )
  const { prs, loading, error } = state
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])
  const [viewMode, setViewMode] = useViewMode(`repo-prs-${owner}-${repo}`)

  useEffect(() => {
    dispatch({
      type: 'RESET_FROM_CACHE',
      payload: getRepoPullRequestListState(cacheKey),
    })
  }, [cacheKey])

  const fetchPRs = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = dataCache.get<RepoPullRequest[]>(cacheKey)
        if (cached?.data) {
          dispatch({ type: 'FETCH_SUCCESS', payload: cached.data })
          return
        }
      }

      dispatch({ type: 'FETCH_START' })

      try {
        const result = await enqueueRef.current(
          async signal => {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
            const config = { accounts }
            const client = new GitHubClient(config, 7)
            return await client.fetchRepoPRs(owner, repo, prState)
          },
          { name: `repo-prs-${prState}-${owner}-${repo}` }
        )
        dispatch({ type: 'FETCH_SUCCESS', payload: result })
        dataCache.set(cacheKey, result)
      } catch (err) {
        if (isAbortError(err)) return
        dispatch({
          type: 'FETCH_ERROR',
          payload: getErrorMessage(err),
        })
      } finally {
        dispatch({ type: 'FETCH_FINISH' })
      }
    },
    [owner, repo, prState, accounts, cacheKey]
  )

  useEffect(() => {
    fetchPRs()
  }, [fetchPRs])

  const handlePRClick = useCallback(
    (pr: RepoPullRequest) => {
      if (onOpenPR) {
        onOpenPR(mapToPRDetailId(pr, owner))
      } else {
        window.shell?.openExternal(pr.url)
      }
    },
    [onOpenPR, owner]
  )

  if (loading && prs.length === 0) {
    return (
      <div className="repo-prs-loading">
        <Loader2 size={32} className="spin" />
        <p>Loading pull requests...</p>
        <p className="repo-prs-loading-sub">
          {owner}/{repo}
        </p>
      </div>
    )
  }

  if (error && prs.length === 0) {
    return (
      <div className="repo-prs-error">
        <AlertCircle size={32} />
        <p className="error-message">Failed to load pull requests</p>
        <p className="error-detail">{error}</p>
        <button className="repo-prs-retry-btn" onClick={() => fetchPRs(true)}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="repo-prs-container">
      <div className="repo-prs-header">
        <div className="repo-prs-header-left">
          <h2>
            <GitPullRequest size={20} />
            <span className="repo-prs-owner">{owner}</span>
            <span className="repo-prs-separator">/</span>
            <span className="repo-prs-name">{repo}</span>
            <span className="repo-prs-label">
              {prState === 'open' ? 'Open Pull Requests' : 'Closed Pull Requests'}
            </span>
          </h2>
        </div>
        <div className="repo-prs-header-actions">
          <span className="repo-prs-count">
            {prs.length} {prState}
          </span>
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          <button
            className="repo-prs-refresh-btn"
            onClick={() => fetchPRs(true)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {loading && prs.length > 0 && (
        <div className="repo-prs-loading-indicator" role="status" aria-live="polite">
          <Loader2 size={14} className="spin" />
          <span>Refreshing pull requests...</span>
        </div>
      )}

      {!loading && prs.length === 0 ? (
        <div className="repo-prs-empty">
          <GitPullRequest size={48} />
          <p>No {prState} pull requests</p>
          <p className="empty-subtitle">
            This repository has no {prState} pull requests right now.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="repo-prs-list" style={{ padding: 0 }}>
          <table className="list-view-table">
            <thead>
              <tr>
                <th className="col-status"></th>
                <th className="col-title">Title</th>
                <th>Author</th>
                <th>Updated</th>
                <th>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {prs.map(pr => (
                <tr key={pr.number} onClick={() => handlePRClick(pr)}>
                  <td className="col-status">
                    {pr.state === 'merged' ? (
                      <GitMerge size={14} className="list-view-status-merged" />
                    ) : pr.state === 'closed' ? (
                      <GitPullRequestClosed size={14} className="list-view-status-closed" />
                    ) : pr.draft ? (
                      <GitPullRequest size={14} className="list-view-status-draft" />
                    ) : (
                      <GitPullRequest size={14} className="list-view-status-open" />
                    )}
                  </td>
                  <td className="col-title">
                    <span className="col-number">#{pr.number}</span> {pr.title}
                    {pr.draft && (
                      <span className="repo-pr-draft-badge" style={{ marginLeft: 6 }}>
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="col-author">
                    {pr.authorAvatarUrl && (
                      <img src={pr.authorAvatarUrl} alt={pr.author} className="list-view-avatar" />
                    )}
                    {pr.author}
                  </td>
                  <td className="col-date">{formatDistanceToNow(pr.updatedAt)}</td>
                  <td>
                    {(pr.approvalCount ?? 0) > 0 && (
                      <span className="list-view-approvals">
                        <ThumbsUp size={12} />
                        {pr.approvalCount}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="repo-prs-list">
          {prs.map(pr => (
            <button
              key={pr.number}
              type="button"
              className={`repo-pr-item${pr.draft ? ' repo-pr-item--draft' : ''}`}
              onClick={() => handlePRClick(pr)}
            >
              <div className="repo-pr-header">
                <div className="repo-pr-title-row">
                  <GitPullRequest size={16} className="repo-pr-icon" />
                  <span className="repo-pr-title">{pr.title}</span>
                  {pr.draft && <span className="repo-pr-draft-badge">Draft</span>}
                  <ExternalLink size={14} className="external-link-icon" />
                </div>
                {pr.labels.length > 0 && (
                  <div className="repo-pr-labels">
                    {pr.labels.map(label => (
                      <span
                        key={label.name}
                        className="repo-pr-label"
                        style={{
                          backgroundColor: `#${label.color}20`,
                          color: `#${label.color}`,
                          borderColor: `#${label.color}40`,
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="repo-pr-branch-flow">
                <GitBranch size={12} />
                <span>
                  into <strong>{pr.baseBranch}</strong> from <strong>{pr.headBranch}</strong>
                </span>
              </div>
              <div className="repo-pr-meta">
                <span className="repo-pr-number">#{pr.number}</span>
                <span className="repo-pr-author">
                  {pr.authorAvatarUrl && (
                    <img src={pr.authorAvatarUrl} alt={pr.author} className="repo-pr-avatar" />
                  )}
                  {pr.author}
                </span>
                <span className="repo-pr-date">
                  <Clock size={12} />
                  {formatDistanceToNow(pr.createdAt)}
                </span>
                <span className="repo-pr-updated">updated {formatDistanceToNow(pr.updatedAt)}</span>
                {(pr.approvalCount ?? 0) > 0 && (
                  <span className="repo-pr-approvals">
                    <ThumbsUp size={12} />
                    {pr.approvalCount}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
