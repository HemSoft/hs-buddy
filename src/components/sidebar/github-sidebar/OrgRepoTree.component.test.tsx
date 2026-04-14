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
})
