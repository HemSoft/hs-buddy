import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CircleDot,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Clock,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoIssue } from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import { dataCache } from '../services/dataCache'
import { getErrorMessage, isAbortError } from '../utils/errorUtils'
import './RepoIssueList.css'

interface RepoIssueListProps {
  owner: string
  repo: string
  issueState?: 'open' | 'closed'
  onOpenIssue?: (issueNumber: number) => void
}

export function RepoIssueList({
  owner,
  repo,
  issueState = 'open',
  onOpenIssue,
}: RepoIssueListProps) {
  const cacheKey = `repo-issues:${issueState}:${owner}/${repo}`
  const cachedEntry = dataCache.get<RepoIssue[]>(cacheKey)
  const [issues, setIssues] = useState<RepoIssue[]>(cachedEntry?.data || [])
  const [loading, setLoading] = useState(!cachedEntry?.data)
  const [error, setError] = useState<string | null>(null)
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchIssues = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = dataCache.get<RepoIssue[]>(cacheKey)
        if (cached?.data) {
          setIssues(cached.data)
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
            return await client.fetchRepoIssues(owner, repo, issueState)
          },
          { name: `repo-issues-${issueState}-${owner}-${repo}` }
        )
        setIssues(result)
        dataCache.set(cacheKey, result)
      } catch (err) {
        if (isAbortError(err)) return
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [owner, repo, issueState, accounts, cacheKey]
  )

  useEffect(() => {
    fetchIssues()
  }, [fetchIssues])

  if (loading && issues.length === 0) {
    return (
      <div className="repo-issues-loading">
        <Loader2 size={32} className="spin" />
        <p>Loading issues...</p>
        <p className="repo-issues-loading-sub">
          {owner}/{repo} · {issueState}
        </p>
      </div>
    )
  }

  if (error && issues.length === 0) {
    return (
      <div className="repo-issues-error">
        <AlertCircle size={32} />
        <p className="error-message">Failed to load issues</p>
        <p className="error-detail">{error}</p>
        <button className="repo-issues-retry-btn" onClick={() => fetchIssues(true)}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="repo-issues-container">
      <div className="repo-issues-header">
        <div className="repo-issues-header-left">
          <h2>
            <CircleDot size={20} />
            <span className="repo-issues-owner">{owner}</span>
            <span className="repo-issues-separator">/</span>
            <span className="repo-issues-name">{repo}</span>
            <span className="repo-issues-label">
              {issueState === 'open' ? 'Open Issues' : 'Closed Issues'}
            </span>
          </h2>
        </div>
        <div className="repo-issues-header-actions">
          <span className="repo-issues-count">
            {issues.length} {issueState}
          </span>
          <button
            className="repo-issues-refresh-btn"
            onClick={() => fetchIssues(true)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="repo-issues-empty">
          <CircleDot size={48} />
          <p>No {issueState} issues</p>
          <p className="empty-subtitle">This repository has no {issueState} issues right now.</p>
        </div>
      ) : (
        <div className="repo-issues-list">
          {issues.map(issue => (
            <div key={issue.number} className="repo-issue-item">
              <button
                type="button"
                className="repo-issue-main"
                onClick={() => {
                  if (onOpenIssue) {
                    onOpenIssue(issue.number)
                    return
                  }
                  window.shell?.openExternal(issue.url)
                }}
                title={issue.title}
              >
                <span className="repo-issue-header">
                  <span className="repo-issue-title-row">
                    <CircleDot size={16} className="repo-issue-icon" />
                    <span className="repo-issue-title">{issue.title}</span>
                  </span>
                  {issue.labels.length > 0 && (
                    <span className="repo-issue-labels">
                      {issue.labels.map(label => (
                        <span
                          key={label.name}
                          className="repo-issue-label"
                          style={{
                            backgroundColor: `#${label.color}20`,
                            color: `#${label.color}`,
                            borderColor: `#${label.color}40`,
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="repo-issue-meta">
                  <span className="repo-issue-number">#{issue.number}</span>
                  <span className="repo-issue-author">
                    {issue.authorAvatarUrl && (
                      <img
                        src={issue.authorAvatarUrl}
                        alt={issue.author}
                        className="repo-issue-avatar"
                      />
                    )}
                    {issue.author}
                  </span>
                  <span className="repo-issue-date">
                    <Clock size={12} />
                    {formatDistanceToNow(issue.createdAt)}
                  </span>
                  {issue.commentCount > 0 && (
                    <span className="repo-issue-comments">
                      <MessageSquare size={12} />
                      {issue.commentCount}
                    </span>
                  )}
                  {issue.assignees.length > 0 && (
                    <span className="repo-issue-assignees">
                      {issue.assignees.slice(0, 3).map(a => (
                        <img
                          key={a.login}
                          src={a.avatarUrl}
                          alt={a.login}
                          className="repo-issue-assignee-avatar"
                          title={a.name ? `${a.name} (${a.login})` : a.login}
                        />
                      ))}
                      {issue.assignees.length > 3 && (
                        <span className="repo-issue-assignee-more">
                          +{issue.assignees.length - 3}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="repo-issue-external-link-btn"
                onClick={() => window.shell?.openExternal(issue.url)}
                title="Open issue on GitHub"
              >
                <ExternalLink size={14} className="external-link-icon" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
