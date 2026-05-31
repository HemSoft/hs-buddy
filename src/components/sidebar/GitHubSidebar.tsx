import { useCallback } from 'react'
import { ChevronDown, ChevronRight, GitPullRequest, Building2, Filter } from 'lucide-react'
import { SidebarPRContextMenu } from './github-sidebar/SidebarPRContextMenu'
import { SidebarUserContextMenu } from './github-sidebar/SidebarUserContextMenu'
import { PRTreeSection } from './github-sidebar/PRTreeSection'
import { OrgRepoTree } from './github-sidebar/OrgRepoTree'
import { useGitHubSidebarData } from './github-sidebar/useGitHubSidebarData'
import { useRefreshIndicators } from '../../hooks/useRefreshIndicators'
import { useRalphLoops } from '../../hooks/useRalphLoops'
import { IPC_INVOKE } from '../../ipc/contracts'

type SidebarData = ReturnType<typeof useGitHubSidebarData>

function SidebarPRContextMenuWrapper(
  data: Pick<
    SidebarData,
    | 'prContextMenu'
    | 'approvingPrKeys'
    | 'bookmarkedRepoKeys'
    | 'setPrContextMenu'
    | 'copyToClipboard'
    | 'openPRReview'
    | 'handleApprovePR'
    | 'toggleBookmarkRepoByValues'
  >
) {
  const {
    prContextMenu,
    approvingPrKeys,
    bookmarkedRepoKeys,
    setPrContextMenu,
    copyToClipboard,
    openPRReview,
    handleApprovePR,
    toggleBookmarkRepoByValues,
  } = data
  if (!prContextMenu) return null
  return (
    <SidebarPRContextMenu
      pr={prContextMenu.pr}
      x={prContextMenu.x}
      y={prContextMenu.y}
      approvingPrKeys={approvingPrKeys}
      bookmarkedRepoKeys={bookmarkedRepoKeys}
      onOpen={() => {
        window.shell.openExternal(prContextMenu.pr.url)
        setPrContextMenu(null)
      }}
      onCopyLink={async () => {
        try {
          await copyToClipboard(prContextMenu.pr.url)
        } catch (error: unknown) {
          console.error('Failed to copy PR link:', error)
        }
        setPrContextMenu(null)
      }}
      onAIReview={() => {
        openPRReview(prContextMenu.pr)
        setPrContextMenu(null)
      }}
      onApprove={async () => {
        await handleApprovePR(prContextMenu.pr)
        setPrContextMenu(null)
      }}
      onBookmark={async () => {
        const pr = prContextMenu.pr
        await toggleBookmarkRepoByValues(
          pr.org || '',
          pr.repository,
          pr.url.replace(/\/pull\/\d+$/, '')
        )
        setPrContextMenu(null)
      }}
      onClose={() => setPrContextMenu(null)}
    />
  )
}

function SidebarUserContextMenuWrapper(
  data: Pick<
    SidebarData,
    | 'userContextMenu'
    | 'orgMembers'
    | 'favoriteUsers'
    | 'setUserContextMenu'
    | 'refreshUser'
    | 'toggleFavoriteUser'
  >
) {
  const {
    userContextMenu,
    orgMembers,
    favoriteUsers,
    setUserContextMenu,
    refreshUser,
    toggleFavoriteUser,
  } = data
  if (!userContextMenu) return null
  const m = orgMembers[userContextMenu.org]?.find(m => m.login === userContextMenu.login)
  const displayName = m?.name ? `${m.name} (${m.login})` : userContextMenu.login
  return (
    <SidebarUserContextMenu
      displayName={displayName}
      org={userContextMenu.org}
      x={userContextMenu.x}
      y={userContextMenu.y}
      isFavorite={favoriteUsers.has(`${userContextMenu.org}/${userContextMenu.login}`)}
      onOpenProfile={() => {
        window.shell.openExternal(`https://github.com/${userContextMenu.login}`)
        setUserContextMenu(null)
      }}
      onRefresh={() => {
        refreshUser(userContextMenu.org, userContextMenu.login)
        setUserContextMenu(null)
      }}
      onToggleFavorite={() => {
        toggleFavoriteUser(userContextMenu.org, userContextMenu.login)
        setUserContextMenu(null)
      }}
      onClose={() => setUserContextMenu(null)}
    />
  )
}

interface GitHubSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
}

