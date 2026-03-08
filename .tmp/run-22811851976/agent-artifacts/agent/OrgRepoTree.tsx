import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  Folder,
  FolderOpen,
  Star,
  GitPullRequest,
  Loader2,
  Filter,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Circle,
  MinusCircle,
} from 'lucide-react'
import type { OrgRepo, RepoCounts } from '../../../api/github'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus, SFLOverallStatus } from '../../../types/sflStatus'
import { SFL_STATUS_LABELS } from '../../../types/sflStatus'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import type { PRDetailSection } from '../../../utils/prDetailView'
import { dataCache } from '../../../services/dataCache'

interface OrgMeta {
  authenticatedAs: string
  isUserNamespace: boolean
}

interface OrgRepoTreeProps {
  uniqueOrgs: string[]
  orgRepos: Record<string, OrgRepo[]>
  orgMeta: Record<string, OrgMeta>
  loadingOrgs: Set<string>
  expandedOrgs: Set<string>
  expandedRepos: Set<string>
  expandedRepoPRGroups: Set<string>
  expandedPRNodes: Set<string>
  repoCounts: Record<string, RepoCounts>
  loadingRepoCounts: Set<string>
  repoPrTreeData: Record<string, PullRequest[]>
  sflStatusData: Record<string, SFLRepoStatus>
  loadingSFLStatus: Set<string>
  expandedSFLGroups: Set<string>
  bookmarkedRepoKeys: Set<string>
  showBookmarkedOnly: boolean
  selectedItem: string | null
  refreshTick: number
  onToggleOrg: (org: string) => void
  onToggleRepo: (org: string, repoName: string) => void
  onToggleRepoPRGroup: (org: string, repoName: string) => void
  onToggleSFLGroup: (org: string, repoName: string) => void
  onTogglePRNode: (prViewId: string) => void
  onItemSelect: (itemId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
  onToggleShowBookmarkedOnly: () => void
}

const prSubNodes: Array<{ key: PRDetailSection; label: string }> = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'commits', label: 'Commits' },
  { key: 'checks', label: 'Checks' },
  { key: 'files-changed', label: 'Files changed' },
  { key: 'ai-reviews', label: 'AI Reviews' },
]

