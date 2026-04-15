import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrgRepoTree } from './OrgRepoTree'
import type { OrgRepo, OrgMember, OrgTeam, TeamMember } from '../../../api/github'

vi.mock('./RepoNode', () => ({
  RepoNode: ({ org, repo }: { org: string; repo: { name: string } }) => (
    <div data-testid={`repo-node-${org}-${repo.name}`}>{repo.name}</div>
  ),
}))

function makeRepo(name: string): OrgRepo {
  return {
    name,
    fullName: `test-org/${name}`,
    description: null,
    url: `https://github.com/test-org/${name}`,
    defaultBranch: 'main',
    language: null,
    stargazersCount: 0,
    forksCount: 0,
    isPrivate: false,
    isArchived: false,
    updatedAt: null,
    pushedAt: null,
  }
}

function makeMember(login: string, name: string | null = null): OrgMember {
  return { login, name, avatarUrl: null, url: `https://github.com/${login}`, type: 'User' }
}

function makeTeam(slug: string, name: string, memberCount = 3): OrgTeam {
  return {
    slug,
    name,
    description: null,
    memberCount,
    repoCount: 0,
    url: `https://github.com/orgs/test-org/teams/${slug}`,
  }
}

function makeTeamMember(login: string, name: string | null = null): TeamMember {
  return { login, name, avatarUrl: null }
}

type OrgRepoTreeProps = Parameters<typeof OrgRepoTree>[0]

function createDefaultProps(overrides: Partial<OrgRepoTreeProps> = {}): OrgRepoTreeProps {
  return {
    uniqueOrgs: [],
    orgRepos: {},
    orgMeta: {},
    orgMembers: {},
    loadingOrgMembers: new Set(),
    expandedOrgUserGroups: new Set(),
    orgTeams: {},
    loadingOrgTeams: new Set(),
    expandedOrgTeamGroups: new Set(),
    expandedTeams: new Set(),
    teamMembers: {},
    loadingTeamMembers: new Set(),
    orgContributorCounts: {},
    loadingOrgs: new Set(),
    expandedOrgs: new Set(),
    expandedRepos: new Set(),
    expandedRepoIssueGroups: new Set(),
    expandedRepoIssueStateGroups: new Set(),
    expandedRepoPRGroups: new Set(),
    expandedRepoPRStateGroups: new Set(),
    expandedRepoCommitGroups: new Set(),
    expandedPRNodes: new Set(),
    repoCounts: {},
    loadingRepoCounts: new Set(),
    repoPrTreeData: {},
    repoCommitTreeData: {},
    repoIssueTreeData: {},
    loadingRepoCommits: new Set(),
    loadingRepoPRs: new Set(),
    loadingRepoIssues: new Set(),
    sflStatusData: {},
    loadingSFLStatus: new Set(),
    expandedSFLGroups: new Set(),
    bookmarkedRepoKeys: new Set(),
    showBookmarkedOnly: false,
    selectedItem: null,
    refreshTick: 0,
    onToggleOrg: vi.fn(),
    onToggleOrgUserGroup: vi.fn(),
    onToggleOrgTeamGroup: vi.fn(),
    onToggleTeam: vi.fn(),
    onToggleRepo: vi.fn(),
    onToggleRepoIssueGroup: vi.fn(),
    onToggleRepoIssueStateGroup: vi.fn(),
    onToggleRepoPRGroup: vi.fn(),
    onToggleRepoPRStateGroup: vi.fn(),
    onToggleRepoCommitGroup: vi.fn(),
    onToggleSFLGroup: vi.fn(),
    onTogglePRNode: vi.fn(),
    onItemSelect: vi.fn(),
    onContextMenu: vi.fn(),
    onBookmarkToggle: vi.fn(),
    favoriteUsers: new Set(),
    onUserContextMenu: vi.fn(),
    ...overrides,
  }
}

