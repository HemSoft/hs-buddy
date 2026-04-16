import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'

vi.mock('../../../services/dataCache', () => ({
  dataCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

import { OrgRepoTree } from './OrgRepoTree'

type OrgRepoTreeProps = ComponentProps<typeof OrgRepoTree>

/* ── helpers ──────────────────────────────────────────────────────── */
function makeDefaultProps(overrides: Partial<OrgRepoTreeProps> = {}): OrgRepoTreeProps {
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
    refreshTick: Date.now(),
    favoriteUsers: new Set(),
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
    onUserContextMenu: vi.fn(),
    ...overrides,
  }
}

/* ── tests ──────────────────────────────────────────────────────── */
describe('OrgRepoTree', () => {
  it('shows empty message when no orgs configured', () => {
    render(<OrgRepoTree {...makeDefaultProps()} />)
    expect(screen.getByText('No accounts configured')).toBeTruthy()
  })

  it('renders org headers when orgs exist', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['alpha-org', 'beta-org'],
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('alpha-org')).toBeTruthy()
    expect(screen.getByText('beta-org')).toBeTruthy()
  })

  it('selects org detail view on org click', () => {
    const onItemSelect = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      onItemSelect,
    })
    render(<OrgRepoTree {...props} />)
    fireEvent.click(screen.getByText('my-org'))
    expect(onItemSelect).toHaveBeenCalledWith('org-detail:my-org')
  })

  it('shows user namespace badge when meta indicates user namespace', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['user-ns'],
      orgMeta: { 'user-ns': { authenticatedAs: 'me', isUserNamespace: true } },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('user')).toBeTruthy()
  })

  it('shows repo count badge on org header', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      orgRepos: {
        'my-org': [
          {
            name: 'repo-a',
            fullName: 'my-org/repo-a',
            description: null,
            url: 'https://github.com/my-org/repo-a',
            defaultBranch: 'main',
            language: null,
            stargazersCount: 0,
            forksCount: 0,
            isPrivate: false,
            isArchived: false,
            updatedAt: null,
            pushedAt: null,
          },
        ],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows loading spinner for org when loading', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      loadingOrgs: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('my-org')).toBeTruthy()
  })

  it('renders users section when org is expanded with members', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgMembers: {
        'my-org': [
          { login: 'alice', name: 'Alice Smith', avatarUrl: '', url: '', type: 'User' },
          { login: 'bob', name: null, avatarUrl: '', url: '', type: 'User' },
        ],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Users')).toBeTruthy()
  })

  it('renders users list when user group is expanded', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [{ login: 'alice', name: 'Alice Smith', avatarUrl: '', url: '', type: 'User' }],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Alice Smith (alice)')).toBeTruthy()
  })

  it('shows favorite star for favorited users', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      favoriteUsers: new Set(['my-org/alice']),
      orgMembers: {
        'my-org': [{ login: 'alice', name: 'Alice', avatarUrl: '', url: '', type: 'User' }],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Alice (alice)')).toBeTruthy()
  })

  it('renders teams section when org is expanded', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgTeams: {
        'my-org': [
          {
            slug: 'engineering',
            name: 'Engineering',
            description: 'Eng team',
            memberCount: 5,
            repoCount: 3,
            url: 'https://github.com/orgs/my-org/teams/engineering',
          },
        ],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Teams')).toBeTruthy()
  })

  it('renders team list when team group is expanded', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: {
        'my-org': [
          {
            slug: 'engineering',
            name: 'Engineering',
            description: 'Eng team',
            memberCount: 5,
            repoCount: 3,
            url: 'https://github.com/orgs/my-org/teams/engineering',
          },
        ],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows team members when team is expanded', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      expandedTeams: new Set(['my-org/engineering']),
      orgTeams: {
        'my-org': [
          {
            slug: 'engineering',
            name: 'Engineering',
            description: null,
            memberCount: 1,
            repoCount: 0,
            url: 'https://github.com/orgs/my-org/teams/engineering',
          },
        ],
      },
      teamMembers: {
        'my-org/engineering': [{ login: 'alice', name: 'Alice', avatarUrl: null }],
      },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Alice (alice)')).toBeTruthy()
  })

  it('shows "No teams found" when expanded with empty teams', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: { 'my-org': [] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No teams found')).toBeTruthy()
  })

  it('shows "No members" when expanded team has no members', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      expandedTeams: new Set(['my-org/engineering']),
      orgTeams: {
        'my-org': [
          {
            slug: 'engineering',
            name: 'Engineering',
            description: null,
            memberCount: 0,
            repoCount: 0,
            url: 'https://github.com/orgs/my-org/teams/engineering',
          },
        ],
      },
      teamMembers: { 'my-org/engineering': [] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No members')).toBeTruthy()
  })

  it('handles keyboard navigation on org header', () => {
    const onItemSelect = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      onItemSelect,
    })
    render(<OrgRepoTree {...props} />)
    const orgHeader = screen.getByText('my-org').closest('[role="button"]')!
    fireEvent.keyDown(orgHeader, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('org-detail:my-org')
  })

  it('applies refresh-active class when refresh indicator is active', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      refreshIndicators: { 'org-repos:my-org': 'active' },
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.refresh-active')).toBeTruthy()
  })

  it('applies refresh-pending class when refresh indicator is pending', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      refreshIndicators: { 'org-repos:my-org': 'pending' },
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.refresh-pending')).toBeTruthy()
  })

  it('does not apply refresh class when no indicator present', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      refreshIndicators: {},
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.refresh-active')).toBeNull()
    expect(container.querySelector('.refresh-pending')).toBeNull()
  })

  it('shows contributor count next to user names', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [{ login: 'alice', name: 'Alice', avatarUrl: '', url: '', type: 'User' }],
      },
      orgContributorCounts: { 'my-org': { alice: 42 } },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('does not show contributor count when count is zero', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [{ login: 'alice', name: 'Alice', avatarUrl: '', url: '', type: 'User' }],
      },
      orgContributorCounts: { 'my-org': { alice: 0 } },
    })
    const { container } = render(<OrgRepoTree {...props} />)
    const userItem = container.querySelector('.sidebar-org-user-child')!
    expect(userItem.querySelector('.sidebar-item-count')).toBeNull()
  })

  it('fires onUserContextMenu on right-click of user item', () => {
    const onUserContextMenu = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [{ login: 'alice', name: 'Alice', avatarUrl: '', url: '', type: 'User' }],
      },
      onUserContextMenu,
    })
    render(<OrgRepoTree {...props} />)
    const userEl = screen.getByText('Alice (alice)').closest('[role="button"]')!
    fireEvent.contextMenu(userEl)
    expect(onUserContextMenu).toHaveBeenCalledWith(expect.anything(), 'my-org', 'alice')
  })

  it('applies selected class to user item when selectedItem matches', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [{ login: 'alice', name: 'Alice', avatarUrl: '', url: '', type: 'User' }],
      },
      selectedItem: 'org-user:my-org/alice',
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.sidebar-org-user-child.selected')).toBeTruthy()
  })

  it('applies selected class to org header when selectedItem matches', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      selectedItem: 'org-detail:my-org',
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.sidebar-org-item.selected')).toBeTruthy()
  })

  it('shows bookmarked count in org header when showBookmarkedOnly is true', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      orgRepos: {
        'my-org': [
          {
            name: 'repo-a',
            fullName: 'my-org/repo-a',
            description: null,
            url: '',
            defaultBranch: 'main',
            language: null,
            stargazersCount: 0,
            forksCount: 0,
            isPrivate: false,
            isArchived: false,
            updatedAt: null,
            pushedAt: null,
          },
          {
            name: 'repo-b',
            fullName: 'my-org/repo-b',
            description: null,
            url: '',
            defaultBranch: 'main',
            language: null,
            stargazersCount: 0,
            forksCount: 0,
            isPrivate: false,
            isArchived: false,
            updatedAt: null,
            pushedAt: null,
          },
          {
            name: 'repo-c',
            fullName: 'my-org/repo-c',
            description: null,
            url: '',
            defaultBranch: 'main',
            language: null,
            stargazersCount: 0,
            forksCount: 0,
            isPrivate: false,
            isArchived: false,
            updatedAt: null,
            pushedAt: null,
          },
        ],
      },
      showBookmarkedOnly: true,
      bookmarkedRepoKeys: new Set(['my-org/repo-a']),
    })
    render(<OrgRepoTree {...props} />)
    // With bookmarkedOnly, count should show 1 (bookmarked) not 3 (total)
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('calls onToggleOrgUserGroup when clicking Users section header', () => {
    const onToggleOrgUserGroup = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgMembers: {
        'my-org': [{ login: 'alice', name: null, avatarUrl: '', url: '', type: 'User' }],
      },
      onToggleOrgUserGroup,
    })
    render(<OrgRepoTree {...props} />)
    fireEvent.click(screen.getByText('Users'))
    expect(onToggleOrgUserGroup).toHaveBeenCalledWith('my-org')
  })

  it('calls onToggleOrgTeamGroup when clicking Teams section header', () => {
    const onToggleOrgTeamGroup = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgTeams: {
        'my-org': [
          {
            slug: 'eng',
            name: 'Engineering',
            description: null,
            memberCount: 3,
            repoCount: 1,
            url: '',
          },
        ],
      },
      onToggleOrgTeamGroup,
    })
    render(<OrgRepoTree {...props} />)
    fireEvent.click(screen.getByText('Teams'))
    expect(onToggleOrgTeamGroup).toHaveBeenCalledWith('my-org')
  })

  it('calls onToggleTeam when clicking a team node', () => {
    const onToggleTeam = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: {
        'my-org': [
          {
            slug: 'eng',
            name: 'Engineering',
            description: null,
            memberCount: 3,
            repoCount: 1,
            url: '',
          },
        ],
      },
      onToggleTeam,
    })
    render(<OrgRepoTree {...props} />)
    fireEvent.click(screen.getByText('Engineering'))
    expect(onToggleTeam).toHaveBeenCalledWith('my-org', 'eng')
  })

  it('handles keyboard Space on user item', () => {
    const onItemSelect = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      orgMembers: {
        'my-org': [{ login: 'bob', name: null, avatarUrl: '', url: '', type: 'User' }],
      },
      onItemSelect,
    })
    render(<OrgRepoTree {...props} />)
    const userEl = screen.getByText('bob').closest('[role="button"]')!
    fireEvent.keyDown(userEl, { key: ' ' })
    expect(onItemSelect).toHaveBeenCalledWith('org-user:my-org/bob')
  })

  it('handles keyboard Enter on team node', () => {
    const onToggleTeam = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      orgTeams: {
        'my-org': [
          {
            slug: 'eng',
            name: 'Engineering',
            description: null,
            memberCount: 0,
            repoCount: 0,
            url: '',
          },
        ],
      },
      onToggleTeam,
    })
    render(<OrgRepoTree {...props} />)
    const teamEl = screen.getByText('Engineering').closest('[role="button"]')!
    fireEvent.keyDown(teamEl, { key: 'Enter' })
    expect(onToggleTeam).toHaveBeenCalledWith('my-org', 'eng')
  })

  it('shows loading teams spinner', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      loadingOrgTeams: new Set(['my-org']),
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelectorAll('.spin').length).toBeGreaterThanOrEqual(1)
  })

  it('shows loading users spinner', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      loadingOrgMembers: new Set(['my-org']),
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelectorAll('.spin').length).toBeGreaterThanOrEqual(1)
  })

  it('shows selected team member when selectedItem matches', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      expandedTeams: new Set(['my-org/eng']),
      orgTeams: {
        'my-org': [
          {
            slug: 'eng',
            name: 'Engineering',
            description: null,
            memberCount: 1,
            repoCount: 0,
            url: '',
          },
        ],
      },
      teamMembers: {
        'my-org/eng': [{ login: 'dev1', name: 'Dev One', avatarUrl: null }],
      },
      selectedItem: 'org-user:my-org/dev1',
    })
    const { container } = render(<OrgRepoTree {...props} />)
    expect(container.querySelector('.sidebar-team-member-child.selected')).toBeTruthy()
  })

  it('handles keyboard Enter on team member item', () => {
    const onItemSelect = vi.fn()
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      expandedTeams: new Set(['my-org/eng']),
      orgTeams: {
        'my-org': [
          {
            slug: 'eng',
            name: 'Engineering',
            description: null,
            memberCount: 1,
            repoCount: 0,
            url: '',
          },
        ],
      },
      teamMembers: {
        'my-org/eng': [{ login: 'dev1', name: null, avatarUrl: null }],
      },
      onItemSelect,
    })
    render(<OrgRepoTree {...props} />)
    const memberEl = screen.getByText('dev1').closest('[role="button"]')!
    fireEvent.keyDown(memberEl, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('org-user:my-org/dev1')
  })

  it('shows "Loading repos..." when org is expanded and loading', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      loadingOrgs: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading repos...')).toBeTruthy()
  })

  it('shows "No repos found" when expanded org has no repos', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgRepos: { 'my-org': [] },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No repos found')).toBeTruthy()
  })

  it('shows "No bookmarked repos" when bookmarked filter has no matches', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      orgRepos: {
        'my-org': [
          {
            name: 'repo-a',
            fullName: 'my-org/repo-a',
            description: null,
            url: '',
            defaultBranch: 'main',
            language: null,
            stargazersCount: 0,
            forksCount: 0,
            isPrivate: false,
            isArchived: false,
            updatedAt: null,
            pushedAt: null,
          },
        ],
      },
      showBookmarkedOnly: true,
      bookmarkedRepoKeys: new Set(),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('No bookmarked repos')).toBeTruthy()
  })

  it('shows loading team members spinner when team is expanded and loading', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      expandedTeams: new Set(['my-org/eng']),
      orgTeams: {
        'my-org': [
          {
            slug: 'eng',
            name: 'Engineering',
            description: null,
            memberCount: 3,
            repoCount: 0,
            url: '',
          },
        ],
      },
      loadingTeamMembers: new Set(['my-org/eng']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading members...')).toBeTruthy()
  })

  it('shows "via @username" auth label when meta exists and not loading', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      orgMeta: { 'my-org': { authenticatedAs: 'octocat', isUserNamespace: false } },
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('via @octocat')).toBeTruthy()
  })

  it('hides auth label while loading', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      orgMeta: { 'my-org': { authenticatedAs: 'octocat', isUserNamespace: false } },
      loadingOrgs: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.queryByText('via @octocat')).toBeFalsy()
  })

  it('shows expanded users section loading state', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgUserGroups: new Set(['my-org']),
      loadingOrgMembers: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading users...')).toBeTruthy()
  })

  it('shows expanded teams section loading state', () => {
    const props = makeDefaultProps({
      uniqueOrgs: ['my-org'],
      expandedOrgs: new Set(['my-org']),
      expandedOrgTeamGroups: new Set(['my-org']),
      loadingOrgTeams: new Set(['my-org']),
    })
    render(<OrgRepoTree {...props} />)
    expect(screen.getByText('Loading teams...')).toBeTruthy()
  })
})
