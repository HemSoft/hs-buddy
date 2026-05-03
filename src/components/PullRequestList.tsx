import './PullRequestList.css'
import './shared/ListView.css'
import {
  GitPullRequest,
  Loader2,
  RefreshCw,
  ThumbsUp,
  CircleCheck,
  MessageSquare,
} from 'lucide-react'
import { PRItem } from './pull-request-list/PRItem'
import { PRContextMenu } from './pull-request-list/PRContextMenu'
import { usePRListData } from './pull-request-list/usePRListData'
import { ViewModeToggle } from './shared/ViewModeToggle'
import { PRStateIcon } from './shared/PRStateIcon'
import { useViewMode, type ViewMode } from '../hooks/useViewMode'
import { formatDistanceToNow } from '../utils/dateUtils'
import { createPRDetailViewId } from '../utils/prDetailView'
import type { PullRequest } from '../types/pullRequest'
import type { PRSearchMode } from '../api/github'

interface UpdateTimesDisplayProps {
  lastUpdated: string
  nextUpdate: string
  progress: number
  getProgressColor: (progress: number) => string
}

function UpdateTimesDisplay({
  lastUpdated,
  nextUpdate,
  progress,
  getProgressColor,
}: UpdateTimesDisplayProps) {
  return (
    <div className="update-times">
      <div className="update-times-content">
        <span className="update-label">Updated</span>
        <span className="update-time">{lastUpdated}</span>
        <span className="update-separator">·</span>
        <span className="update-label">Next</span>
        <span className="update-time">{nextUpdate}</span>
      </div>
      <div className="update-progress-track">
        <div
          className="update-progress-bar"
          style={{
            width: `${progress}%`,
            backgroundColor: getProgressColor(progress),
          }}
        />
      </div>
    </div>
  )
}

interface PRListTableViewProps {
  prs: PullRequest[]
  onOpenPR?: (viewId: string) => void
  handleContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}

