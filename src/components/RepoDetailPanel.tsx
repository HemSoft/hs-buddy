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

const VISIBILITY_ICONS: Record<string, typeof Lock> = {
  private: Lock,
  internal: Building2,
}

function getVisibilityIcon(visibility: string) {
  const Icon = VISIBILITY_ICONS[visibility] ?? Globe
  return <Icon size={14} />
}

function WorkflowBadge({ run }: { run: NonNullable<RepoDetail['latestWorkflowRun']> }) {
  const info = getWorkflowStatusInfo(run.status, run.conclusion)
  const StatusIcon = info.icon
  return (
    <span
      className="repo-badge repo-badge-ci"
      style={{ borderColor: info.color, color: info.color }}
      title={`${run.name} — ${info.label}`}
      role="button"
      tabIndex={0}
      onClick={() => window.shell?.openExternal(run.url)}
      onKeyDown={onKeyboardActivate(() => window.shell?.openExternal(run.url))}
    >
      {/* v8 ignore start */}
      <StatusIcon size={12} className={info.label === 'Running' ? 'spin' : ''} />
      {/* v8 ignore stop */}
      {info.label}
    </span>
  )
}

function RepoMetaBadges({
  language,
  license,
  workflowRun,
}: {
  language: string | null
  license: string | null
  workflowRun: RepoDetail['latestWorkflowRun']
}) {
  return (
    <>
      {language && (
        <span className="repo-badge repo-badge-lang">
          <span className="lang-dot" style={{ backgroundColor: getLanguageColor(language) }} />
          {language}
        </span>
      )}
      {license && (
        <span className="repo-badge repo-badge-license">
          <Scale size={12} />
          {license}
        </span>
      )}
      {workflowRun && <WorkflowBadge run={workflowRun} />}
    </>
  )
}

function RepoBadges({ detail }: { detail: RepoDetail }) {
  return (
    <div className="repo-detail-badges">
      <span className={`repo-badge repo-badge-${detail.visibility}`}>
        {getVisibilityIcon(detail.visibility)}
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
      <RepoMetaBadges
        language={detail.language}
        license={detail.license}
        workflowRun={detail.latestWorkflowRun}
      />
    </div>
  )
}

function RepoHeaderActions({
  detail,
  loading,
  refresh,
}: {
  detail: RepoDetail
  loading: boolean
  refresh: () => void
}) {
  return (
    <div className="repo-detail-header-actions">
      <button
        type="button"
        className="repo-detail-action-btn"
        onClick={() => window.shell?.openExternal(detail.url)}
        title="Open on GitHub"
      >
        <ExternalLink size={14} />
        Open on GitHub
      </button>
      {detail.homepage && (
        <button
          type="button"
          className="repo-detail-action-btn"
          onClick={() => window.shell?.openExternal(detail.homepage!)}
          title="Visit homepage"
        >
          <Link size={14} />
          Homepage
        </button>
      )}
      <button
        aria-label="Refresh"
        type="button"
        className="repo-detail-action-btn repo-detail-refresh-btn"
        onClick={refresh}
        disabled={loading}
        title="Refresh"
      >
        <RefreshCw size={14} className={loading ? 'spin' : ''} />
      </button>
    </div>
  )
}

function RepoDetailPanelFallback({
  loading,
  error,
  owner,
  repo,
  refresh,
}: {
  loading: boolean
  error: string | null
  owner: string
  repo: string
  refresh: () => void
}) {
  if (loading)
    return <PanelLoadingState message="Loading repository details…" subtitle={`${owner}/${repo}`} />
  if (error)
    return <PanelErrorState title="Failed to load repository" error={error} onRetry={refresh} />
  return null
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
    fetchFn: client => client.fetchRepoDetail(owner, repo),
  })
  const { refreshInterval } = usePRSettings()

  // Auto-refresh based on PR settings interval
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return
    const intervalMs = refreshInterval * MS_PER_MINUTE
    const timer = setInterval(() => refresh(), intervalMs)
    return () => clearInterval(timer)
  }, [refreshInterval, refresh])

  if (!detail)
    return (
      <RepoDetailPanelFallback
        loading={loading}
        error={error}
        owner={owner}
        repo={repo}
        refresh={refresh}
      />
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
          <RepoBadges detail={detail} />
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
        <RepoHeaderActions detail={detail} loading={loading} refresh={refresh} />
      </div>

      <RepoStatsBar detail={detail} />
      <RepoContentGrid detail={detail} />
    </div>
  )
}
