import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ExternalLink,
  RefreshCw,
  Lock,
  Globe,
  Building2,
  Archive,
  GitFork,
  Scale,
  Loader2,
  AlertCircle,
  Tag,
  Link,
} from 'lucide-react'
import { useGitHubAccounts, usePRSettings } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoDetail } from '../api/github'
import { dataCache } from '../services/dataCache'
import { MS_PER_MINUTE } from '../constants'
import { RepoStatsBar } from './repo-detail/RepoStatsBar'
import { RepoContentGrid } from './repo-detail/RepoContentGrid'
import { getLanguageColor, getWorkflowStatusInfo } from './repo-detail/repoDetailUtils'
import { getErrorMessage, isAbortError } from '../utils/errorUtils'
import './RepoDetailPanel.css'

interface RepoDetailPanelProps {
  owner: string
  repo: string
}

export function RepoDetailPanel({ owner, repo }: RepoDetailPanelProps) {
  const [detail, setDetail] = useState<RepoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { accounts } = useGitHubAccounts()
  const { refreshInterval } = usePRSettings()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const cacheKey = `repo-detail:${owner}/${repo}`

  const fetchDetail = useCallback(
    async (forceRefresh = false) => {
      // Check cache first
      if (!forceRefresh) {
        const cached = dataCache.get<RepoDetail>(cacheKey)
        if (cached?.data) {
          setDetail(cached.data)
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
            return await client.fetchRepoDetail(owner, repo)
          },
          { name: `repo-detail-${owner}-${repo}` }
        )
        setDetail(result)
        dataCache.set(cacheKey, result)
      } catch (err) {
        if (isAbortError(err)) return
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [owner, repo, accounts, cacheKey]
  )

  // Fetch on mount
  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  // Auto-refresh based on PR settings interval
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const timer = setInterval(() => fetchDetail(true), intervalMs)
    return () => clearInterval(timer)
  }, [refreshInterval, fetchDetail])

  if (loading && !detail) {
    return (
      <div className="repo-detail-loading">
        <Loader2 size={32} className="spin" />
        <p>Loading repository details...</p>
        <p className="repo-detail-loading-sub">
          {owner}/{repo}
        </p>
      </div>
    )
  }

  if (error && !detail) {
    return (
      <div className="repo-detail-error">
        <AlertCircle size={32} />
        <p className="error-message">Failed to load repository</p>
        <p className="error-detail">{error}</p>
        <button className="repo-detail-retry-btn" onClick={() => fetchDetail(true)}>
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!detail) return null

  const visibilityIcon =
    detail.visibility === 'private' ? (
      <Lock size={14} />
    ) : detail.visibility === 'internal' ? (
      <Building2 size={14} />
    ) : (
      <Globe size={14} />
    )

  return (
    <div className="repo-detail-container">
      {/* Header */}
      <div className="repo-detail-header">
        <div className="repo-detail-header-left">
          <h2 className="repo-detail-name">
            <span className="repo-detail-owner">{owner}</span>
            <span className="repo-detail-separator">/</span>
            <span className="repo-detail-repo">{repo}</span>
          </h2>
          {detail.description && <p className="repo-detail-description">{detail.description}</p>}
          <div className="repo-detail-badges">
            <span className={`repo-badge repo-badge-${detail.visibility}`}>
              {visibilityIcon}
              {detail.visibility}
            </span>
            {detail.isArchived && (
              <span className="repo-badge repo-badge-archived">
                <Archive size={12} />
                Archived
              </span>
            )}
            {detail.isFork && (
              <span className="repo-badge repo-badge-fork">
                <GitFork size={12} />
                Fork
              </span>
            )}
            {detail.language && (
              <span className="repo-badge repo-badge-lang">
                <span
                  className="lang-dot"
                  style={{ backgroundColor: getLanguageColor(detail.language) }}
                />
                {detail.language}
              </span>
            )}
            {detail.license && (
              <span className="repo-badge repo-badge-license">
                <Scale size={12} />
                {detail.license}
              </span>
            )}
            {detail.latestWorkflowRun &&
              (() => {
                const info = getWorkflowStatusInfo(
                  detail.latestWorkflowRun.status,
                  detail.latestWorkflowRun.conclusion
                )
                const StatusIcon = info.icon
                return (
                  <span
                    className="repo-badge repo-badge-ci"
                    style={{ borderColor: info.color, color: info.color }}
                    title={`${detail.latestWorkflowRun.name} — ${info.label}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => window.shell?.openExternal(detail.latestWorkflowRun!.url)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        window.shell?.openExternal(detail.latestWorkflowRun!.url)
                      }
                    }}
                  >
                    <StatusIcon size={12} className={info.label === 'Running' ? 'spin' : ''} />
                    {info.label}
                  </span>
                )
              })()}
          </div>
          {detail.topics.length > 0 && (
            <div className="repo-detail-topics">
              {detail.topics.map(topic => (
                <span key={topic} className="repo-topic">
                  <Tag size={10} />
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="repo-detail-header-actions">
          <button
            className="repo-detail-action-btn"
            onClick={() => window.shell?.openExternal(detail.url)}
            title="Open on GitHub"
          >
            <ExternalLink size={14} />
            Open on GitHub
          </button>
          {detail.homepage && (
            <button
              className="repo-detail-action-btn"
              onClick={() => window.shell?.openExternal(detail.homepage!)}
              title="Visit homepage"
            >
              <Link size={14} />
              Homepage
            </button>
          )}
          <button
            className="repo-detail-action-btn repo-detail-refresh-btn"
            onClick={() => fetchDetail(true)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <RepoStatsBar detail={detail} />
      <RepoContentGrid detail={detail} />
    </div>
  )
}
