import { FileCode2, RefreshCw } from 'lucide-react'
import type { PRFilesChangedSummary } from '../api/github'
import { usePRPanelData } from '../hooks/usePRPanelData'
import type { PRDetailInfo } from '../utils/prDetailView'
import { PanelLoadingState, PanelErrorState, InlineRefreshIndicator } from './shared/PanelStates'
import { ExpandableFileList } from './shared/ExpandableFileList'
import './RepoDetailPanel.css'
import './RepoCommitPanels.css'
import './PRFilesChangedPanel.css'

interface PRFilesChangedPanelProps {
  pr: PRDetailInfo
}

function renderFilesGuard(
  detail: PRFilesChangedSummary | null,
  loading: boolean,
  error: string | null,
  cacheKey: string | null,
  refresh: () => Promise<void>
): React.JSX.Element | null {
  if (detail) return null
  if (loading) return <PanelLoadingState message="Loading changed files..." />
  if (error) {
    return (
      <PanelErrorState
        title="Failed to load changed files"
        error={error}
        onRetry={cacheKey ? refresh : undefined}
      />
    )
  }
  return null
}

export function PRFilesChangedPanel({ pr }: PRFilesChangedPanelProps) {
  const {
    data: detail,
    loading,
    error,
    refresh,
    cacheKey,
  } = usePRPanelData<PRFilesChangedSummary>(pr, 'pr-files', (client, owner, repo, prNumber) =>
    client.fetchPRFilesChanged(owner, repo, prNumber)
  )
  const guard = renderFilesGuard(detail, loading, error, cacheKey, refresh)
  if (guard) return guard

  const filesDetail = detail as PRFilesChangedSummary

  return (
    <div className="pr-files-container">
      {loading && <InlineRefreshIndicator message="Refreshing changed files..." />}

      <div className="pr-files-summary-grid">
        <div className="repo-detail-card pr-files-summary-card">
          <div className="pr-files-summary-label">Files</div>
          <div className="pr-files-summary-value">{filesDetail.files.length}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card pr-files-summary-card-added">
          <div className="pr-files-summary-label">Additions</div>
          <div className="pr-files-summary-value">+{filesDetail.additions}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card pr-files-summary-card-removed">
          <div className="pr-files-summary-label">Deletions</div>
          <div className="pr-files-summary-value">-{filesDetail.deletions}</div>
        </div>
        <div className="repo-detail-card pr-files-summary-card">
          <div className="pr-files-summary-label">Changes</div>
          <div className="pr-files-summary-value">{filesDetail.changes}</div>
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

      {filesDetail.files.length === 0 ? (
        <div className="repo-commits-empty">
          <FileCode2 size={28} />
          <p>No changed files were reported for this pull request.</p>
        </div>
      ) : (
        <ExpandableFileList files={filesDetail.files} resetKey={`${pr.id}:${pr.url}`} />
      )}
    </div>
  )
}