function SectionHeader({
  expanded,
  icon,
  label,
  onToggle,
  action,
}: {
  expanded: boolean
  icon: React.ReactNode
  label: string
  onToggle: () => void
  action?: React.ReactNode
}) {
  return (
    <div className="sidebar-section-header">
      <button
        type="button"
        className="sidebar-section-toggle"
        onClick={onToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        <span className="sidebar-section-title">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="sidebar-section-icon">{icon}</span>
          <span>{label}</span>
        </span>
      </button>
      {action}
    </div>
  )
}

function PullRequestsSection({
  sidebarData,
  counts,
  badgeProgress,
  refreshIndicators,
  selectedItem,
  onItemSelect,
}: {
  sidebarData: SidebarData
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
  refreshIndicators: ReturnType<typeof useRefreshIndicators>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  const isExpanded = sidebarData.expandedSections.has('pull-requests')

  return (
    <div className="sidebar-section">
      <SectionHeader
        expanded={isExpanded}
        icon={<GitPullRequest size={16} />}
        label="Pull Requests"
        onToggle={() => sidebarData.toggleSection('pull-requests')}
      />
      {isExpanded && (
        <div className="sidebar-section-items">
          <PRTreeSection
            prItems={sidebarData.prItems}
            prTreeData={sidebarData.prTreeData}
            expandedPrGroups={sidebarData.expandedPrGroups}
            expandedPRNodes={sidebarData.expandedPRNodes}
            counts={counts}
            badgeProgress={badgeProgress}
            newCounts={sidebarData.newPRCounts}
            newUrls={sidebarData.newPRUrls}
            refreshIndicators={refreshIndicators}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            onTogglePRGroup={sidebarData.togglePRGroup}
            onTogglePRNode={sidebarData.togglePRNode}
            onContextMenu={sidebarData.openTreePRContextMenu}
          />
        </div>
      )}
    </div>
  )
}

function getBookmarkedOnlyButtonClass(showBookmarkedOnly: boolean): string {
  return `sidebar-filter-btn ${showBookmarkedOnly ? 'active' : ''}`
}

function getBookmarkedOnlyTitle(showBookmarkedOnly: boolean): string {
  return showBookmarkedOnly ? 'Showing bookmarked only' : 'Showing all repos'
}

function toggleBookmarkedOnly(setShowBookmarkedOnly: SidebarData['setShowBookmarkedOnly']): void {
  setShowBookmarkedOnly(prev => {
    const next = !prev
    window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_SHOW_BOOKMARKED_ONLY, next).catch(() => {})
    return next
  })
}

function OrganizationsSection({
  sidebarData,
  ralphRuns,
  refreshIndicators,
  selectedItem,
  onItemSelect,
}: {
  sidebarData: SidebarData
  ralphRuns: ReturnType<typeof useRalphLoops>['runs']
  refreshIndicators: ReturnType<typeof useRefreshIndicators>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  const isExpanded = sidebarData.expandedSections.has('organizations')
  const filterButton = (
    <button
      type="button"
      className={getBookmarkedOnlyButtonClass(sidebarData.showBookmarkedOnly)}
      onClick={e => {
        e.stopPropagation()
        toggleBookmarkedOnly(sidebarData.setShowBookmarkedOnly)
      }}
      title={getBookmarkedOnlyTitle(sidebarData.showBookmarkedOnly)}
    >
      <Filter size={14} />
    </button>
  )
  const sd = sidebarData

  return (
    <div className="sidebar-section">
      <SectionHeader
        expanded={isExpanded}
        icon={<Building2 size={16} />}
        label="Organizations"
        onToggle={() => sd.toggleSection('organizations')}
        action={filterButton}
      />
      {isExpanded && (
        <OrgRepoTree
          uniqueOrgs={sd.uniqueOrgs}
          orgRepos={sd.orgRepos}
          orgMeta={sd.orgMeta}
          orgMembers={sd.orgMembers}
          loadingOrgMembers={sd.loadingOrgMembers}
          expandedOrgUserGroups={sd.expandedOrgUserGroups}
          orgTeams={sd.orgTeams}
          loadingOrgTeams={sd.loadingOrgTeams}
          expandedOrgTeamGroups={sd.expandedOrgTeamGroups}
          expandedTeams={sd.expandedTeams}
          teamMembers={sd.teamMembers}
          loadingTeamMembers={sd.loadingTeamMembers}
          orgContributorCounts={sd.orgContributorCounts}
          loadingOrgs={sd.loadingOrgs}
          expandedOrgs={sd.expandedOrgs}
          expandedRepos={sd.expandedRepos}
          expandedRepoIssueGroups={sd.expandedRepoIssueGroups}
          expandedRepoIssueStateGroups={sd.expandedRepoIssueStateGroups}
          expandedRepoPRGroups={sd.expandedRepoPRGroups}
          expandedRepoPRStateGroups={sd.expandedRepoPRStateGroups}
          expandedRepoCommitGroups={sd.expandedRepoCommitGroups}
          expandedPRNodes={sd.expandedPRNodes}
          repoCounts={sd.repoCounts}
          loadingRepoCounts={sd.loadingRepoCounts}
          repoPrTreeData={sd.repoPrTreeData}
          repoCommitTreeData={sd.repoCommitTreeData}
          repoIssueTreeData={sd.repoIssueTreeData}
          loadingRepoCommits={sd.loadingRepoCommits}
          loadingRepoPRs={sd.loadingRepoPRs}
          loadingRepoIssues={sd.loadingRepoIssues}
          sflStatusData={sd.sflStatusData}
          loadingSFLStatus={sd.loadingSFLStatus}
          expandedSFLGroups={sd.expandedSFLGroups}
          ralphRuns={ralphRuns}
          expandedRalphGroups={sd.expandedRalphGroups}
          bookmarkedRepoKeys={sd.bookmarkedRepoKeys}
          showBookmarkedOnly={sd.showBookmarkedOnly}
          selectedItem={selectedItem}
          refreshTick={sd.refreshTick}
          onToggleOrg={sd.toggleOrg}
          onToggleOrgUserGroup={sd.toggleOrgUserGroup}
          onToggleOrgTeamGroup={sd.toggleOrgTeamGroup}
          onToggleTeam={sd.toggleTeam}
          onToggleRepo={sd.toggleRepo}
          onToggleRepoIssueGroup={sd.toggleRepoIssueGroup}
          onToggleRepoIssueStateGroup={sd.toggleRepoIssueStateGroup}
          onToggleRepoPRGroup={sd.toggleRepoPRGroup}
          onToggleRepoPRStateGroup={sd.toggleRepoPRStateGroup}
          onToggleRepoCommitGroup={sd.toggleRepoCommitGroup}
          onToggleSFLGroup={sd.toggleSFLGroup}
          onToggleRalphGroup={sd.toggleRalphGroup}
          onTogglePRNode={sd.togglePRNode}
          onItemSelect={onItemSelect}
          onContextMenu={sd.openTreePRContextMenu}
          onBookmarkToggle={sd.handleBookmarkToggle}
          favoriteUsers={sd.favoriteUsers}
          onUserContextMenu={sd.openUserContextMenu}
          refreshIndicators={refreshIndicators}
        />
      )}
    </div>
  )
}

export function GitHubSidebar({
  onItemSelect,
  selectedItem,
  counts,
  badgeProgress,
}: GitHubSidebarProps) {
  const refreshIndicators = useRefreshIndicators()
  const sidebarData = useGitHubSidebarData()
  const { runs: ralphRuns } = useRalphLoops()

  const handleItemSelect = useCallback(
    (viewId: string) => {
      sidebarData.markPRsAsSeen(viewId)
      onItemSelect(viewId)
    },
    [sidebarData, onItemSelect]
  )

  return (
    <div className="sidebar-panel">
      <SidebarPRContextMenuWrapper {...sidebarData} />
      <SidebarUserContextMenuWrapper {...sidebarData} />
      <div className="sidebar-panel-header">
        <h2>GITHUB</h2>
      </div>
      <div className="sidebar-panel-content">
        <PullRequestsSection
          sidebarData={sidebarData}
          counts={counts}
          badgeProgress={badgeProgress}
          refreshIndicators={refreshIndicators}
          selectedItem={selectedItem}
          onItemSelect={handleItemSelect}
        />
        <OrganizationsSection
          sidebarData={sidebarData}
          ralphRuns={ralphRuns}
          refreshIndicators={refreshIndicators}
          selectedItem={selectedItem}
          onItemSelect={onItemSelect}
        />
      </div>
    </div>
  )
}