describe('OrgRepoTree', () => {
  // 1. Empty orgs
  it('shows "No accounts configured" when uniqueOrgs is empty', () => {
    render(<OrgRepoTree {...createDefaultProps()} />)
    expect(screen.getByText('No accounts configured')).toBeInTheDocument()
  })

  // 2. Org header rendering
  it('renders org name and repo count in header', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      orgRepos: { 'my-org': [makeRepo('repo-a'), makeRepo('repo-b')] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('my-org')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // 3. Org loading
  it('shows spinner when org is loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      loadingOrgs: new Set(['my-org']),
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.spin')).toBeInTheDocument()
  })

  // 4. User namespace badge
  it('shows "user" badge when orgMeta.isUserNamespace is true', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-user'],
      orgMeta: { 'my-user': { authenticatedAs: 'my-user', isUserNamespace: true } },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('user')).toBeInTheDocument()
  })

  // 5. Auth account display
  it('shows "via @username" when meta exists and not loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      orgMeta: { 'my-org': { authenticatedAs: 'octocat', isUserNamespace: false } },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('via @octocat')).toBeInTheDocument()
  })

  it('hides auth account label while loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      orgMeta: { 'my-org': { authenticatedAs: 'octocat', isUserNamespace: false } },
      loadingOrgs: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.queryByText('via @octocat')).not.toBeInTheDocument()
  })

  // 6. Org expanded - loading repos
  it('shows "Loading repos..." when expanded and loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      loadingOrgs: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading repos...')).toBeInTheDocument()
  })

  // 7. Org expanded - no repos
  it('shows "No repos found" when expanded with no repos', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgRepos: { 'my-org': [] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No repos found')).toBeInTheDocument()
  })

  // 8. Org expanded - bookmarked only with no bookmarks
  it('shows "No bookmarked repos" when bookmarked filter is on with no bookmarks', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgRepos: { 'my-org': [makeRepo('repo-a')] },
      showBookmarkedOnly: true,
      bookmarkedRepoKeys: new Set(),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No bookmarked repos')).toBeInTheDocument()
  })

  // 9. Org expanded - with repos
  it('renders RepoNode for each repo when expanded', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgRepos: { 'my-org': [makeRepo('alpha'), makeRepo('beta')] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByTestId('repo-node-my-org-alpha')).toBeInTheDocument()
    expect(screen.getByTestId('repo-node-my-org-beta')).toBeInTheDocument()
  })

  // 10. Org expanded - filtered by bookmarks
  it('only shows bookmarked repos when showBookmarkedOnly is true', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgRepos: { 'my-org': [makeRepo('alpha'), makeRepo('beta')] },
      showBookmarkedOnly: true,
      bookmarkedRepoKeys: new Set(['my-org/alpha']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByTestId('repo-node-my-org-alpha')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-node-my-org-beta')).not.toBeInTheDocument()
  })

  // 11. Users section collapsed
  it('shows "Users" header with count when collapsed', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgMembers: { 'my-org': [makeMember('alice'), makeMember('bob')] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // 12. Users section expanded with loading
  it('shows "Loading users..." when users section is expanded and loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      loadingOrgMembers: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading users...')).toBeInTheDocument()
  })

  // 13. Users section expanded with members
  it('shows member names and logins when users section is expanded', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [makeMember('alice', 'Alice Smith'), makeMember('bob')],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Alice Smith (alice)')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  // 14. Users section expanded - favorites sorted first
  it('sorts favorite users before non-favorites', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [makeMember('alice'), makeMember('bob'), makeMember('charlie')],
      },
      favoriteUsers: new Set(['my-org/charlie']),
    })
    const { container } = render(<OrgRepoTree {...props} />)
    const userLabels = container.querySelectorAll('.sidebar-org-user-child .sidebar-item-label')
    const labels = Array.from(userLabels).map(el => el.textContent)
    expect(labels.indexOf('charlie')).toBeLessThan(labels.indexOf('alice'))
    expect(labels.indexOf('charlie')).toBeLessThan(labels.indexOf('bob'))
  })

  // 15. Teams section collapsed
  it('shows "Teams" header with count when collapsed', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgTeams: { 'my-org': [makeTeam('backend', 'Backend'), makeTeam('frontend', 'Frontend')] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Teams')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // 16. Teams section expanded with loading
  it('shows "Loading teams..." when teams section is expanded and loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      loadingOrgTeams: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading teams...')).toBeInTheDocument()
  })

  // 17. Teams section expanded with teams
  it('shows team names when teams section is expanded', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: { 'my-org': [makeTeam('backend', 'Backend Team')] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Backend Team')).toBeInTheDocument()
  })

  // 18. Teams section expanded - no teams
  it('shows "No teams found" when teams section expanded but empty', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: { 'my-org': [] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No teams found')).toBeInTheDocument()
  })

  // 19. Team node expanded - loading members
  it('shows "Loading members..." when team is expanded and loading members', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: { 'my-org': [makeTeam('backend', 'Backend')] },
      expandedTeams: new Set(['my-org/backend']),
      loadingTeamMembers: new Set(['my-org/backend']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading members...')).toBeInTheDocument()
  })

  // 20. Team node expanded - with members
  it('shows team member names when team is expanded', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: { 'my-org': [makeTeam('backend', 'Backend')] },
      expandedTeams: new Set(['my-org/backend']),
      teamMembers: {
        'my-org/backend': [makeTeamMember('dev1', 'Dev One'), makeTeamMember('dev2')],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Dev One (dev1)')).toBeInTheDocument()
    expect(screen.getByText('dev2')).toBeInTheDocument()
  })

  // 21. Team node expanded - no members
  it('shows "No members" when team is expanded but has no members', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: { 'my-org': [makeTeam('backend', 'Backend', 0)] },
      expandedTeams: new Set(['my-org/backend']),
      teamMembers: { 'my-org/backend': [] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No members')).toBeInTheDocument()
  })

  // 22. Click org header calls onItemSelect
  it('calls onItemSelect with org-detail:orgname when clicking org header', () => {
    const onItemSelect = vi.fn()
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      onItemSelect,
    })
    render(<OrgRepoTree {...props} />)
    fireEvent.click(screen.getByText('my-org'))
    expect(onItemSelect).toHaveBeenCalledWith('org-detail:my-org')
  })

  // 23. Click chevron calls onToggleOrg
  it('calls onToggleOrg when clicking chevron', () => {
    const onToggleOrg = vi.fn()
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      onToggleOrg,
    })
    const { container } = render(<OrgRepoTree {...props} />)
    const chevron = container.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleOrg).toHaveBeenCalledWith('my-org')
  })

  // 24. Click user calls onItemSelect
  it('calls onItemSelect with org-user:org/login when clicking a user', () => {
    const onItemSelect = vi.fn()
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: { 'my-org': [makeMember('alice')] },
      onItemSelect,
    })
    render(<OrgRepoTree {...props} />)
    fireEvent.click(screen.getByText('alice'))
    expect(onItemSelect).toHaveBeenCalledWith('org-user:my-org/alice')
  })

  // 25. Repo count badge
  it('shows repo count when not loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      orgRepos: { 'my-org': [makeRepo('r1'), makeRepo('r2'), makeRepo('r3')] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('does not show repo count when loading', () => {
    const props = createDefaultProps({
      uniqueOrgs: ['my-org'],
      orgRepos: { 'my-org': [makeRepo('r1'), makeRepo('r2')] },
      loadingOrgs: new Set(['my-org']),
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.sidebar-item-count')).not.toBeInTheDocument()
  })
})
