import { useState, useEffect, useCallback, useRef } from 'react'
import {
  GitPullRequest,
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
import './RepoPullRequestList.css'

interface RepoPullRequestListProps {
  owner: string
  repo: string
  prState?: 'open' | 'closed'
  onOpenPR?: (viewId: string) => void
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
  const cachedEntry = dataCache.get<RepoPullRequest[]>(cacheKey)
  const [prs, setPrs] = useState<RepoPullRequest[]>(cachedEntry?.data || [])
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [error, setError] = useState<string | null>(null)
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    const cached = dataCache.get<RepoPullRequest[]>(cacheKey)
    setPrs(cached?.data || [])
    setLoading(!cached?.data)
    setError(null)
  }, [cacheKey])

  const fetchPRs = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = dataCache.get<RepoPullRequest[]>(cacheKey)
        if (cached?.data) {
          setPrs(cached.data)
          setLoading(false)
          return
        }
      }

      setLoading(true)
      setError(null)

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
        setPrs(result)
        dataCache.set(cacheKey, result)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
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
