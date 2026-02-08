import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Star,
  GitFork,
  Eye,
  CircleDot,
  GitPullRequest,
  GitCommit,
  ExternalLink,
  RefreshCw,
  Lock,
  Globe,
  Building2,
  Archive,
  GitBranch,
  Scale,
  Code2,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Tag,
  Link,
} from 'lucide-react'
import { useGitHubAccounts, usePRSettings } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { GitHubClient, type RepoDetail } from '../api/github'
import { dataCache } from '../services/dataCache'
import './RepoDetailPanel.css'

interface RepoDetailPanelProps {
  owner: string
  repo: string
}

/** Format bytes into human-readable size */
function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

/** Format a date string into a readable format */
function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Format a date string into a relative time */
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

/** Get a color for a programming language */
function getLanguageColor(lang: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572a5',
    Java: '#b07219',
    'C#': '#178600',
    Go: '#00add8',
    Rust: '#dea584',
    Ruby: '#701516',
    PHP: '#4f5d95',
    Swift: '#f05138',
    Kotlin: '#a97bff',
    Dart: '#00b4ab',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Dockerfile: '#384d54',
    HCL: '#844fba',
    Markdown: '#083fa1',
    SCSS: '#c6538c',
    Vue: '#41b883',
    Svelte: '#ff3e00',
    Lua: '#000080',
    PowerShell: '#012456',
    Bicep: '#519aba',
    C: '#555555',
    'C++': '#f34b7d',
  }
  return colors[lang] || '#8b8b8b'
}

