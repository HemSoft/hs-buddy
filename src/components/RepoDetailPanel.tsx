import { useEffect } from 'react'
import {
  ExternalLink,
  RefreshCw,
  Lock,
  Globe,
  Building2,
  Archive,
  GitFork,
  Scale,
  Tag,
  Link,
} from 'lucide-react'
import { usePRSettings } from '../hooks/useConfig'
import { useGitHubData } from '../hooks/useGitHubData'
import { PanelLoadingState, PanelErrorState } from './shared/PanelStates'
import type { RepoDetail } from '../api/github'
import { MS_PER_MINUTE } from '../constants'
import { RepoStatsBar } from './repo-detail/RepoStatsBar'
import { RepoContentGrid } from './repo-detail/RepoContentGrid'
import { getLanguageColor, getWorkflowStatusInfo } from './repo-detail/repoDetailUtils'
import { onKeyboardActivate } from '../utils/keyboard'
import './RepoDetailPanel.css'

interface RepoDetailPanelProps {
  owner: string
  repo: string
}

export function RepoDetailPanel({ owner, repo }: RepoDetailPanelProps) {
  const {
    data: detail,
    loading,
    error,
    refresh,
  } = useGitHubData<RepoDetail>({
    cacheKey: `repo-detail:${owner}/${repo}`,
    taskName: `repo-detail-${owner}-${repo}`,
    /* v8 ignore start */
    fetchFn: client => client.fetchRepoDetail(owner, repo),
    /* v8 ignore stop */
  })
  const { refreshInterval } = usePRSettings()

  // Auto-refresh based on PR settings interval
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    /* v8 ignore start */
    const timer = setInterval(() => refresh(), intervalMs)
    /* v8 ignore stop */
    return () => clearInterval(timer)
  }, [refreshInterval, refresh])

  if (loading && !detail) {
    return (
      <PanelLoadingState message="Loading repository details..." subtitle={`${owner}/${repo}`} />
    )
  }

  if (error && !detail) {
    return <PanelErrorState title="Failed to load repository" error={error} onRetry={refresh} />
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
                    onKeyDown={onKeyboardActivate(() =>
                      window.shell?.openExternal(detail.latestWorkflowRun!.url)
                    )}
                  >
                    {/* v8 ignore start */}
                    <StatusIcon size={12} className={info.label === 'Running' ? 'spin' : ''} />
                    {/* v8 ignore stop */}
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
            onClick={refresh}
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
