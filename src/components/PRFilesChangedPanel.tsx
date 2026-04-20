import { useMemo } from 'react'
import { FileCode2, RefreshCw } from 'lucide-react'
import type { PRFilesChangedSummary } from '../api/github'
import { useGitHubData } from '../hooks/useGitHubData'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
import type { PRDetailInfo } from '../utils/prDetailView'
import { PanelLoadingState, PanelErrorState, InlineRefreshIndicator } from './shared/PanelStates'
import { ExpandableFileList } from './shared/ExpandableFileList'
import './RepoDetailPanel.css'
import './RepoCommitPanels.css'
import './PRFilesChangedPanel.css'

interface PRFilesChangedPanelProps {
  pr: PRDetailInfo
}

export function PRFilesChangedPanel({ pr }: PRFilesChangedPanelProps) {
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url), [pr.url])
  const owner = ownerRepo?.owner ?? null
  const repo = ownerRepo?.repo ?? null
  const cacheKey = owner && repo ? `pr-files:${owner}/${repo}/${pr.id}` : null

  const {
    data: detail,
    loading,
    error: fetchError,
    refresh,
  } = useGitHubData<PRFilesChangedSummary>({
    cacheKey,
    taskName: `pr-files-${pr.repository}-${pr.id}`,
    fetchFn: client => client.fetchPRFilesChanged(owner!, repo!, pr.id),
  })

  // Surface a parse error when URL is unparseable (cacheKey is null → hook won't fetch)
  const error = !cacheKey ? 'Could not parse owner/repo from PR URL' : fetchError

  if (loading && !detail) {
    return <PanelLoadingState message="Loading changed files..." />
  }

  if (error && !detail) {
    return (
      <PanelErrorState
        title="Failed to load changed files"
        error={error}
        onRetry={cacheKey ? refresh : undefined}
      />
    )
  }

  if (!detail) return null

  return (
    <div className="pr-files-container">
      {loading && detail && <InlineRefreshIndicator message="Refreshing changed files..." />}

      <div className="pr-files-summary-grid">
        <div className="repo-detail-card pr-files-summary-card">
          <div className="pr-files-summary-label">Files</div>
          <div className="pr-files-summary-value">{detail.files.length}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card pr-files-summary-card-added">
          <div className="pr-files-summary-label">Additions</div>
          <div className="pr-files-summary-value">+{detail.additions}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card pr-files-summary-card-removed">
          <div className="pr-files-summary-label">Deletions</div>
          <div className="pr-files-summary-value">-{detail.deletions}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card">
          <div className="pr-files-summary-label">Changes</div>
          <div className="pr-files-summary-value">{detail.changes}</div>
        </div>
      </div>

      <div className="pr-files-toolbar repo-detail-card">
        <div className="pr-files-toolbar-copy">
          <FileCode2 size={16} />
          <span>Files changed</span>
        </div>
        <button className="repo-detail-action-btn" onClick={refresh}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {detail.files.length === 0 ? (
        <div className="repo-commits-empty">
          <FileCode2 size={28} />
          <p>No changed files were reported for this pull request.</p>
        </div>
      ) : (
        <ExpandableFileList files={detail.files} resetKey={`${pr.id}:${pr.url}`} />
      )}
    </div>
  )
}