/** Get CI/CD status color and icon */
function getWorkflowStatusInfo(status: string, conclusion: string | null) {
  if (status === 'completed') {
    switch (conclusion) {
      case 'success':
        return { color: 'var(--accent-success)', icon: CheckCircle2, label: 'Passing' }
      case 'failure':
        return { color: 'var(--accent-error)', icon: XCircle, label: 'Failing' }
      case 'cancelled':
        return { color: 'var(--text-secondary)', icon: XCircle, label: 'Cancelled' }
      default:
        return { color: 'var(--accent-warning)', icon: AlertCircle, label: conclusion || 'Unknown' }
    }
  }
  if (status === 'in_progress') {
    return { color: 'var(--accent-warning)', icon: Loader2, label: 'Running' }
  }
  return { color: 'var(--text-secondary)', icon: Clock, label: status }
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
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
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
    const intervalMs = refreshInterval * 60 * 1000
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

  // Compute language stats
  const totalBytes = Object.values(detail.languages).reduce((a, b) => a + b, 0)
  const languageEntries = Object.entries(detail.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, bytes]) => ({
      lang,
      bytes,
      percentage: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
    }))

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
                    onClick={() => window.shell?.openExternal(detail.latestWorkflowRun!.url)}
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

      {/* Stats Bar */}
      <div className="repo-detail-stats-bar">
        <div className="repo-stat" title="Stars">
          <Star size={14} />
          <span className="repo-stat-value">{detail.stargazersCount.toLocaleString()}</span>
          <span className="repo-stat-label">stars</span>
        </div>
        <div className="repo-stat" title="Forks">
          <GitFork size={14} />
          <span className="repo-stat-value">{detail.forksCount.toLocaleString()}</span>
          <span className="repo-stat-label">forks</span>
        </div>
        <div className="repo-stat" title="Watchers">
          <Eye size={14} />
          <span className="repo-stat-value">{detail.watchersCount.toLocaleString()}</span>
          <span className="repo-stat-label">watching</span>
        </div>
        <div className="repo-stat" title="Open Issues">
          <CircleDot size={14} />
          <span className="repo-stat-value">{detail.openIssuesCount.toLocaleString()}</span>
          <span className="repo-stat-label">issues</span>
        </div>
        {detail.openPRCount > 0 && (
          <div className="repo-stat" title="Open Pull Requests">
            <GitPullRequest size={14} />
            <span className="repo-stat-value">{detail.openPRCount.toLocaleString()}</span>
            <span className="repo-stat-label">PRs</span>
          </div>
        )}
        <div className="repo-stat" title="Repository Size">
          <Code2 size={14} />
          <span className="repo-stat-value">{formatSize(detail.sizeKB)}</span>
        </div>
        <div className="repo-stat" title="Default Branch">
          <GitBranch size={14} />
          <span className="repo-stat-value">{detail.defaultBranch}</span>
        </div>
      </div>

      {/* Content Grid */}
      <div className="repo-detail-grid">
        {/* Languages Card */}
        {languageEntries.length > 0 && (
          <div className="repo-detail-card">
            <div className="repo-detail-card-header">
              <Code2 size={16} />
              <h3>Languages</h3>
            </div>
            <div className="repo-lang-bar">
              {languageEntries.map(({ lang, percentage }) => (
                <div
                  key={lang}
                  className="repo-lang-segment"
                  style={{
                    width: `${Math.max(percentage, 0.5)}%`,
                    backgroundColor: getLanguageColor(lang),
                  }}
                  title={`${lang}: ${percentage.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="repo-lang-list">
              {languageEntries.slice(0, 8).map(({ lang, percentage }) => (
                <div key={lang} className="repo-lang-item">
                  <span className="lang-dot" style={{ backgroundColor: getLanguageColor(lang) }} />
                  <span className="repo-lang-name">{lang}</span>
                  <span className="repo-lang-pct">{percentage.toFixed(1)}%</span>
                </div>
              ))}
              {languageEntries.length > 8 && (
                <div className="repo-lang-item repo-lang-more">
                  +{languageEntries.length - 8} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Commits Card */}
        {detail.recentCommits.length > 0 && (
          <div className="repo-detail-card">
            <div className="repo-detail-card-header">
              <GitCommit size={16} />
              <h3>Recent Commits</h3>
            </div>
            <div className="repo-commits-list">
              {detail.recentCommits.map(commit => (
                <div
                  key={commit.sha}
                  className="repo-commit-item"
                  onClick={() => window.shell?.openExternal(commit.url)}
                  title={commit.message}
                >
                  <div className="repo-commit-main">
                    <span className="repo-commit-sha">{commit.sha.slice(0, 7)}</span>
                    <span className="repo-commit-msg">{commit.message}</span>
                  </div>
                  <div className="repo-commit-meta">
                    {commit.authorAvatarUrl && (
                      <img
                        src={commit.authorAvatarUrl}
                        alt={commit.author}
                        className="repo-commit-avatar"
                      />
                    )}
                    <span className="repo-commit-author">{commit.author}</span>
                    <span className="repo-commit-date">{formatRelativeTime(commit.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contributors Card */}
        {detail.topContributors.length > 0 && (
          <div className="repo-detail-card">
            <div className="repo-detail-card-header">
              <Users size={16} />
              <h3>Top Contributors</h3>
            </div>
            <div className="repo-contributors-list">
              {detail.topContributors.map(contributor => (
                <div
                  key={contributor.login}
                  className="repo-contributor-item"
                  onClick={() => window.shell?.openExternal(contributor.url)}
                  title={`${contributor.login}: ${contributor.contributions} commits`}
                >
                  <img
                    src={contributor.avatarUrl}
                    alt={contributor.login}
                    className="repo-contributor-avatar"
                  />
                  <div className="repo-contributor-info">
                    <span className="repo-contributor-name">{contributor.login}</span>
                    <span className="repo-contributor-count">
                      {contributor.contributions.toLocaleString()} commits
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Repo Info Card */}
        <div className="repo-detail-card">
          <div className="repo-detail-card-header">
            <Building2 size={16} />
            <h3>Repository Info</h3>
          </div>
          <div className="repo-info-list">
            <div className="repo-info-item">
              <span className="repo-info-label">Created</span>
              <span className="repo-info-value">{formatDate(detail.createdAt)}</span>
            </div>
            <div className="repo-info-item">
              <span className="repo-info-label">Updated</span>
              <span className="repo-info-value">
                {formatDate(detail.updatedAt)}
                <span className="repo-info-relative">{formatRelativeTime(detail.updatedAt)}</span>
              </span>
            </div>
            {detail.pushedAt && (
              <div className="repo-info-item">
                <span className="repo-info-label">Last Push</span>
                <span className="repo-info-value">
                  {formatDate(detail.pushedAt)}
                  <span className="repo-info-relative">{formatRelativeTime(detail.pushedAt)}</span>
                </span>
              </div>
            )}
            <div className="repo-info-item">
              <span className="repo-info-label">Size</span>
              <span className="repo-info-value">{formatSize(detail.sizeKB)}</span>
            </div>
            <div className="repo-info-item">
              <span className="repo-info-label">Default Branch</span>
              <span className="repo-info-value">{detail.defaultBranch}</span>
            </div>
            {detail.license && (
              <div className="repo-info-item">
                <span className="repo-info-label">License</span>
                <span className="repo-info-value">{detail.license}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
