import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderOpen,
  Loader2,
  Star,
  Users,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type {
  OrgRepo,
  OrgMember,
  OrgTeam,
  TeamMember,
  RepoCounts,
  RepoCommit,
  RepoIssue,
} from '../../../api/github'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus } from '../../../types/sflStatus'
import type { RalphRunInfo } from '../../../types/ralph'
import type { RefreshIndicators } from '../../../hooks/useRefreshIndicators'
import { RepoNode } from './RepoNode'
import { handleItemKeyDown, refreshStateClass, sidebarItemClass } from './repoNodeUtils'

function orgRefreshClass(org: string, indicators?: RefreshIndicators): string {
  return indicators ? refreshStateClass(indicators[`org-repos:${org}`]) : ''
}

interface OrgMeta {
  authenticatedAs: string
  isUserNamespace: boolean
}

interface OrgRepoTreeProps {
  uniqueOrgs: string[]
  orgRepos: Record<string, OrgRepo[]>
  orgMeta: Record<string, OrgMeta>
  orgMembers: Record<string, OrgMember[]>
  loadingOrgMembers: ReadonlySet<string>
  expandedOrgUserGroups: ReadonlySet<string>
  orgTeams: Record<string, OrgTeam[]>
  loadingOrgTeams: ReadonlySet<string>
  expandedOrgTeamGroups: ReadonlySet<string>
  expandedTeams: ReadonlySet<string>
  teamMembers: Record<string, TeamMember[]>
  loadingTeamMembers: ReadonlySet<string>
  orgContributorCounts: Record<string, Record<string, number>>
  loadingOrgs: ReadonlySet<string>
  expandedOrgs: ReadonlySet<string>
  expandedRepos: ReadonlySet<string>
  expandedRepoIssueGroups: ReadonlySet<string>
  expandedRepoIssueStateGroups: ReadonlySet<string>
  expandedRepoPRGroups: ReadonlySet<string>
  expandedRepoPRStateGroups: ReadonlySet<string>
  expandedRepoCommitGroups: ReadonlySet<string>
  expandedPRNodes: ReadonlySet<string>
  repoCounts: Record<string, RepoCounts>
  loadingRepoCounts: ReadonlySet<string>
  repoPrTreeData: Record<string, PullRequest[]>
  repoCommitTreeData: Record<string, RepoCommit[]>
  repoIssueTreeData: Record<string, RepoIssue[]>
  loadingRepoCommits: ReadonlySet<string>
  loadingRepoPRs: ReadonlySet<string>
  loadingRepoIssues: ReadonlySet<string>
  sflStatusData: Record<string, SFLRepoStatus>
  loadingSFLStatus: ReadonlySet<string>
  expandedSFLGroups: ReadonlySet<string>
  ralphRuns: RalphRunInfo[]
  expandedRalphGroups: ReadonlySet<string>
  bookmarkedRepoKeys: ReadonlySet<string>
  showBookmarkedOnly: boolean
  selectedItem: string | null
  refreshTick: number
  onToggleOrg: (org: string) => void
  onToggleOrgUserGroup: (org: string) => void
  onToggleOrgTeamGroup: (org: string) => void
  onToggleTeam: (org: string, teamSlug: string) => void
  onToggleRepo: (org: string, repoName: string) => void
  onToggleRepoIssueGroup: (org: string, repoName: string) => void
  onToggleRepoIssueStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoPRGroup: (org: string, repoName: string) => void
  onToggleRepoPRStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoCommitGroup: (org: string, repoName: string) => void
  onToggleSFLGroup: (org: string, repoName: string) => void
  onToggleRalphGroup: (org: string, repoName: string) => void
  onTogglePRNode: (prViewId: string) => void
  onItemSelect: (itemId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
  favoriteUsers: ReadonlySet<string>
  onUserContextMenu: (e: React.MouseEvent, org: string, login: string) => void
  refreshIndicators?: RefreshIndicators
}

interface OrgHeaderProps {
  org: string
  isOrgExpanded: boolean
  isOrgSelected: boolean
  isLoading: boolean
  meta?: OrgMeta
  repoCount: number
  visibleRepoCount: number
  showBookmarkedOnly: boolean
  refreshIndicators?: RefreshIndicators
  onToggleOrg: (org: string) => void
  onItemSelect: (itemId: string) => void
}

function OrgRepoCount({
  isLoading,
  repoCount,
  visibleRepoCount,
  showBookmarkedOnly,
}: {
  isLoading: boolean
  repoCount: number
  visibleRepoCount: number
  showBookmarkedOnly: boolean
}) {
  if (isLoading) return <Loader2 size={12} className="spin" />
  if (repoCount <= 0) return null
  return (
    <span className="sidebar-item-count">{showBookmarkedOnly ? visibleRepoCount : repoCount}</span>
  )
}

function buildOrgHeaderClassName(
  isOrgSelected: boolean,
  org: string,
  refreshIndicators?: RefreshIndicators
): string {
  return `sidebar-item sidebar-item-disclosure sidebar-org-item ${isOrgSelected ? 'selected' : ''} ${orgRefreshClass(org, refreshIndicators)}`
}

function OrgChevron({ isExpanded }: { isExpanded: boolean }) {
  return isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
}

function OrgFolderIcon({ isExpanded }: { isExpanded: boolean }) {
  return isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
}

function OrgNamespaceBadge({ meta }: { meta?: OrgMeta }) {
  if (!meta || !meta.isUserNamespace) return null
  return (
    <span className="sidebar-namespace-badge" title="User account (not an org)">
      user
    </span>
  )
}

function OrgHeader({
  org,
  isOrgExpanded,
  isOrgSelected,
  isLoading,
  meta,
  repoCount,
  visibleRepoCount,
  showBookmarkedOnly,
  refreshIndicators,
  onToggleOrg,
  onItemSelect,
}: OrgHeaderProps) {
  return (
    <div className={buildOrgHeaderClassName(isOrgSelected, org, refreshIndicators)}>
      <button
        type="button"
        className="sidebar-item-chevron"
        onClick={event => {
          event.stopPropagation()
          onToggleOrg(org)
        }}
        onKeyDown={event => handleItemKeyDown(event, () => onToggleOrg(org), true)}
      >
        <OrgChevron isExpanded={isOrgExpanded} />
      </button>
      <button
        type="button"
        className="sidebar-item-main"
        onClick={() => onItemSelect(`org-detail:${org}`)}
        onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(`org-detail:${org}`))}
      >
        <span className="sidebar-item-icon">
          <OrgFolderIcon isExpanded={isOrgExpanded} />
        </span>
        <span className="sidebar-item-label">{org}</span>
        <OrgNamespaceBadge meta={meta} />
        <OrgRepoCount
          isLoading={isLoading}
          repoCount={repoCount}
          visibleRepoCount={visibleRepoCount}
          showBookmarkedOnly={showBookmarkedOnly}
        />
      </button>
    </div>
  )
}

