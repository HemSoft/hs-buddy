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

function PullRequestsSection({
  data,
  counts,
  badgeProgress,
  selectedItem,
  refreshIndicators,
  onItemSelect,
}: {
  data: Pick<
    SidebarData,
    | 'expandedSections'
    | 'toggleSection'
    | 'prItems'
    | 'prTreeData'
    | 'expandedPrGroups'
    | 'expandedPRNodes'
    | 'togglePRGroup'
    | 'togglePRNode'
    | 'newPRCounts'
    | 'newPRUrls'
    | 'openTreePRContextMenu'
  >
  counts: GitHubSidebarProps['counts']
  badgeProgress: GitHubSidebarProps['badgeProgress']
  selectedItem: GitHubSidebarProps['selectedItem']
  refreshIndicators: ReturnType<typeof useRefreshIndicators>
  onItemSelect: (viewId: string) => void
}) {
  const isExpanded = data.expandedSections.has('pull-requests')

  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header"
        role="button"
        tabIndex={0}
        onClick={() => data.toggleSection('pull-requests')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            data.toggleSection('pull-requests')
          }
        }}
      >
        <div className="sidebar-section-title">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="sidebar-section-icon">
            <GitPullRequest size={16} />
          </span>
          <span>Pull Requests</span>
        </div>
      </div>
      {isExpanded && (
        <div className="sidebar-section-items">
          <PRTreeSection
            prItems={data.prItems}
            prTreeData={data.prTreeData}
            expandedPrGroups={data.expandedPrGroups}
            expandedPRNodes={data.expandedPRNodes}
            counts={counts}
            badgeProgress={badgeProgress}
            newCounts={data.newPRCounts}
            newUrls={data.newPRUrls}
            refreshIndicators={refreshIndicators}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            onTogglePRGroup={data.togglePRGroup}
            onTogglePRNode={data.togglePRNode}
            onContextMenu={data.openTreePRContextMenu}
          />
        </div>
      )}
    </div>
  )
}