function formatUpdatedAge(fetchedAt: number): string {
  const elapsedMs = Date.now() - fetchedAt
  if (elapsedMs < 60_000) return 'updated now'
  const elapsedMinutes = Math.floor(elapsedMs / 60_000)
  if (elapsedMinutes < 60) return `updated ${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  return `updated ${elapsedHours}h ago`
}

function sflOverallStatusIcon(status: SFLOverallStatus) {
  switch (status) {
    case 'healthy': return <CheckCircle2 size={12} className="sfl-status-icon sfl-status-success" />
    case 'active-work': return <Clock size={12} className="sfl-status-icon sfl-status-info" />
    case 'blocked': return <AlertTriangle size={12} className="sfl-status-icon sfl-status-warning" />
    case 'ready-for-review': return <CircleDot size={12} className="sfl-status-icon sfl-status-info" />
    case 'recent-failure': return <XCircle size={12} className="sfl-status-icon sfl-status-error" />
    default: return <Circle size={12} className="sfl-status-icon sfl-status-muted" />
  }
}

function sflWorkflowStateIcon(state: string, conclusion: string | null) {
  if (state !== 'active') return <MinusCircle size={11} className="sfl-status-icon sfl-status-muted" title="Disabled" />
  if (!conclusion) return <Circle size={11} className="sfl-status-icon sfl-status-muted" title="No runs" />
  switch (conclusion) {
    case 'success': return <CheckCircle2 size={11} className="sfl-status-icon sfl-status-success" title="Success" />
    case 'failure':
    case 'timed_out': return <XCircle size={11} className="sfl-status-icon sfl-status-error" title="Failed" />
    case 'skipped': return <MinusCircle size={11} className="sfl-status-icon sfl-status-muted" title="Skipped" />
    default: return <Clock size={11} className="sfl-status-icon sfl-status-info" title={conclusion} />
  }
}

export function OrgRepoTree({
  uniqueOrgs,
  orgRepos,
  orgMeta,
  loadingOrgs,
  expandedOrgs,
  expandedRepos,
  expandedRepoPRGroups,
  expandedPRNodes,
  repoCounts,
  loadingRepoCounts,
  repoPrTreeData,
  sflStatusData,
  loadingSFLStatus,
  expandedSFLGroups,
  bookmarkedRepoKeys,
  showBookmarkedOnly,
  selectedItem,
  refreshTick,
  onToggleOrg,
  onToggleRepo,
  onToggleRepoPRGroup,
  onToggleSFLGroup,
  onTogglePRNode,
  onItemSelect,
  onContextMenu,
  onBookmarkToggle,
  onToggleShowBookmarkedOnly,
}: OrgRepoTreeProps) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header" role="button" tabIndex={0} onClick={() => {}} onKeyDown={() => {}}>
        <div className="sidebar-section-title">
          <ChevronDown size={14} />
          <span className="sidebar-section-icon">
            <Folder size={16} />
          </span>
          <span>Organizations</span>
        </div>
        <button
          className={`sidebar-filter-btn ${showBookmarkedOnly ? 'active' : ''}`}
          onClick={e => {
            e.stopPropagation()
            onToggleShowBookmarkedOnly()
          }}
          title={showBookmarkedOnly ? 'Showing bookmarked only' : 'Showing all repos'}
        >
          <Filter size={14} />
        </button>
      </div>
      <div className="sidebar-section-items">
        {uniqueOrgs.length === 0 ? (
          <div className="sidebar-item sidebar-item-empty">
            <span className="sidebar-item-label">No accounts configured</span>
          </div>
        ) : (
          uniqueOrgs.map(org => {
            const isOrgExpanded = expandedOrgs.has(org)
            const isLoading = loadingOrgs.has(org)
            const repos = orgRepos[org] ?? []
            const meta = orgMeta[org]
            const filteredRepos = showBookmarkedOnly
              ? repos.filter(r => bookmarkedRepoKeys.has(`${org}/${r.name}`))
              : repos

            return (
              <div key={org} className="sidebar-org-group">
                <div className="sidebar-item sidebar-item-disclosure sidebar-org-item" role="button" tabIndex={0} onClick={() => onToggleOrg(org)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleOrg(org) } }}>
                  <span className="sidebar-item-chevron">
                    {isOrgExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <span className="sidebar-item-icon">
                    {isOrgExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                  </span>
                  <span className="sidebar-item-label">{org}</span>
                  {meta?.isUserNamespace && (
                    <span className="sidebar-namespace-badge" title="User account (not an org)">user</span>
                  )}
                  {isLoading && <Loader2 size={12} className="spin" />}
                  {!isLoading && repos.length > 0 && (
                    <span className="sidebar-item-count">
                      {showBookmarkedOnly ? filteredRepos.length : repos.length}
                    </span>
                  )}
                </div>
                {meta && !isLoading && (
                  <div className="sidebar-org-account" title={`Authenticated via @${meta.authenticatedAs}`}>
                    via @{meta.authenticatedAs}
                  </div>
                )}
                {isOrgExpanded && (
                  <div className="sidebar-org-repos">
                    {isLoading ? (
                      <div className="sidebar-item sidebar-item-empty">
                        <Loader2 size={12} className="spin" />
                        <span className="sidebar-item-label">Loading repos...</span>
                      </div>
                    ) : filteredRepos.length === 0 ? (
                      <div className="sidebar-item sidebar-item-empty">
                        <span className="sidebar-item-label">
                          {showBookmarkedOnly ? 'No bookmarked repos' : 'No repos found'}
                        </span>
                      </div>
                    ) : (
                      filteredRepos.map(repo => {
                        const isBookmarked = bookmarkedRepoKeys.has(`${org}/${repo.name}`)
                        const repoKey = `${org}/${repo.name}`
                        const isRepoExpanded = expandedRepos.has(repoKey)
                        const counts = repoCounts[repoKey]
                        const repoCountsEntry = dataCache.get<RepoCounts>(`repo-counts:${repoKey}`)
                        const repoCountsUpdatedLabel = repoCountsEntry?.fetchedAt
                          ? formatUpdatedAge(repoCountsEntry.fetchedAt)
                          : null
                        const isCountLoading = loadingRepoCounts.has(repoKey)

                        return (
                          <div key={repo.name} className="sidebar-repo-group">
                            <div
                              className="sidebar-item sidebar-item-disclosure sidebar-repo-item"
                              onClick={() => onToggleRepo(org, repo.name)}
                              title={repo.description || repo.fullName}
                            >
                              <span className="sidebar-item-chevron">
                                {isRepoExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              </span>
                              <span className="sidebar-item-icon">
                                {isRepoExpanded ? <FolderOpen size={12} /> : <Folder size={12} />}
                              </span>
                              <span className="sidebar-item-label">{repo.name}</span>
                              {repo.language && <span className="sidebar-repo-lang">{repo.language}</span>}
                              <button
                                className={`sidebar-bookmark-btn ${isBookmarked ? 'active' : ''}`}
                                onClick={e => onBookmarkToggle(e, org, repo.name, repo.url)}
                                title={isBookmarked ? 'Remove bookmark' : 'Bookmark this repo'}
                              >
                                <Star size={12} fill={isBookmarked ? 'currentColor' : 'none'} />
                              </button>
                            </div>
                            {isRepoExpanded && (
                              <div className="sidebar-repo-children">
                                <div
                                  className={`sidebar-item sidebar-repo-child ${selectedItem === `repo-detail:${repoKey}` ? 'selected' : ''}`}
                                  onClick={() => onItemSelect(`repo-detail:${repoKey}`)}
                                >
                                  <span className="sidebar-item-icon"><FileText size={12} /></span>
                                  <span className="sidebar-item-label">Overview</span>
                                </div>
                                <div
                                  className={`sidebar-item sidebar-repo-child ${selectedItem === `repo-issues:${repoKey}` ? 'selected' : ''}`}
                                  onClick={() => onItemSelect(`repo-issues:${repoKey}`)}
                                >
                                  <span className="sidebar-item-icon"><CircleDot size={12} /></span>
                                  <span className="sidebar-item-label">Issues</span>
                                  {isCountLoading ? <Loader2 size={10} className="spin" /> : counts ? <span className="sidebar-item-count">{counts.issues}</span> : null}
                                </div>
                                <div
                                  className={`sidebar-item sidebar-item-disclosure sidebar-repo-child sidebar-repo-pr-row ${selectedItem === `repo-prs:${repoKey}` ? 'selected' : ''}`}
                                  onClick={() => { onItemSelect(`repo-prs:${repoKey}`); onToggleRepoPRGroup(org, repo.name) }}
                                >
                                  <span className="sidebar-item-chevron" onClick={e => { e.stopPropagation(); onToggleRepoPRGroup(org, repo.name) }}>
                                    {expandedRepoPRGroups.has(repoKey) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  </span>
                                  <span className="sidebar-item-icon"><GitPullRequest size={12} /></span>
                                  <span className="sidebar-item-label">Pull Requests</span>
                                  {isCountLoading ? <Loader2 size={10} className="spin" /> : counts ? <span className="sidebar-item-count">{counts.prs}</span> : null}
                                  {!isCountLoading && repoCountsUpdatedLabel && (
                                    <span key={refreshTick} className="sidebar-item-updated-age">{repoCountsUpdatedLabel}</span>
                                  )}
                                </div>
                                {expandedRepoPRGroups.has(repoKey) && (repoPrTreeData[repoKey] || []).length > 0 && (
                                  <div className="sidebar-job-tree sidebar-repo-pr-tree">
                                    <div className="sidebar-job-items">
                                      {(repoPrTreeData[repoKey] || []).map(pr => {
                                        const prViewId = createPRDetailViewId(pr)
                                        const isSelected = selectedItem === prViewId || selectedItem?.startsWith(`${prViewId}?section=`)
                                        return (
                                          <div key={`${repoKey}-${pr.source}-${pr.repository}-${pr.id}`} className="sidebar-pr-group">
                                            <div
                                              className={`sidebar-item sidebar-item-disclosure sidebar-pr-item sidebar-repo-pr-item ${isSelected ? 'selected' : ''}`}
                                              onClick={() => onItemSelect(prViewId)}
                                              onContextMenu={e => onContextMenu(e, pr)}
                                              title={pr.title}
                                            >
                                              <span className="sidebar-item-chevron" onClick={e => { e.stopPropagation(); onTogglePRNode(prViewId) }}>
                                                {expandedPRNodes.has(prViewId) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                              </span>
                                              <span className="sidebar-item-icon"><GitPullRequest size={12} /></span>
                                              <span className="sidebar-item-label">#{pr.id} {pr.title}</span>
                                              <span className="sidebar-pr-meta">{pr.repository}</span>
                                            </div>
                                            {expandedPRNodes.has(prViewId) && (
                                              <div className="sidebar-pr-children">
                                                {prSubNodes.map(node => {
                                                  const childViewId = createPRDetailViewId(pr, node.key)
                                                  return (
                                                    <div
                                                      key={childViewId}
                                                      className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                                                      onClick={() => onItemSelect(childViewId)}
                                                    >
                                                      <span className="sidebar-item-icon"><FileText size={11} /></span>
                                                      <span className="sidebar-item-label">{node.label}</span>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* SFL Loop node */}
                                {(() => {
                                  const sflStatus = sflStatusData[repoKey]
                                  const isSFLLoading = loadingSFLStatus.has(repoKey)
                                  const isSFLExpanded = expandedSFLGroups.has(repoKey)
                                  if (sflStatus && !sflStatus.isSFLEnabled) return null
                                  if (!sflStatus && !isSFLLoading && !isSFLExpanded) {
                                    return (
                                      <div
                                        className="sidebar-item sidebar-item-disclosure sidebar-repo-child"
                                        onClick={() => onToggleSFLGroup(org, repo.name)}
                                      >
                                        <span className="sidebar-item-chevron">
                                          <ChevronRight size={12} />
                                        </span>
                                        <span className="sidebar-item-icon"><Activity size={12} /></span>
                                        <span className="sidebar-item-label">SFL Loop</span>
                                      </div>
                                    )
                                  }
                                  return (
                                    <>
                                      <div
                                        className="sidebar-item sidebar-item-disclosure sidebar-repo-child"
                                        onClick={() => onToggleSFLGroup(org, repo.name)}
                                      >
                                        <span className="sidebar-item-chevron" onClick={e => { e.stopPropagation(); onToggleSFLGroup(org, repo.name) }}>
                                          {isSFLExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </span>
                                        <span className="sidebar-item-icon"><Activity size={12} /></span>
                                        <span className="sidebar-item-label">SFL Loop</span>
                                        {isSFLLoading && <Loader2 size={10} className="spin" />}
                                        {sflStatus?.isSFLEnabled && !isSFLLoading && (
                                          <span className="sidebar-sfl-status-badge" title={SFL_STATUS_LABELS[sflStatus.overallStatus]}>
                                            {sflOverallStatusIcon(sflStatus.overallStatus)}
                                          </span>
                                        )}
                                      </div>
                                      {isSFLExpanded && sflStatus?.isSFLEnabled && (
                                        <div className="sidebar-job-tree sidebar-sfl-tree">
                                          <div className="sidebar-job-items">
                                            <div className="sidebar-item sidebar-sfl-summary">
                                              {sflOverallStatusIcon(sflStatus.overallStatus)}
                                              <span className="sidebar-item-label">{SFL_STATUS_LABELS[sflStatus.overallStatus]}</span>
                                              <span className="sidebar-item-count">{sflStatus.workflows.length}</span>
                                            </div>
                                            {sflStatus.workflows.map(wf => (
                                              <div
                                                key={wf.id}
                                                className="sidebar-item sidebar-sfl-workflow"
                                                title={`${wf.name} — ${wf.state === 'active' ? 'enabled' : 'disabled'}${wf.latestRun ? `, last: ${wf.latestRun.conclusion || wf.latestRun.status}` : ''}`}
                                              >
                                                {sflWorkflowStateIcon(wf.state, wf.latestRun?.conclusion ?? null)}
                                                <span className="sidebar-item-label">{wf.name.replace(/^SFL:\s*/i, '')}</span>
                                                {wf.state !== 'active' && <span className="sidebar-sfl-disabled-badge">off</span>}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {isSFLExpanded && !sflStatus?.isSFLEnabled && !isSFLLoading && (
                                        <div className="sidebar-job-tree sidebar-sfl-tree">
                                          <div className="sidebar-job-items">
                                            <div className="sidebar-item sidebar-sfl-summary">
                                              <span className="sidebar-item-label">No SFL workflows detected</span>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
