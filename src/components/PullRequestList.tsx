import './PullRequestList.css'
import {
  GitPullRequest,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { PRItem } from './pull-request-list/PRItem'
import { PRContextMenu } from './pull-request-list/PRContextMenu'
import { usePRListData } from './pull-request-list/usePRListData'

interface PullRequestListProps {
  mode: 'my-prs' | 'needs-review' | 'recently-merged' | 'need-a-nudge'
  onCountChange?: (count: number) => void
}

export function PullRequestList({ mode, onCountChange }: PullRequestListProps) {
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
    handleCopyLink,
    handleApprove,
    handleApproveFromMenu,
    closeContextMenu,
    getTitle,
  } = usePRListData(mode, onCountChange)

  if (loading) {
    const progressPercent = progress
      ? Math.round(
          ((progress.currentAccount - (progress.status === 'done' ? 0 : 1)) /
            progress.totalAccounts) *
            100
        )
      : 0

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
              <p className="progress-main">
                {progress.status === 'authenticating' && 'Authenticating...'}
                {progress.status === 'fetching' && 'Fetching PRs...'}
                {progress.status === 'done' && `Found ${progress.prsFound} PRs`}
                {progress.status === 'error' && `Error: ${progress.error}`}
              </p>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="progress-detail">
                Account {progress.currentAccount} of {progress.totalAccounts}:{' '}
                {progress.accountName} ({progress.org})
              </p>
              {totalPrsFound > 0 && (
                <p className="progress-total">
                  {totalPrsFound} PR{totalPrsFound !== 1 ? 's' : ''} found so far
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

  if (error) {
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
          <p className="error-message">⚠️ {error}</p>
          {accounts.length === 0 && (
            <>
              <p className="error-hint">
                You need to configure at least one GitHub account in Settings.
              </p>
              <p className="hint">
                On first launch, environment variables (VITE_GITHUB_USERNAME, VITE_GITHUB_ORG) will
                be migrated to the config automatically.
              </p>
            </>
          )}
          {accounts.length > 0 && (
            <>
              <p className="error-hint">Make sure you're authenticated with GitHub CLI:</p>
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

  if (prs.length === 0) {
    return (
      <div className="pr-list-container">
        <div className="pr-list-header">
          <h2>{getTitle()}</h2>
          <div className="pr-header-actions">
            {updateTimes && (
              <div className="update-times">
                <div className="update-times-content">
                  <span className="update-label">Updated</span>
                  <span className="update-time">{updateTimes.lastUpdated}</span>
                  <span className="update-separator">·</span>
                  <span className="update-label">Next</span>
                  <span className="update-time">{updateTimes.nextUpdate}</span>
                </div>
                <div className="update-progress-track">
                  <div
                    className="update-progress-bar"
                    style={{
                      width: `${updateTimes.progress}%`,
                      backgroundColor: getProgressColor(updateTimes.progress),
                    }}
                  />
                </div>
              </div>
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

  return (
    <div className="pr-list-container">
      <div className="pr-list-header">
        <h2>{getTitle()}</h2>
        <div className="pr-header-actions">
          <span className="pr-count">
            {prs.length} PR{prs.length !== 1 ? 's' : ''}
            {refreshing && <span className="refreshing-badge">Refreshing...</span>}
          </span>
          {updateTimes && (
            <div className="update-times">
              <div className="update-times-content">
                <span className="update-label">Updated</span>
                <span className="update-time">{updateTimes.lastUpdated}</span>
                <span className="update-separator">·</span>
                <span className="update-label">Next</span>
                <span className="update-time">{updateTimes.nextUpdate}</span>
              </div>
              <div className="update-progress-track">
                <div
                  className="update-progress-bar"
                  style={{
                    width: `${updateTimes.progress}%`,
                    backgroundColor: getProgressColor(updateTimes.progress),
                  }}
                />
              </div>
            </div>
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
      <div className="pr-list">
        {contextMenu && (
          <PRContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            pr={contextMenu.pr}
            bookmarkedRepoKeys={bookmarkedRepoKeys}
            onAIReview={handleAIReview}
            onApprove={handleApproveFromMenu}
            onCopyLink={handleCopyLink}
            onBookmark={handleBookmarkRepo}
            onClose={closeContextMenu}
          />
        )}
        {prs.map(pr => (
          <PRItem
            key={`${pr.source}-${pr.id}-${pr.repository}`}
            pr={pr}
            mode={mode}
            approving={approving}
            onApprove={handleApprove}
            onContextMenu={handleContextMenu}
            onOpen={(url: string) => window.shell.openExternal(url)}
          />
        ))}
      </div>
    </div>
  )
}
