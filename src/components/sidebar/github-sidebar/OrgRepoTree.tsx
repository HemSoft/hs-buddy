import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  Star,
  Users,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type { OrgRepo, OrgMember, OrgTeam, TeamMember, RepoCounts, RepoCommit, RepoIssue } from '../../../api/github'
import type { PullRequest } from '../../../types/pullRequest'
import type { SFLRepoStatus } from '../../../types/sflStatus'
import { RepoNode } from './RepoNode'

interface OrgMeta {
  authenticatedAs: string
  isUserNamespace: boolean
}

interface OrgRepoTreeProps {
  uniqueOrgs: string[]
  orgRepos: Record<string, OrgRepo[]>
  orgMeta: Record<string, OrgMeta>
  orgMembers: Record<string, OrgMember[]>
  loadingOrgMembers: Set<string>
  expandedOrgUserGroups: Set<string>
  orgTeams: Record<string, OrgTeam[]>
  loadingOrgTeams: Set<string>
  expandedOrgTeamGroups: Set<string>
  expandedTeams: Set<string>
  teamMembers: Record<string, TeamMember[]>
  loadingTeamMembers: Set<string>
  orgContributorCounts: Record<string, Record<string, number>>
  loadingOrgs: Set<string>
  expandedOrgs: Set<string>
  expandedRepos: Set<string>
  expandedRepoIssueGroups: Set<string>
  expandedRepoIssueStateGroups: Set<string>
  expandedRepoPRGroups: Set<string>
  expandedRepoPRStateGroups: Set<string>
  expandedRepoCommitGroups: Set<string>
  expandedPRNodes: Set<string>
  repoCounts: Record<string, RepoCounts>
  loadingRepoCounts: Set<string>
  repoPrTreeData: Record<string, PullRequest[]>
  repoCommitTreeData: Record<string, RepoCommit[]>
  repoIssueTreeData: Record<string, RepoIssue[]>
  loadingRepoCommits: Set<string>
  loadingRepoPRs: Set<string>
  loadingRepoIssues: Set<string>
  sflStatusData: Record<string, SFLRepoStatus>
  loadingSFLStatus: Set<string>
  expandedSFLGroups: Set<string>
  bookmarkedRepoKeys: Set<string>
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
  onTogglePRNode: (prViewId: string) => void
  onItemSelect: (itemId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
  onBookmarkToggle: (e: React.MouseEvent, org: string, repoName: string, repoUrl: string) => void
  favoriteUsers: Set<string>
  onUserContextMenu: (e: React.MouseEvent, org: string, login: string) => void
}

export function OrgRepoTree({
  uniqueOrgs,
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
  onTogglePRNode,
  onItemSelect,
  onContextMenu,
  onBookmarkToggle,
  favoriteUsers,
  onUserContextMenu,
}: OrgRepoTreeProps) {
  return (
    <div className="sidebar-section-items">
      {uniqueOrgs.length === 0 ? (
        <div className="sidebar-item sidebar-item-empty">
          <span className="sidebar-item-label">No accounts configured</span>
        </div>
      ) : (
        uniqueOrgs.map(org => {
          const isOrgExpanded = expandedOrgs.has(org)
          const isLoading = loadingOrgs.has(org)
          const isOrgSelected = selectedItem === `org-detail:${org}`
          const repos = orgRepos[org] ?? []
          const members = orgMembers[org] ?? []
          const meta = orgMeta[org]
          const isUserGroupExpanded = expandedOrgUserGroups.has(org)
          const isUserGroupLoading = loadingOrgMembers.has(org)
          const teams = orgTeams[org] ?? []
          const isTeamGroupExpanded = expandedOrgTeamGroups.has(org)
          const isTeamGroupLoading = loadingOrgTeams.has(org)
          const contributorCounts = orgContributorCounts[org] ?? {}
          const filteredRepos = showBookmarkedOnly
            ? repos.filter(r => bookmarkedRepoKeys.has(`${org}/${r.name}`))
            : repos

          return (
            <div key={org} className="sidebar-org-group">
              <div
                className={`sidebar-item sidebar-item-disclosure sidebar-org-item ${isOrgSelected ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onItemSelect(`org-detail:${org}`)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemSelect(`org-detail:${org}`)
                  }
                }}
              >
                <span
                  className="sidebar-item-chevron"
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation()
                    onToggleOrg(org)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      onToggleOrg(org)
                    }
                  }}
                >
                  {isOrgExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="sidebar-item-icon">
                  {isOrgExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                </span>
                <span className="sidebar-item-label">{org}</span>
                {meta?.isUserNamespace && (
                  <span className="sidebar-namespace-badge" title="User account (not an org)">
                    user
                  </span>
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
                  ) : (
                    <>
                      <div
                        className="sidebar-item sidebar-item-disclosure sidebar-org-users-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => onToggleOrgTeamGroup(org)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onToggleOrgTeamGroup(org)
                          }
                        }}
                      >
                        <span className="sidebar-item-chevron">
                          {isTeamGroupExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="sidebar-item-icon">
                          <UsersRound size={12} />
                        </span>
                        <span className="sidebar-item-label">Teams</span>
                        {isTeamGroupLoading ? (
                          <Loader2 size={10} className="spin" />
                        ) : teams.length > 0 ? (
                          <span className="sidebar-item-count">{teams.length}</span>
                        ) : null}
                      </div>
                      {isTeamGroupExpanded && isTeamGroupLoading && (
                        <div className="sidebar-org-users-list">
                          <div className="sidebar-item sidebar-pr-child">
                            <span className="sidebar-item-icon">
                              <Loader2 size={11} className="spin" />
                            </span>
                            <span className="sidebar-item-label">Loading teams...</span>
                          </div>
                        </div>
                      )}
                      {isTeamGroupExpanded && !isTeamGroupLoading && teams.length > 0 && (
                        <div className="sidebar-org-users-list">
                          {teams.map(team => {
                            const teamKey = `${org}/${team.slug}`
                            const isTeamExpanded = expandedTeams.has(teamKey)
                            const teamUserMembers = teamMembers[teamKey] ?? []
                            const isLoadingMembers = loadingTeamMembers.has(teamKey)
                            return (
                              <div key={team.slug}>
                                <div
                                  className="sidebar-item sidebar-item-disclosure sidebar-org-user-child"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onToggleTeam(org, team.slug)}
                                  title={team.description ?? team.name}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      onToggleTeam(org, team.slug)
                                    }
                                  }}
                                >
                                  <span className="sidebar-item-chevron">
                                    {isTeamExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                  </span>
                                  <span className="sidebar-item-icon">
                                    <UsersRound size={11} />
                                  </span>
                                  <span className="sidebar-item-label">{team.name}</span>
                                  {isLoadingMembers ? (
                                    <Loader2 size={10} className="spin" />
                                  ) : team.memberCount > 0 ? (
                                    <span className="sidebar-item-count">{team.memberCount}</span>
                                  ) : null}
                                </div>
                                {isTeamExpanded && isLoadingMembers && (
                                  <div className="sidebar-team-members-list">
                                    <div className="sidebar-item sidebar-pr-child">
                                      <span className="sidebar-item-icon">
                                        <Loader2 size={11} className="spin" />
                                      </span>
                                      <span className="sidebar-item-label">Loading members...</span>
                                    </div>
                                  </div>
                                )}
                                {isTeamExpanded && !isLoadingMembers && teamUserMembers.length > 0 && (
                                  <div className="sidebar-team-members-list">
                                    {teamUserMembers.map(member => {
                                      const userViewId = `org-user:${org}/${member.login}`
                                      return (
                                        <div
                                          key={member.login}
                                          className={`sidebar-item sidebar-team-member-child ${selectedItem === userViewId ? 'selected' : ''}`}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => onItemSelect(userViewId)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault()
                                              onItemSelect(userViewId)
                                            }
                                          }}
                                        >
                                          <span className="sidebar-item-icon">
                                            <UserRound size={10} />
                                          </span>
                                          <span className="sidebar-item-label" title={member.login}>
                                            {member.name ? `${member.name} (${member.login})` : member.login}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                                {isTeamExpanded && !isLoadingMembers && teamUserMembers.length === 0 && (
                                  <div className="sidebar-team-members-list">
                                    <div className="sidebar-item sidebar-pr-child">
                                      <span className="sidebar-item-label">No members</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {isTeamGroupExpanded && !isTeamGroupLoading && teams.length === 0 && (
                        <div className="sidebar-org-users-list">
                          <div className="sidebar-item sidebar-pr-child">
                            <span className="sidebar-item-label">No teams found</span>
                          </div>
                        </div>
                      )}

                      <div
                        className="sidebar-item sidebar-item-disclosure sidebar-org-users-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => onToggleOrgUserGroup(org)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onToggleOrgUserGroup(org)
                          }
                        }}
                      >
                        <span className="sidebar-item-chevron">
                          {isUserGroupExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="sidebar-item-icon">
                          <Users size={12} />
                        </span>
                        <span className="sidebar-item-label">Users</span>
                        {isUserGroupLoading ? (
                          <Loader2 size={10} className="spin" />
                        ) : members.length > 0 ? (
                          <span className="sidebar-item-count">{members.length}</span>
                        ) : null}
                      </div>
                      {isUserGroupExpanded && isUserGroupLoading && (
                        <div className="sidebar-org-users-list">
                          <div className="sidebar-item sidebar-pr-child">
                            <span className="sidebar-item-icon">
                              <Loader2 size={11} className="spin" />
                            </span>
                            <span className="sidebar-item-label">Loading users...</span>
                          </div>
                        </div>
                      )}
                      {isUserGroupExpanded && !isUserGroupLoading && members.length > 0 && (
                        <div className="sidebar-org-users-list">
                          {[...members]
                            .sort((a, b) => {
                              const aFav = favoriteUsers.has(`${org}/${a.login}`) ? 0 : 1
                              const bFav = favoriteUsers.has(`${org}/${b.login}`) ? 0 : 1
                              if (aFav !== bFav) return aFav - bFav
                              return a.login.localeCompare(b.login)
                            })
                            .map(member => {
                              const userViewId = `org-user:${org}/${member.login}`
                              const userCommitCount = contributorCounts[member.login] ?? 0
                              const isFav = favoriteUsers.has(`${org}/${member.login}`)
                              return (
                                <div
                                  key={userViewId}
                                  className={`sidebar-item sidebar-org-user-child ${selectedItem === userViewId ? 'selected' : ''}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onItemSelect(userViewId)}
                                  onContextMenu={e => onUserContextMenu(e, org, member.login)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      onItemSelect(userViewId)
                                    }
                                  }}
                                >
                                  <span className="sidebar-item-icon">
                                    {isFav ? (
                                      <Star size={11} fill="currentColor" className="sidebar-fav-star" />
                                    ) : (
                                      <UserRound size={11} />
                                    )}
                                  </span>
                                  <span className="sidebar-item-label" title={member.login}>
                                    {member.name ? `${member.name} (${member.login})` : member.login}
                                  </span>
                                  {userCommitCount > 0 && (
                                    <span className="sidebar-item-count">{userCommitCount}</span>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      )}
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
                            selectedItem={selectedItem}
                            refreshTick={refreshTick}
                            onToggleRepo={onToggleRepo}
                            onToggleRepoIssueGroup={onToggleRepoIssueGroup}
                            onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
                            onToggleRepoPRGroup={onToggleRepoPRGroup}
                            onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
                            onToggleRepoCommitGroup={onToggleRepoCommitGroup}
                            onToggleSFLGroup={onToggleSFLGroup}
                            onTogglePRNode={onTogglePRNode}
                            onItemSelect={onItemSelect}
                            onContextMenu={onContextMenu}
                            onBookmarkToggle={onBookmarkToggle}
                          />
                        ))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
