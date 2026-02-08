import { useState, useEffect, useCallback, useRef } from 'react'
import {
  GitPullRequest,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertCircle,
  Clock,
  GitBranch,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoPullRequest } from '../api/github'
import { dataCache } from '../services/dataCache'
import './RepoPRList.css'

interface RepoPRListProps {
  owner: string
  repo: string
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  const diffYears = Math.floor(diffMonths / 12)
  return `${diffYears}y ago`
}

export function RepoPRList({ owner, repo }: RepoPRListProps) {
  const cacheKey = `repo-prs:${owner}/${repo}`
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
            return await client.fetchRepoPRs(owner, repo)
          },
          { name: `repo-prs-${owner}-${repo}` }
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
    [owner, repo, accounts, cacheKey]
  )

  useEffect(() => {
    fetchPRs()
  }, [fetchPRs])

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
            <span className="repo-prs-label">Pull Requests</span>
          </h2>
        </div>
        <div className="repo-prs-header-actions">
          <span className="repo-prs-count">{prs.length} open</span>
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

      {prs.length === 0 ? (
        <div className="repo-prs-empty">
          <GitPullRequest size={48} />
          <p>No open pull requests</p>
          <p className="empty-subtitle">This repository has no open pull requests right now.</p>
        </div>
      ) : (
        <div className="repo-prs-list">
          {prs.map(pr => (
            <div
              key={pr.number}
              className="repo-pr-item"
              onClick={() => window.shell?.openExternal(pr.url)}
            >
              <div className="repo-pr-header">
                <div className="repo-pr-title-row">
                  <GitPullRequest
                    size={16}
                    className={`repo-pr-icon ${pr.draft ? 'draft' : ''}`}
                  />
                  <span className="repo-pr-title">{pr.title}</span>
                  <ExternalLink size={14} className="external-link-icon" />
                </div>
                <div className="repo-pr-badges">
                  {pr.draft && <span className="repo-pr-draft-badge">Draft</span>}
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
              </div>
              <div className="repo-pr-meta">
                <span className="repo-pr-number">#{pr.number}</span>
                <span className="repo-pr-author">
                  {pr.authorAvatarUrl && (
                    <img src={pr.authorAvatarUrl} alt={pr.author} className="repo-pr-avatar" />
                  )}
                  {pr.author}
                </span>
                <span className="repo-pr-branch">
                  <GitBranch size={12} />
                  {pr.headBranch}
                  <span className="repo-pr-branch-arrow">&rarr;</span>
                  {pr.baseBranch}
                </span>
                <span className="repo-pr-date">
                  <Clock size={12} />
                  {formatRelativeTime(pr.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