function PRListTableView({ prs, onOpenPR, handleContextMenu }: PRListTableViewProps) {
  return (
    <div className="pr-list" style={{ display: 'block', padding: '0' }}>
      <table className="list-view-table">
        <thead>
          <tr>
            <th className="col-status"></th>
            <th className="col-title">Title</th>
            <th>Author</th>
            <th>Repo</th>
            <th>Updated</th>
            <th>Status</th>
            <th>Reviews</th>
          </tr>
        </thead>
        <tbody>
          {prs.map(pr => (
            <tr
              key={`${pr.source}-${pr.id}-${pr.repository}`}
              onClick={() =>
                onOpenPR ? onOpenPR(createPRDetailViewId(pr)) : window.shell.openExternal(pr.url)
              }
              onContextMenu={e => handleContextMenu(e, pr)}
            >
              <td className="col-status">
                <PRStateIcon state={pr.state} />
              </td>
              <td className="col-title">
                <span className="col-number">#{pr.id}</span> {pr.title}
              </td>
              <td className="col-author">
                {pr.authorAvatarUrl && (
                  <img
                    src={pr.authorAvatarUrl}
                    alt={pr.author}
                    className="list-view-avatar"
                    width={18}
                    height={18}
                  />
                )}
                {pr.author}
              </td>
              <td className="col-number">{pr.repository}</td>
              <td className="col-date">{pr.updatedAt ? formatDistanceToNow(pr.updatedAt) : '—'}</td>
              <td>
                {pr.threadsUnaddressed != null ? (
                  pr.threadsUnaddressed === 0 ? (
                    <CircleCheck size={14} className="list-view-comments-clear" />
                  ) : (
                    <span className="list-view-comments-unresolved">
                      <MessageSquare size={12} />
                      {pr.threadsUnaddressed}
                    </span>
                  )
                ) : null}
              </td>
              <td>
                {pr.approvalCount > 0 && (
                  <span
                    className={`list-view-approvals${pr.iApproved ? ' list-view-approvals--mine' : ''}`}
                  >
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
  )
}

interface PullRequestListProps {
  mode: PRSearchMode
  onCountChange?: (count: number) => void
  onOpenPR?: (viewId: string) => void
}

function getProgressLabel(
  progress: NonNullable<ReturnType<typeof usePRListData>['progress']>
): string {
  switch (progress.status) {
    case 'authenticating':
      return 'Authenticating...'
    case 'fetching':
      return 'Fetching PRs...'
    case 'done':
      return `Found ${progress.prsFound} PRs`
    case 'error':
      return `Error: ${progress.error}`
  }
}

function computeProgressPercent(
  progress: NonNullable<ReturnType<typeof usePRListData>['progress']>
): number {
  const offset = progress.status === 'done' ? 0 : 1
  return Math.round(((progress.currentAccount - offset) / progress.totalAccounts) * 100)
}

function PRListLoadingState({
  getTitle,
  progress,
  totalPrsFound,
}: {
  getTitle: () => string
  progress: ReturnType<typeof usePRListData>['progress']
  totalPrsFound: number
}) {
  return (
    <div className="pr-list-container">
      <div className="pr-list-header">
        <h2>{getTitle()}</h2>
        <div className="pr-header-actions">
          <button className="refresh-button" disabled title="Refreshing...">
            <Loader2 size={16} className="spin" />
          </button>
        </div>
      </div>
      <div className="pr-list-loading">
        <Loader2 className="spin" size={24} />
        {progress ? (
          <div className="loading-progress">
            <p className="progress-main">{getProgressLabel(progress)}</p>
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${computeProgressPercent(progress)}%` }}
              />
            </div>
            <p className="progress-detail">
              Account {progress.currentAccount} of {progress.totalAccounts}: {progress.accountName}{' '}
              ({progress.org})
            </p>
            {totalPrsFound > 0 && (
              <p className="progress-total">
                {/* v8 ignore start */}
                {totalPrsFound} PR{totalPrsFound !== 1 ? 's' : ''} found so far
                {/* v8 ignore stop */}
              </p>
            )}
          </div>
        ) : (
          <p>Loading pull requests...</p>
        )}
      </div>
    </div>
  )
}

function PRListErrorState({
  getTitle,
  accounts,
  error,
  handleManualRefresh,
}: {
  getTitle: () => string
  accounts: ReturnType<typeof usePRListData>['accounts']
  error: string
  handleManualRefresh: () => void
}) {
  return (
    <div className="pr-list-container">
      <div className="pr-list-header">
        <h2>{getTitle()}</h2>
        <div className="pr-header-actions">
          <button className="refresh-button" onClick={handleManualRefresh} title="Retry">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <div className="pr-list-error">
        <p className="error-message">⚠️ Error loading pull requests</p>
        {error && <p className="error-hint">{error}</p>}
        {accounts.length === 0 && (
          <>
            <p className="error-hint">
              You need to configure at least one GitHub account in Settings.
            </p>
            <p className="hint">
              On first launch, environment variables (VITE_GITHUB_USERNAME, VITE_GITHUB_ORG) will be
              migrated to the config automatically.
            </p>
          </>
        )}
        {accounts.length > 0 && (
          <>
            <p className="error-hint">Make sure you&apos;re authenticated with GitHub CLI:</p>
            <ul>
              <li>
                <code>gh auth status</code> - Check authentication status
              </li>
              <li>
                <code>gh auth login</code> - Log in to GitHub
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function PREmptyState({
  getTitle,
  updateTimes,
  getProgressColor,
  refreshing,
  handleManualRefresh,
}: {
  getTitle: () => string
  updateTimes: { lastUpdated: string; nextUpdate: string; progress: number } | null
  getProgressColor: (progress: number) => string
  refreshing: boolean
  handleManualRefresh: () => void
}) {
  return (
    <div className="pr-list-container">
      <div className="pr-list-header">
        <h2>{getTitle()}</h2>
        <div className="pr-header-actions">
          {updateTimes && (
            <UpdateTimesDisplay
              lastUpdated={updateTimes.lastUpdated}
              nextUpdate={updateTimes.nextUpdate}
              progress={updateTimes.progress}
              getProgressColor={getProgressColor}
            />
          )}
          <button
            className="refresh-button"
            onClick={handleManualRefresh}
            title="Refresh"
            disabled={refreshing}
          >
            {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>
      <div className="pr-list-empty">
        <GitPullRequest size={48} />
        <p>No pull requests found</p>
        <p className="empty-subtitle">All clear! ✨</p>
      </div>
    </div>
  )
}

function PRListActiveHeader({
  title,
  prCount,
  refreshing,
  updateTimes,
  getProgressColor,
  viewMode,
  setViewMode,
  handleManualRefresh,
}: {
  title: string
  prCount: number
  refreshing: boolean
  updateTimes: { lastUpdated: string; nextUpdate: string; progress: number } | null
  getProgressColor: (progress: number) => string
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  handleManualRefresh: () => void
}) {
  return (
    <div className="pr-list-header">
      <h2>{title}</h2>
      <div className="pr-header-actions">
        <span className="pr-count">
          {prCount} PR{prCount !== 1 ? 's' : ''}
          {refreshing && <span className="refreshing-badge">Refreshing...</span>}
        </span>
        {updateTimes && (
          <UpdateTimesDisplay
            lastUpdated={updateTimes.lastUpdated}
            nextUpdate={updateTimes.nextUpdate}
            progress={updateTimes.progress}
            getProgressColor={getProgressColor}
          />
        )}
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        <button
          className="refresh-button"
          onClick={handleManualRefresh}
          title="Refresh"
          disabled={refreshing}
        >
          {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
        </button>
      </div>
    </div>
  )
}

export function PullRequestList({ mode, onCountChange, onOpenPR }: PullRequestListProps) {
  const {
    prs,
    loading,
    refreshing,
    error,
    progress,
    totalPrsFound,
    updateTimes,
    contextMenu,
    approving,
    accounts,
    bookmarkedRepoKeys,
    getProgressColor,
    handleManualRefresh,
    handleContextMenu,
    handleBookmarkRepo,
    handleAIReview,
    handleRequestCopilotReview,
    handleAddressComments,
    handleCopyLink,
    handleApprove,
    handleApproveFromMenu,
    closeContextMenu,
    getTitle,
  } = usePRListData(mode, onCountChange)

  const [viewMode, setViewMode] = useViewMode(`pr-list-${mode}`)

  if (loading) {
    return (
      <PRListLoadingState getTitle={getTitle} progress={progress} totalPrsFound={totalPrsFound} />
    )
  }

  if (error) {
    return (
      <PRListErrorState
        getTitle={getTitle}
        accounts={accounts}
        error={error}
        handleManualRefresh={handleManualRefresh}
      />
    )
  }

  if (prs.length === 0) {
    return (
      <PREmptyState
        getTitle={getTitle}
        updateTimes={updateTimes}
        getProgressColor={getProgressColor}
        refreshing={refreshing}
        handleManualRefresh={handleManualRefresh}
      />
    )
  }

  return (
    <div className="pr-list-container">
      <PRListActiveHeader
        title={getTitle()}
        prCount={prs.length}
        refreshing={refreshing}
        updateTimes={updateTimes}
        getProgressColor={getProgressColor}
        viewMode={viewMode}
        setViewMode={setViewMode}
        handleManualRefresh={handleManualRefresh}
      />
      {viewMode === 'list' ? (
        <PRListTableView prs={prs} onOpenPR={onOpenPR} handleContextMenu={handleContextMenu} />
      ) : (
        <div className="pr-list">
          {prs.map(pr => (
            <PRItem
              key={`${pr.source}-${pr.id}-${pr.repository}`}
              pr={pr}
              mode={mode}
              approving={approving}
              onApprove={handleApprove}
              onContextMenu={handleContextMenu}
              onOpen={
                pr =>
                  /* v8 ignore start */
                  onOpenPR ? onOpenPR(createPRDetailViewId(pr)) : window.shell.openExternal(pr.url)
                /* v8 ignore stop */
              }
            />
          ))}
        </div>
      )}
      {contextMenu && (
        <PRContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          pr={contextMenu.pr}
          bookmarkedRepoKeys={bookmarkedRepoKeys}
          onAIReview={handleAIReview}
          onRequestCopilotReview={handleRequestCopilotReview}
          onAddressComments={handleAddressComments}
          onApprove={handleApproveFromMenu}
          onCopyLink={handleCopyLink}
          onBookmark={handleBookmarkRepo}
          onClose={closeContextMenu}
        />
      )}
    </div>
  )
}