function OrganizationsSection({
  data,
  selectedItem,
  refreshIndicators,
  ralphRuns,
  onItemSelect,
}: {
  data: Pick<
    SidebarData,
    | 'bookmarkedRepoKeys'
    | 'expandedSections'
    | 'expandedPRNodes'
    | 'uniqueOrgs'
    | 'orgRepos'
    | 'orgMeta'
    | 'orgMembers'
    | 'loadingOrgMembers'
    | 'expandedOrgUserGroups'
    | 'orgTeams'
    | 'loadingOrgTeams'
    | 'expandedOrgTeamGroups'
    | 'expandedTeams'
    | 'teamMembers'
    | 'loadingTeamMembers'
    | 'orgContributorCounts'
    | 'loadingOrgs'
    | 'expandedOrgs'
    | 'expandedRepos'
    | 'expandedRepoIssueGroups'
    | 'expandedRepoIssueStateGroups'
    | 'expandedRepoPRGroups'
    | 'expandedRepoPRStateGroups'
    | 'expandedRepoCommitGroups'
    | 'repoCounts'
    | 'loadingRepoCounts'
    | 'repoPrTreeData'
    | 'repoCommitTreeData'
    | 'repoIssueTreeData'
    | 'loadingRepoCommits'
    | 'loadingRepoPRs'
    | 'loadingRepoIssues'
    | 'sflStatusData'
    | 'loadingSFLStatus'
    | 'expandedSFLGroups'
    | 'expandedRalphGroups'
    | 'showBookmarkedOnly'
    | 'setShowBookmarkedOnly'
    | 'refreshTick'
    | 'toggleSection'
    | 'toggleOrg'
    | 'toggleOrgUserGroup'
    | 'toggleOrgTeamGroup'
    | 'toggleTeam'
    | 'toggleRepo'
    | 'toggleRepoIssueGroup'
    | 'toggleRepoIssueStateGroup'
    | 'toggleRepoPRGroup'
    | 'toggleRepoPRStateGroup'
    | 'toggleRepoCommitGroup'
    | 'toggleSFLGroup'
    | 'toggleRalphGroup'
    | 'togglePRNode'
    | 'openTreePRContextMenu'
    | 'handleBookmarkToggle'
    | 'favoriteUsers'
    | 'openUserContextMenu'
  >
  selectedItem: GitHubSidebarProps['selectedItem']
  refreshIndicators: ReturnType<typeof useRefreshIndicators>
  ralphRuns: ReturnType<typeof useRalphLoops>['runs']
  onItemSelect: GitHubSidebarProps['onItemSelect']
}) {
  const isExpanded = data.expandedSections.has('organizations')

  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header"
        role="button"
        tabIndex={0}
        onClick={() => data.toggleSection('organizations')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            data.toggleSection('organizations')
          }
        }}
      >
        <div className="sidebar-section-title">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="sidebar-section-icon">
            <Building2 size={16} />
          </span>
          <span>Organizations</span>
        </div>
        <button
          className={`sidebar-filter-btn ${data.showBookmarkedOnly ? 'active' : ''}`}
          onClick={e => {
            e.stopPropagation()
            data.setShowBookmarkedOnly(prev => {
              const next = !prev
              window.ipcRenderer
                .invoke(IPC_INVOKE.CONFIG_SET_SHOW_BOOKMARKED_ONLY, next)
                .catch(() => {})
              return next
            })
          }}
          title={data.showBookmarkedOnly ? 'Showing bookmarked only' : 'Showing all repos'}
        >
          <Filter size={14} />
        </button>
      </div>
      {isExpanded && (
        <OrgRepoTree
          uniqueOrgs={data.uniqueOrgs}
          orgRepos={data.orgRepos}
          orgMeta={data.orgMeta}
          orgMembers={data.orgMembers}
          loadingOrgMembers={data.loadingOrgMembers}
          expandedOrgUserGroups={data.expandedOrgUserGroups}
          orgTeams={data.orgTeams}
          loadingOrgTeams={data.loadingOrgTeams}
          expandedOrgTeamGroups={data.expandedOrgTeamGroups}
          expandedTeams={data.expandedTeams}
          teamMembers={data.teamMembers}
          loadingTeamMembers={data.loadingTeamMembers}
          orgContributorCounts={data.orgContributorCounts}
          loadingOrgs={data.loadingOrgs}
          expandedOrgs={data.expandedOrgs}
          expandedRepos={data.expandedRepos}
          expandedRepoIssueGroups={data.expandedRepoIssueGroups}
          expandedRepoIssueStateGroups={data.expandedRepoIssueStateGroups}
          expandedRepoPRGroups={data.expandedRepoPRGroups}
          expandedRepoPRStateGroups={data.expandedRepoPRStateGroups}
          expandedRepoCommitGroups={data.expandedRepoCommitGroups}
          expandedPRNodes={data.expandedPRNodes}
          repoCounts={data.repoCounts}
          loadingRepoCounts={data.loadingRepoCounts}
          repoPrTreeData={data.repoPrTreeData}
          repoCommitTreeData={data.repoCommitTreeData}
          repoIssueTreeData={data.repoIssueTreeData}
          loadingRepoCommits={data.loadingRepoCommits}
          loadingRepoPRs={data.loadingRepoPRs}
          loadingRepoIssues={data.loadingRepoIssues}
          sflStatusData={data.sflStatusData}
          loadingSFLStatus={data.loadingSFLStatus}
          expandedSFLGroups={data.expandedSFLGroups}
          ralphRuns={ralphRuns}
          expandedRalphGroups={data.expandedRalphGroups}
          bookmarkedRepoKeys={data.bookmarkedRepoKeys}
          showBookmarkedOnly={data.showBookmarkedOnly}
          selectedItem={selectedItem}
          refreshTick={data.refreshTick}
          onToggleOrg={data.toggleOrg}
          onToggleOrgUserGroup={data.toggleOrgUserGroup}
          onToggleOrgTeamGroup={data.toggleOrgTeamGroup}
          onToggleTeam={data.toggleTeam}
          onToggleRepo={data.toggleRepo}
          onToggleRepoIssueGroup={data.toggleRepoIssueGroup}
          onToggleRepoIssueStateGroup={data.toggleRepoIssueStateGroup}
          onToggleRepoPRGroup={data.toggleRepoPRGroup}
          onToggleRepoPRStateGroup={data.toggleRepoPRStateGroup}
          onToggleRepoCommitGroup={data.toggleRepoCommitGroup}
          onToggleSFLGroup={data.toggleSFLGroup}
          onToggleRalphGroup={data.toggleRalphGroup}
          onTogglePRNode={data.togglePRNode}
          onItemSelect={onItemSelect}
          onContextMenu={data.openTreePRContextMenu}
          onBookmarkToggle={data.handleBookmarkToggle}
          favoriteUsers={data.favoriteUsers}
          onUserContextMenu={data.openUserContextMenu}
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
  const { markPRsAsSeen } = sidebarData

  const handleItemSelect = useCallback(
    (viewId: string) => {
      markPRsAsSeen(viewId)
      onItemSelect(viewId)
    },
    [markPRsAsSeen, onItemSelect]
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
          data={sidebarData}
          counts={counts}
          badgeProgress={badgeProgress}
          selectedItem={selectedItem}
          refreshIndicators={refreshIndicators}
          onItemSelect={handleItemSelect}
        />
        <OrganizationsSection
          data={sidebarData}
          selectedItem={selectedItem}
          refreshIndicators={refreshIndicators}
          ralphRuns={ralphRuns}
          onItemSelect={onItemSelect}
        />
      </div>
    </div>
  )
}