function TeamMembersList({
  org,
  members,
  selectedItem,
  onItemSelect,
}: {
  org: string
  members: TeamMember[]
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  return (
    <div className="sidebar-team-members-list">
      {members.map(member => {
        const userViewId = `org-user:${org}/${member.login}`
        return (
          <button
            type="button"
            key={member.login}
            className={`sidebar-item sidebar-team-member-child ${selectedItem === userViewId ? 'selected' : ''}`}
            onClick={() => onItemSelect(userViewId)}
            onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(userViewId))}
          >
            <span className="sidebar-item-icon">
              <UserRound size={10} />
            </span>
            <span className="sidebar-item-label" title={member.login}>
              {member.name ? `${member.name} (${member.login})` : member.login}
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface OrgTeamNodeProps {
  org: string
  team: OrgTeam
  expandedTeams: ReadonlySet<string>
  teamMembers: Record<string, TeamMember[]>
  loadingTeamMembers: ReadonlySet<string>
  selectedItem: string | null
  onToggleTeam: (org: string, teamSlug: string) => void
  onItemSelect: (itemId: string) => void
}

function OrgTeamNodeMembers({
  isExpanded,
  isLoading,
  members,
  org,
  selectedItem,
  onItemSelect,
}: {
  isExpanded: boolean
  isLoading: boolean
  members: TeamMember[]
  org: string
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  if (!isExpanded) return null
  if (isLoading) {
    return (
      <div className="sidebar-team-members-list">
        <div className="sidebar-item sidebar-pr-child">
          <span className="sidebar-item-icon">
            <Loader2 size={11} className="spin" />
          </span>
          <span className="sidebar-item-label">Loading members…</span>
        </div>
      </div>
    )
  }
  if (members.length > 0) {
    return (
      <TeamMembersList
        org={org}
        members={members}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
      />
    )
  }
  return (
    <div className="sidebar-team-members-list">
      <div className="sidebar-item sidebar-pr-child">
        <span className="sidebar-item-label">No members</span>
      </div>
    </div>
  )
}

function getTeamNodeMembers(
  teamMembers: Record<string, TeamMember[]>,
  teamKey: string
): TeamMember[] {
  return teamMembers[teamKey] ?? []
}

function getTeamTitle(team: OrgTeam): string {
  return team.description ?? team.name
}

function TeamMemberCount({ isLoading, memberCount }: { isLoading: boolean; memberCount: number }) {
  if (isLoading) return <Loader2 size={10} className="spin" />
  if (memberCount > 0) return <span className="sidebar-item-count">{memberCount}</span>
  return null
}

function OrgTeamNode({
  org,
  team,
  expandedTeams,
  teamMembers,
  loadingTeamMembers,
  selectedItem,
  onToggleTeam,
  onItemSelect,
}: OrgTeamNodeProps) {
  const teamKey = `${org}/${team.slug}`
  const isTeamExpanded = expandedTeams.has(teamKey)
  const teamUserMembers = getTeamNodeMembers(teamMembers, teamKey)
  const isLoadingMembers = loadingTeamMembers.has(teamKey)

  return (
    <div>
      <button
        type="button"
        className="sidebar-item sidebar-item-disclosure sidebar-org-user-child"
        onClick={() => onToggleTeam(org, team.slug)}
        title={getTeamTitle(team)}
        onKeyDown={event => handleItemKeyDown(event, () => onToggleTeam(org, team.slug))}
      >
        <span className="sidebar-item-chevron">
          <OrgChevron isExpanded={isTeamExpanded} />
        </span>
        <span className="sidebar-item-icon">
          <UsersRound size={11} />
        </span>
        <span className="sidebar-item-label">{team.name}</span>
        <TeamMemberCount isLoading={isLoadingMembers} memberCount={team.memberCount} />
      </button>
      <OrgTeamNodeMembers
        isExpanded={isTeamExpanded}
        isLoading={isLoadingMembers}
        members={teamUserMembers}
        org={org}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
      />
    </div>
  )
}

function TeamsSectionContent({
  isLoading,
  teams,
  org,
  expandedTeams,
  teamMembers,
  loadingTeamMembers,
  selectedItem,
  onToggleTeam,
  onItemSelect,
}: {
  isLoading: boolean
  teams: OrgTeam[]
  org: string
  expandedTeams: ReadonlySet<string>
  teamMembers: Record<string, TeamMember[]>
  loadingTeamMembers: ReadonlySet<string>
  selectedItem: string | null
  onToggleTeam: (org: string, teamSlug: string) => void
  onItemSelect: (itemId: string) => void
}) {
  if (isLoading) {
    return (
      <div className="sidebar-org-users-list">
        <div className="sidebar-item sidebar-pr-child">
          <span className="sidebar-item-icon">
            <Loader2 size={11} className="spin" />
          </span>
          <span className="sidebar-item-label">Loading teams…</span>
        </div>
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="sidebar-org-users-list">
        <div className="sidebar-item sidebar-pr-child">
          <span className="sidebar-item-label">No teams found</span>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-org-users-list">
      {teams.map(team => (
        <OrgTeamNode
          key={team.slug}
          org={org}
          team={team}
          expandedTeams={expandedTeams}
          teamMembers={teamMembers}
          loadingTeamMembers={loadingTeamMembers}
          selectedItem={selectedItem}
          onToggleTeam={onToggleTeam}
          onItemSelect={onItemSelect}
        />
      ))}
    </div>
  )
}

interface OrgTeamsSectionProps {
  org: string
  teams: OrgTeam[]
  isExpanded: boolean
  isLoading: boolean
  expandedTeams: ReadonlySet<string>
  teamMembers: Record<string, TeamMember[]>
  loadingTeamMembers: ReadonlySet<string>
  selectedItem: string | null
  onToggleOrgTeamGroup: (org: string) => void
  onToggleTeam: (org: string, teamSlug: string) => void
  onItemSelect: (itemId: string) => void
}

function OrgTeamsSection({
  org,
  teams,
  isExpanded,
  isLoading,
  expandedTeams,
  teamMembers,
  loadingTeamMembers,
  selectedItem,
  onToggleOrgTeamGroup,
  onToggleTeam,
  onItemSelect,
}: OrgTeamsSectionProps) {
  return (
    <>
      <button
        type="button"
        className="sidebar-item sidebar-item-disclosure sidebar-org-users-item"
        onClick={() => onToggleOrgTeamGroup(org)}
        onKeyDown={event => handleItemKeyDown(event, () => onToggleOrgTeamGroup(org))}
      >
        <span className="sidebar-item-chevron">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <UsersRound size={12} />
        </span>
        <span className="sidebar-item-label">Teams</span>
        {isLoading ? (
          <Loader2 size={10} className="spin" />
        ) : teams.length > 0 ? (
          <span className="sidebar-item-count">{teams.length}</span>
        ) : null}
      </button>
      {isExpanded && (
        <TeamsSectionContent
          isLoading={isLoading}
          teams={teams}
          org={org}
          expandedTeams={expandedTeams}
          teamMembers={teamMembers}
          loadingTeamMembers={loadingTeamMembers}
          selectedItem={selectedItem}
          onToggleTeam={onToggleTeam}
          onItemSelect={onItemSelect}
        />
      )}
    </>
  )
}

interface OrgUsersSectionProps {
  org: string
  members: OrgMember[]
  contributorCounts: Record<string, number>
  favoriteUsers: ReadonlySet<string>
  isExpanded: boolean
  isLoading: boolean
  selectedItem: string | null
  onToggleOrgUserGroup: (org: string) => void
  onItemSelect: (itemId: string) => void
  onUserContextMenu: (e: React.MouseEvent, org: string, login: string) => void
}

function UserCountBadge({ isLoading, count }: { isLoading: boolean; count: number }) {
  if (isLoading) return <Loader2 size={10} className="spin" />
  if (count > 0) return <span className="sidebar-item-count">{count}</span>
  return null
}

function UsersSectionContent({
  isExpanded,
  isLoading,
  sortedMembers,
  org,
  contributorCounts,
  favoriteUsers,
  selectedItem,
  onItemSelect,
  onUserContextMenu,
}: {
  isExpanded: boolean
  isLoading: boolean
  sortedMembers: OrgMember[]
  org: string
  contributorCounts: Record<string, number>
  favoriteUsers: ReadonlySet<string>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onUserContextMenu: (e: React.MouseEvent, org: string, login: string) => void
}) {
  if (!isExpanded) return null
  if (isLoading) {
    return (
      <div className="sidebar-org-users-list">
        <div className="sidebar-item sidebar-pr-child">
          <span className="sidebar-item-icon">
            <Loader2 size={11} className="spin" />
          </span>
          <span className="sidebar-item-label">Loading users…</span>
        </div>
      </div>
    )
  }
  if (sortedMembers.length === 0) return null
  return (
    <div className="sidebar-org-users-list">
      {sortedMembers.map(member => {
        const userViewId = `org-user:${org}/${member.login}`
        const userCommitCount = contributorCounts[member.login] ?? 0
        const isFavorite = favoriteUsers.has(`${org}/${member.login}`)

        return (
          <button
            type="button"
            key={userViewId}
            className={sidebarItemClass(
              'sidebar-item sidebar-org-user-child',
              selectedItem === userViewId
            )}
            onClick={() => onItemSelect(userViewId)}
            onContextMenu={event => onUserContextMenu(event, org, member.login)}
            onKeyDown={event => handleItemKeyDown(event, () => onItemSelect(userViewId))}
          >
            <span className="sidebar-item-icon">
              {isFavorite ? (
                <Star size={11} fill="currentColor" className="sidebar-fav-star" />
              ) : (
                <UserRound size={11} />
              )}
            </span>
            <span className="sidebar-item-label" title={member.login}>
              {member.name ? `${member.name} (${member.login})` : member.login}
            </span>
            {userCommitCount > 0 && <span className="sidebar-item-count">{userCommitCount}</span>}
          </button>
        )
      })}
    </div>
  )
}

function OrgUsersSection({
  org,
  members,
  contributorCounts,
  favoriteUsers,
  isExpanded,
  isLoading,
  selectedItem,
  onToggleOrgUserGroup,
  onItemSelect,
  onUserContextMenu,
}: OrgUsersSectionProps) {
  const sortedMembers = Array.from(members).sort((a, b) => {
    const aFav = favoriteUsers.has(`${org}/${a.login}`) ? 0 : 1
    const bFav = favoriteUsers.has(`${org}/${b.login}`) ? 0 : 1
    if (aFav !== bFav) return aFav - bFav
    return a.login.localeCompare(b.login)
  })

  return (
    <>
      <button
        type="button"
        className="sidebar-item sidebar-item-disclosure sidebar-org-users-item"
        onClick={() => onToggleOrgUserGroup(org)}
        onKeyDown={event => handleItemKeyDown(event, () => onToggleOrgUserGroup(org))}
      >
        <span className="sidebar-item-chevron">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="sidebar-item-icon">
          <Users size={12} />
        </span>
        <span className="sidebar-item-label">Users</span>
        <UserCountBadge isLoading={isLoading} count={members.length} />
      </button>
      <UsersSectionContent
        isExpanded={isExpanded}
        isLoading={isLoading}
        sortedMembers={sortedMembers}
        org={org}
        contributorCounts={contributorCounts}
        favoriteUsers={favoriteUsers}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
        onUserContextMenu={onUserContextMenu}
      />
    </>
  )
}

interface OrgReposSectionProps {
  org: string
  repos: OrgRepo[]
  isExpanded: boolean
  showBookmarkedOnly: boolean
  bookmarkedRepoKeys: ReadonlySet<string>
  expandedRepos: ReadonlySet<string>
  expandedRepoIssueGroups: ReadonlySet<string>
  expandedRepoIssueStateGroups: ReadonlySet<string>
  expandedRepoPRGroups: ReadonlySet<string>
  expandedRepoPRStateGroups: ReadonlySet<string>
  expandedRepoCommitGroups: ReadonlySet<string>
  expandedPRNodes: ReadonlySet<string>
  repoCounts: Record<string, RepoCounts>
  loadingRepoCounts: ReadonlySet<string>
  repoPrTreeData: Record<string, PullRequest[]>
  repoCommitTreeData: Record<string, RepoCommit[]>
  repoIssueTreeData: Record<string, RepoIssue[]>
  loadingRepoCommits: ReadonlySet<string>
  loadingRepoPRs: ReadonlySet<string>
  loadingRepoIssues: ReadonlySet<string>
  sflStatusData: Record<string, SFLRepoStatus>
  loadingSFLStatus: ReadonlySet<string>
  expandedSFLGroups: ReadonlySet<string>
  ralphRuns: RalphRunInfo[]
  expandedRalphGroups: ReadonlySet<string>
  selectedItem: string | null
  refreshTick: number
  onToggleOrgRepoGroup: (org: string) => void
  onToggleRepo: (org: string, repoName: string) => void
  onToggleRepoIssueGroup: (org: string, repoName: string) => void
  onToggleRepoIssueStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoPRGroup: (org: string, repoName: string) => void
  onToggleRepoPRStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoCommitGroup: (org: string, repoName: string) => void
  onToggleSFLGroup: (org: string, repoName: string) => void
  onToggleRalphGroup: (org: string, repoName: string) => void
  onTogglePRNode: (prViewId: string) => void
  onItemSelect: (itemId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
}

/* v8 ignore start */
// @ts-expect-error TS6133 — WIP component not yet wired in
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- WIP: will replace inline repo rendering in OrgTreeNode
function OrgReposSection({
  /* v8 ignore stop */
  org,
  repos,
  isExpanded,
  showBookmarkedOnly: _showBookmarkedOnly,
  bookmarkedRepoKeys,
  expandedRepos,
  expandedRepoIssueGroups,
  expandedRepoIssueStateGroups,
  expandedRepoPRGroups,
  expandedRepoPRStateGroups,
  expandedRepoCommitGroups,
  expandedPRNodes,
  repoCounts,
  loadingRepoCounts,
  repoPrTreeData,
  repoCommitTreeData,
  repoIssueTreeData,
  loadingRepoCommits,
  loadingRepoPRs,
  loadingRepoIssues,
  sflStatusData,
  loadingSFLStatus,
  expandedSFLGroups,
  ralphRuns,
  expandedRalphGroups,
  selectedItem,
  refreshTick,
  onToggleOrgRepoGroup,
  onToggleRepo,
  onToggleRepoIssueGroup,
  onToggleRepoIssueStateGroup,
  onToggleRepoPRGroup,
  onToggleRepoPRStateGroup,
  onToggleRepoCommitGroup,
  onToggleSFLGroup,
  onToggleRalphGroup,
  onTogglePRNode,
  onItemSelect,
  onContextMenu,
  onBookmarkToggle,
}: OrgReposSectionProps) {
  /* v8 ignore start */
  const sortedRepos = Array.from(repos).sort((a, b) => {
    const aBookmarked = bookmarkedRepoKeys.has(`${org}/${a.name}`) ? 0 : 1
    const bBookmarked = bookmarkedRepoKeys.has(`${org}/${b.name}`) ? 0 : 1
    return aBookmarked - bBookmarked
    /* v8 ignore stop */
  })

  /* v8 ignore start */
  return (
    /* v8 ignore stop */
    <>
      <button
        type="button"
        className="sidebar-item sidebar-item-disclosure sidebar-org-users-item"
        /* v8 ignore start */ onClick={() => onToggleOrgRepoGroup(org)}
        onKeyDown={event =>
          handleItemKeyDown(event, () => onToggleOrgRepoGroup(org))
        } /* v8 ignore stop */
      >
        <span className="sidebar-item-chevron">
          {/* v8 ignore start */}
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {/* v8 ignore stop */}
        </span>
        <span className="sidebar-item-icon">
          <FolderGit2 size={12} />
        </span>
        <span className="sidebar-item-label">Repositories</span>
        {/* v8 ignore start */}
        {repos.length > 0 && <span className="sidebar-item-count">{repos.length}</span>}
      </button>
      {isExpanded && (
        <div className="sidebar-org-users-list">
          {sortedRepos.length === 0 ? (
            <div className="sidebar-item sidebar-item-empty">
              <span className="sidebar-item-label">No repos found</span>
            </div>
          ) : (
            sortedRepos.map(repo => (
              <RepoNode
                key={repo.name}
                org={org}
                repo={repo}
                bookmarkedRepoKeys={bookmarkedRepoKeys}
                expandedRepos={expandedRepos}
                expandedRepoIssueGroups={expandedRepoIssueGroups}
                expandedRepoIssueStateGroups={expandedRepoIssueStateGroups}
                expandedRepoPRGroups={expandedRepoPRGroups}
                expandedRepoPRStateGroups={expandedRepoPRStateGroups}
                expandedRepoCommitGroups={expandedRepoCommitGroups}
                expandedPRNodes={expandedPRNodes}
                repoCounts={repoCounts}
                loadingRepoCounts={loadingRepoCounts}
                repoPrTreeData={repoPrTreeData}
                repoCommitTreeData={repoCommitTreeData}
                repoIssueTreeData={repoIssueTreeData}
                loadingRepoCommits={loadingRepoCommits}
                loadingRepoPRs={loadingRepoPRs}
                loadingRepoIssues={loadingRepoIssues}
                sflStatusData={sflStatusData}
                loadingSFLStatus={loadingSFLStatus}
                expandedSFLGroups={expandedSFLGroups}
                ralphRuns={ralphRuns}
                expandedRalphGroups={expandedRalphGroups}
                selectedItem={selectedItem}
                refreshTick={refreshTick}
                onToggleRepo={onToggleRepo}
                onToggleRepoIssueGroup={onToggleRepoIssueGroup}
                onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
                onToggleRepoPRGroup={onToggleRepoPRGroup}
                onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
                onToggleRepoCommitGroup={onToggleRepoCommitGroup}
                onToggleSFLGroup={onToggleSFLGroup}
                onToggleRalphGroup={onToggleRalphGroup}
                onTogglePRNode={onTogglePRNode}
                onItemSelect={onItemSelect}
                onContextMenu={onContextMenu}
                onBookmarkToggle={onBookmarkToggle}
              />
            ))
          )}
        </div>
      )}
      {/* v8 ignore stop */}
    </>
  )
}

interface OrgTreeNodeProps extends Omit<OrgRepoTreeProps, 'uniqueOrgs'> {
  org: string
}

interface OrgExpandedBodyProps {
  org: string
  isLoading: boolean
  teams: OrgTeam[]
  isTeamGroupExpanded: boolean
  isTeamGroupLoading: boolean
  expandedTeams: ReadonlySet<string>
  teamMembers: Record<string, TeamMember[]>
  loadingTeamMembers: ReadonlySet<string>
  members: OrgMember[]
  contributorCounts: Record<string, number>
  favoriteUsers: ReadonlySet<string>
  isUserGroupExpanded: boolean
  isUserGroupLoading: boolean
  filteredRepos: OrgRepo[]
  showBookmarkedOnly: boolean
  bookmarkedRepoKeys: ReadonlySet<string>
  expandedRepos: ReadonlySet<string>
  expandedRepoIssueGroups: ReadonlySet<string>
  expandedRepoIssueStateGroups: ReadonlySet<string>
  expandedRepoPRGroups: ReadonlySet<string>
  expandedRepoPRStateGroups: ReadonlySet<string>
  expandedRepoCommitGroups: ReadonlySet<string>
  expandedPRNodes: ReadonlySet<string>
  repoCounts: Record<string, RepoCounts>
  loadingRepoCounts: ReadonlySet<string>
  repoPrTreeData: Record<string, PullRequest[]>
  repoCommitTreeData: Record<string, RepoCommit[]>
  repoIssueTreeData: Record<string, RepoIssue[]>
  loadingRepoCommits: ReadonlySet<string>
  loadingRepoPRs: ReadonlySet<string>
  loadingRepoIssues: ReadonlySet<string>
  sflStatusData: Record<string, SFLRepoStatus>
  loadingSFLStatus: ReadonlySet<string>
  expandedSFLGroups: ReadonlySet<string>
  ralphRuns: RalphRunInfo[]
  expandedRalphGroups: ReadonlySet<string>
  selectedItem: string | null
  refreshTick: number
  onToggleOrgTeamGroup: (org: string) => void
  onToggleTeam: (org: string, teamSlug: string) => void
  onToggleOrgUserGroup: (org: string) => void
  onToggleRepo: (org: string, repoName: string) => void
  onToggleRepoIssueGroup: (org: string, repoName: string) => void
  onToggleRepoIssueStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoPRGroup: (org: string, repoName: string) => void
  onToggleRepoPRStateGroup: (org: string, repoName: string, state: 'open' | 'closed') => void
  onToggleRepoCommitGroup: (org: string, repoName: string) => void
  onToggleSFLGroup: (org: string, repoName: string) => void
  onToggleRalphGroup: (org: string, repoName: string) => void
  onTogglePRNode: (prViewId: string) => void
  onItemSelect: (itemId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
  onUserContextMenu: (e: React.MouseEvent, org: string, login: string) => void
}

function OrgExpandedBody(props: OrgExpandedBodyProps) {
  const {
    org,
    isLoading,
    teams,
    isTeamGroupExpanded,
    isTeamGroupLoading,
    expandedTeams,
    teamMembers,
    loadingTeamMembers,
    members,
    contributorCounts,
    favoriteUsers,
    isUserGroupExpanded,
    isUserGroupLoading,
    filteredRepos,
    showBookmarkedOnly,
    bookmarkedRepoKeys,
    expandedRepos,
    expandedRepoIssueGroups,
    expandedRepoIssueStateGroups,
    expandedRepoPRGroups,
    expandedRepoPRStateGroups,
    expandedRepoCommitGroups,
    expandedPRNodes,
    repoCounts,
    loadingRepoCounts,
    repoPrTreeData,
    repoCommitTreeData,
    repoIssueTreeData,
    loadingRepoCommits,
    loadingRepoPRs,
    loadingRepoIssues,
    sflStatusData,
    loadingSFLStatus,
    expandedSFLGroups,
    ralphRuns,
    expandedRalphGroups,
    selectedItem,
    refreshTick,
    onToggleOrgTeamGroup,
    onToggleTeam,
    onToggleOrgUserGroup,
    onToggleRepo,
    onToggleRepoIssueGroup,
    onToggleRepoIssueStateGroup,
    onToggleRepoPRGroup,
    onToggleRepoPRStateGroup,
    onToggleRepoCommitGroup,
    onToggleSFLGroup,
    onToggleRalphGroup,
    onTogglePRNode,
    onItemSelect,
    onContextMenu,
    onBookmarkToggle,
    onUserContextMenu,
  } = props

  if (isLoading) {
    return (
      <div className="sidebar-org-repos">
        <div className="sidebar-item sidebar-item-empty">
          <Loader2 size={12} className="spin" />
          <span className="sidebar-item-label">Loading repos…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-org-repos">
      <OrgTeamsSection
        org={org}
        teams={teams}
        isExpanded={isTeamGroupExpanded}
        isLoading={isTeamGroupLoading}
        expandedTeams={expandedTeams}
        teamMembers={teamMembers}
        loadingTeamMembers={loadingTeamMembers}
        selectedItem={selectedItem}
        onToggleOrgTeamGroup={onToggleOrgTeamGroup}
        onToggleTeam={onToggleTeam}
        onItemSelect={onItemSelect}
      />
      <OrgUsersSection
        org={org}
        members={members}
        contributorCounts={contributorCounts}
        favoriteUsers={favoriteUsers}
        isExpanded={isUserGroupExpanded}
        isLoading={isUserGroupLoading}
        selectedItem={selectedItem}
        onToggleOrgUserGroup={onToggleOrgUserGroup}
        onItemSelect={onItemSelect}
        onUserContextMenu={onUserContextMenu}
      />
      {filteredRepos.length === 0 ? (
        <div className="sidebar-item sidebar-item-empty">
          <span className="sidebar-item-label">
            {showBookmarkedOnly ? 'No bookmarked repos' : 'No repos found'}
          </span>
        </div>
      ) : (
        filteredRepos.map(repo => (
          <RepoNode
            key={repo.name}
            org={org}
            repo={repo}
            bookmarkedRepoKeys={bookmarkedRepoKeys}
            expandedRepos={expandedRepos}
            expandedRepoIssueGroups={expandedRepoIssueGroups}
            expandedRepoIssueStateGroups={expandedRepoIssueStateGroups}
            expandedRepoPRGroups={expandedRepoPRGroups}
            expandedRepoPRStateGroups={expandedRepoPRStateGroups}
            expandedRepoCommitGroups={expandedRepoCommitGroups}
            expandedPRNodes={expandedPRNodes}
            repoCounts={repoCounts}
            loadingRepoCounts={loadingRepoCounts}
            repoPrTreeData={repoPrTreeData}
            repoCommitTreeData={repoCommitTreeData}
            repoIssueTreeData={repoIssueTreeData}
            loadingRepoCommits={loadingRepoCommits}
            loadingRepoPRs={loadingRepoPRs}
            loadingRepoIssues={loadingRepoIssues}
            sflStatusData={sflStatusData}
            loadingSFLStatus={loadingSFLStatus}
            expandedSFLGroups={expandedSFLGroups}
            ralphRuns={ralphRuns}
            expandedRalphGroups={expandedRalphGroups}
            selectedItem={selectedItem}
            refreshTick={refreshTick}
            onToggleRepo={onToggleRepo}
            onToggleRepoIssueGroup={onToggleRepoIssueGroup}
            onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
            onToggleRepoPRGroup={onToggleRepoPRGroup}
            onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
            onToggleRepoCommitGroup={onToggleRepoCommitGroup}
            onToggleSFLGroup={onToggleSFLGroup}
            onToggleRalphGroup={onToggleRalphGroup}
            onTogglePRNode={onTogglePRNode}
            onItemSelect={onItemSelect}
            onContextMenu={onContextMenu}
            onBookmarkToggle={onBookmarkToggle}
          />
        ))
      )}
    </div>
  )
}

function OrgMetaLabel({
  meta,
  isLoading,
}: {
  meta?: { authenticatedAs: string; isUserNamespace: boolean }
  isLoading: boolean
}) {
  if (!meta || isLoading) return null
  return (
    <div className="sidebar-org-account" title={`Authenticated via @${meta.authenticatedAs}`}>
      via @{meta.authenticatedAs}
    </div>
  )
}

function getOrgReposForTree(orgRepos: Record<string, OrgRepo[]>, org: string): OrgRepo[] {
  return orgRepos[org] ?? []
}

function getOrgMembersForTree(orgMembers: Record<string, OrgMember[]>, org: string): OrgMember[] {
  return orgMembers[org] ?? []
}

function getOrgTeamsForTree(orgTeams: Record<string, OrgTeam[]>, org: string): OrgTeam[] {
  return orgTeams[org] ?? []
}

function getContributorCountsForTree(
  orgContributorCounts: Record<string, Record<string, number>>,
  org: string
): Record<string, number> {
  return orgContributorCounts[org] ?? {}
}

function filterTreeRepos(
  repos: OrgRepo[],
  org: string,
  showBookmarkedOnly: boolean,
  bookmarkedRepoKeys: ReadonlySet<string>
): OrgRepo[] {
  if (!showBookmarkedOnly) return repos
  return repos.filter(repo => bookmarkedRepoKeys.has(`${org}/${repo.name}`))
}

function OrgTreeNode({
  org,
  orgRepos,
  orgMeta,
  orgMembers,
  loadingOrgMembers,
  expandedOrgUserGroups,
  orgTeams,
  loadingOrgTeams,
  expandedOrgTeamGroups,
  expandedTeams,
  teamMembers,
  loadingTeamMembers,
  orgContributorCounts,
  loadingOrgs,
  expandedOrgs,
  expandedRepos,
  expandedRepoIssueGroups,
  expandedRepoIssueStateGroups,
  expandedRepoPRGroups,
  expandedRepoPRStateGroups,
  expandedRepoCommitGroups,
  expandedPRNodes,
  repoCounts,
  loadingRepoCounts,
  repoPrTreeData,
  repoCommitTreeData,
  repoIssueTreeData,
  loadingRepoCommits,
  loadingRepoPRs,
  loadingRepoIssues,
  sflStatusData,
  loadingSFLStatus,
  expandedSFLGroups,
  ralphRuns,
  expandedRalphGroups,
  bookmarkedRepoKeys,
  showBookmarkedOnly,
  selectedItem,
  refreshTick,
  onToggleOrg,
  onToggleOrgUserGroup,
  onToggleOrgTeamGroup,
  onToggleTeam,
  onToggleRepo,
  onToggleRepoIssueGroup,
  onToggleRepoIssueStateGroup,
  onToggleRepoPRGroup,
  onToggleRepoPRStateGroup,
  onToggleRepoCommitGroup,
  onToggleSFLGroup,
  onToggleRalphGroup,
  onTogglePRNode,
  onItemSelect,
  onContextMenu,
  onBookmarkToggle,
  favoriteUsers,
  onUserContextMenu,
  refreshIndicators,
}: OrgTreeNodeProps) {
  const isOrgExpanded = expandedOrgs.has(org)
  const isLoading = loadingOrgs.has(org)
  const isOrgSelected = selectedItem === `org-detail:${org}`
  const repos = getOrgReposForTree(orgRepos, org)
  const members = getOrgMembersForTree(orgMembers, org)
  const meta = orgMeta[org]
  const isUserGroupExpanded = expandedOrgUserGroups.has(org)
  const isUserGroupLoading = loadingOrgMembers.has(org)
  const teams = getOrgTeamsForTree(orgTeams, org)
  const isTeamGroupExpanded = expandedOrgTeamGroups.has(org)
  const isTeamGroupLoading = loadingOrgTeams.has(org)
  const contributorCounts = getContributorCountsForTree(orgContributorCounts, org)
  const filteredRepos = filterTreeRepos(repos, org, showBookmarkedOnly, bookmarkedRepoKeys)

  return (
    <div className="sidebar-org-group">
      <OrgHeader
        org={org}
        isOrgExpanded={isOrgExpanded}
        isOrgSelected={isOrgSelected}
        isLoading={isLoading}
        meta={meta}
        repoCount={repos.length}
        visibleRepoCount={filteredRepos.length}
        showBookmarkedOnly={showBookmarkedOnly}
        refreshIndicators={refreshIndicators}
        onToggleOrg={onToggleOrg}
        onItemSelect={onItemSelect}
      />
      <OrgMetaLabel meta={meta} isLoading={isLoading} />
      {isOrgExpanded && (
        <OrgExpandedBody
          org={org}
          isLoading={isLoading}
          teams={teams}
          isTeamGroupExpanded={isTeamGroupExpanded}
          isTeamGroupLoading={isTeamGroupLoading}
          expandedTeams={expandedTeams}
          teamMembers={teamMembers}
          loadingTeamMembers={loadingTeamMembers}
          members={members}
          contributorCounts={contributorCounts}
          favoriteUsers={favoriteUsers}
          isUserGroupExpanded={isUserGroupExpanded}
          isUserGroupLoading={isUserGroupLoading}
          filteredRepos={filteredRepos}
          showBookmarkedOnly={showBookmarkedOnly}
          bookmarkedRepoKeys={bookmarkedRepoKeys}
          expandedRepos={expandedRepos}
          expandedRepoIssueGroups={expandedRepoIssueGroups}
          expandedRepoIssueStateGroups={expandedRepoIssueStateGroups}
          expandedRepoPRGroups={expandedRepoPRGroups}
          expandedRepoPRStateGroups={expandedRepoPRStateGroups}
          expandedRepoCommitGroups={expandedRepoCommitGroups}
          expandedPRNodes={expandedPRNodes}
          repoCounts={repoCounts}
          loadingRepoCounts={loadingRepoCounts}
          repoPrTreeData={repoPrTreeData}
          repoCommitTreeData={repoCommitTreeData}
          repoIssueTreeData={repoIssueTreeData}
          loadingRepoCommits={loadingRepoCommits}
          loadingRepoPRs={loadingRepoPRs}
          loadingRepoIssues={loadingRepoIssues}
          sflStatusData={sflStatusData}
          loadingSFLStatus={loadingSFLStatus}
          expandedSFLGroups={expandedSFLGroups}
          ralphRuns={ralphRuns}
          expandedRalphGroups={expandedRalphGroups}
          selectedItem={selectedItem}
          refreshTick={refreshTick}
          onToggleOrgTeamGroup={onToggleOrgTeamGroup}
          onToggleTeam={onToggleTeam}
          onToggleOrgUserGroup={onToggleOrgUserGroup}
          onToggleRepo={onToggleRepo}
          onToggleRepoIssueGroup={onToggleRepoIssueGroup}
          onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
          onToggleRepoPRGroup={onToggleRepoPRGroup}
          onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
          onToggleRepoCommitGroup={onToggleRepoCommitGroup}
          onToggleSFLGroup={onToggleSFLGroup}
          onToggleRalphGroup={onToggleRalphGroup}
          onTogglePRNode={onTogglePRNode}
          onItemSelect={onItemSelect}
          onContextMenu={onContextMenu}
          onBookmarkToggle={onBookmarkToggle}
          onUserContextMenu={onUserContextMenu}
        />
      )}
    </div>
  )
}

export function OrgRepoTree({ uniqueOrgs, ...props }: OrgRepoTreeProps) {
  return (
    <div className="sidebar-section-items">
      {uniqueOrgs.length === 0 ? (
        <div className="sidebar-item sidebar-item-empty">
          <span className="sidebar-item-label">No accounts configured</span>
        </div>
      ) : (
        uniqueOrgs.map(org => <OrgTreeNode key={org} org={org} {...props} />)
      )}
    </div>
  )
}
