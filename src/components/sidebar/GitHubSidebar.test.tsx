import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GitHubSidebar } from './GitHubSidebar'

let mockRefreshIndicators: Record<string, { status: string }> = {}
let mockSidebarData: ReturnType<typeof createMockSidebarData>

vi.mock('../../hooks/useRefreshIndicators', () => ({
  useRefreshIndicators: () => mockRefreshIndicators,
}))

vi.mock('../../hooks/useRalphLoops', () => ({
  useRalphLoops: () => ({
    runs: [],
    loading: false,
    error: null,
    launch: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('./github-sidebar/useGitHubSidebarData', () => ({
  useGitHubSidebarData: () => mockSidebarData,
}))

vi.mock('./github-sidebar/PRTreeSection', () => ({
  PRTreeSection: ({
    prItems,
    onItemSelect,
  }: {
    prItems: Array<{ label: string }>
    onItemSelect: Mock
  }) => (
    <div data-testid="pr-tree-section">
      <span>{prItems[0]?.label}</span>
      <button onClick={() => onItemSelect('pr-item-1')}>Select PR Item</button>
    </div>
  ),
}))

vi.mock('./github-sidebar/OrgRepoTree', () => ({
  OrgRepoTree: ({ uniqueOrgs, onItemSelect }: { uniqueOrgs: string[]; onItemSelect: Mock }) => (
    <div data-testid="org-repo-tree">
      <span>{uniqueOrgs.join(', ')}</span>
      <button onClick={() => onItemSelect('org-item-1')}>Select Org Item</button>
    </div>
  ),
}))

vi.mock('./github-sidebar/SidebarPRContextMenu', () => ({
  SidebarPRContextMenu: ({
    pr,
    onOpen,
    onCopyLink,
    onAIReview,
    onApprove,
    onBookmark,
    onClose,
  }: {
    pr: { title: string }
    onOpen: () => void
    onCopyLink: () => Promise<void>
    onAIReview: () => void
    onApprove: () => Promise<void>
    onBookmark: () => Promise<void>
    onClose: () => void
  }) => (
    <div data-testid="pr-context-menu">
      <span>{pr.title}</span>
      <button onClick={onOpen}>Open PR</button>
      <button onClick={() => void onCopyLink()}>Copy PR Link</button>
      <button onClick={onAIReview}>Start AI Review</button>
      <button onClick={() => void onApprove()}>Approve PR</button>
      <button onClick={() => void onBookmark()}>Bookmark Repo</button>
      <button onClick={onClose}>Close PR Menu</button>
    </div>
  ),
}))

vi.mock('./github-sidebar/SidebarUserContextMenu', () => ({
  SidebarUserContextMenu: ({
    displayName,
    onOpenProfile,
    onRefresh,
    onToggleFavorite,
    onClose,
  }: {
    displayName: string
    onOpenProfile: () => void
    onRefresh: () => void
    onToggleFavorite: () => void
    onClose: () => void
  }) => (
    <div data-testid="user-context-menu">
      <span>{displayName}</span>
      <button onClick={onOpenProfile}>Open Profile</button>
      <button onClick={onRefresh}>Refresh User</button>
      <button onClick={onToggleFavorite}>Toggle Favorite</button>
      <button onClick={onClose}>Close User Menu</button>
    </div>
  ),
}))

function createMockSidebarData() {
  const data = {
    prContextMenu: null as null | {
      x: number
      y: number
      pr: { title: string; url: string; repository: string; org?: string }
    },
    setPrContextMenu: vi.fn(),
    approvingPrKey: null,
    bookmarkedRepoKeys: new Set<string>(['acme/repo']),
    expandedSections: new Set<string>(['pull-requests', 'organizations']),
    prItems: [{ id: 'pr-item-1', label: 'Needs review' }],
    prTreeData: {},
    expandedPrGroups: new Set<string>(),
    expandedPRNodes: new Set<string>(),
    uniqueOrgs: ['acme'],
    orgRepos: { acme: [{ name: 'repo' }] },
    orgMeta: {},
    orgMembers: { acme: [{ login: 'alice', name: 'Alice' }] },
    loadingOrgMembers: new Set<string>(),
    expandedOrgUserGroups: new Set<string>(),
    orgTeams: {},
    loadingOrgTeams: new Set<string>(),
    expandedOrgTeamGroups: new Set<string>(),
    expandedTeams: new Set<string>(),
    teamMembers: {},
    loadingTeamMembers: new Set<string>(),
    orgContributorCounts: {},
    loadingOrgs: new Set<string>(),
    expandedOrgs: new Set<string>(),
    expandedRepos: new Set<string>(),
    expandedRepoIssueGroups: new Set<string>(),
    expandedRepoIssueStateGroups: new Set<string>(),
    expandedRepoPRGroups: new Set<string>(),
    expandedRepoPRStateGroups: new Set<string>(),
    expandedRepoCommitGroups: new Set<string>(),
    repoCounts: {},
    loadingRepoCounts: new Set<string>(),
    repoPrTreeData: {},
    repoCommitTreeData: {},
    repoIssueTreeData: {},
    loadingRepoCommits: new Set<string>(),
    loadingRepoPRs: new Set<string>(),
    loadingRepoIssues: new Set<string>(),
    sflStatusData: {},
    loadingSFLStatus: new Set<string>(),
    expandedSFLGroups: new Set<string>(),
    expandedRalphGroups: new Set<string>(),
    showBookmarkedOnly: false,
    setShowBookmarkedOnly: vi.fn((updater: boolean | ((prev: boolean) => boolean)) => {
      data.showBookmarkedOnly =
        typeof updater === 'function' ? updater(data.showBookmarkedOnly) : updater
    }),
    refreshTick: 0,
    toggleSection: vi.fn(),
    toggleOrg: vi.fn(),
    toggleOrgUserGroup: vi.fn(),
    toggleOrgTeamGroup: vi.fn(),
    toggleTeam: vi.fn(),
    toggleRepo: vi.fn(),
    toggleRepoIssueGroup: vi.fn(),
    toggleRepoIssueStateGroup: vi.fn(),
    toggleRepoPRGroup: vi.fn(),
    toggleRepoPRStateGroup: vi.fn(),
    toggleRepoCommitGroup: vi.fn(),
    toggleSFLGroup: vi.fn(),
    toggleRalphGroup: vi.fn(),
    togglePRGroup: vi.fn(),
    togglePRNode: vi.fn(),
    newPRCounts: {},
    newPRUrls: new Set<string>(),
    markPRsAsSeen: vi.fn(),
    openTreePRContextMenu: vi.fn(),
    handleBookmarkToggle: vi.fn(),
    handleApprovePR: vi.fn().mockResolvedValue(undefined),
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    openPRReview: vi.fn(),
    toggleBookmarkRepoByValues: vi.fn().mockResolvedValue(undefined),
    userContextMenu: null as null | { org: string; login: string; x: number; y: number },
    setUserContextMenu: vi.fn(),
    favoriteUsers: new Set<string>(['acme/alice']),
    openUserContextMenu: vi.fn(),
    toggleFavoriteUser: vi.fn(),
    refreshUser: vi.fn(),
  }

  return data
}

describe('GitHubSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefreshIndicators = {}
    mockSidebarData = createMockSidebarData()

    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(window, 'shell', {
      value: {
        openExternal: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  it('renders expanded sections and forwards child selections', () => {
    const onItemSelect = vi.fn()

    render(
      <GitHubSidebar
        onItemSelect={onItemSelect}
        selectedItem={null}
        counts={{}}
        badgeProgress={{}}
      />
    )

    expect(screen.getByText('GITHUB')).toBeTruthy()
    expect(screen.getByText('Pull Requests')).toBeTruthy()
    expect(screen.getByText('Organizations')).toBeTruthy()
    expect(screen.getByTestId('pr-tree-section')).toBeTruthy()
    expect(screen.getByTestId('org-repo-tree')).toBeTruthy()
    expect(screen.getByText('Needs review')).toBeTruthy()
    expect(screen.getByText('acme')).toBeTruthy()

    fireEvent.click(screen.getByText('Select PR Item'))
    fireEvent.click(screen.getByText('Select Org Item'))

    expect(onItemSelect).toHaveBeenCalledWith('pr-item-1')
    expect(onItemSelect).toHaveBeenCalledWith('org-item-1')
    expect(mockSidebarData.markPRsAsSeen).toHaveBeenCalledWith('pr-item-1')
  })

  it('toggles sections from click and keyboard handlers', () => {
    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.click(screen.getByText('Pull Requests').closest('[role="button"]') as HTMLElement)
    fireEvent.keyDown(screen.getByText('Organizations').closest('[role="button"]') as HTMLElement, {
      key: 'Enter',
    })

    expect(mockSidebarData.toggleSection).toHaveBeenCalledWith('pull-requests')
    expect(mockSidebarData.toggleSection).toHaveBeenCalledWith('organizations')
  })

  it('toggles bookmarked filtering and persists the preference', () => {
    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.click(screen.getByTitle('Showing all repos'))

    expect(mockSidebarData.setShowBookmarkedOnly).toHaveBeenCalled()
    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('config:set-show-bookmarked-only', true)
    expect(mockSidebarData.toggleSection).not.toHaveBeenCalled()
  })

  it('wires PR and user context menu actions', async () => {
    mockSidebarData.prContextMenu = {
      x: 10,
      y: 20,
      pr: {
        title: 'Improve sidebar tests',
        url: 'https://github.com/acme/repo/pull/123',
        repository: 'repo',
        org: 'acme',
      },
    }
    mockSidebarData.userContextMenu = {
      org: 'acme',
      login: 'alice',
      x: 30,
      y: 40,
    }

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    expect(screen.getByText('Improve sidebar tests')).toBeTruthy()
    expect(screen.getByText('Alice (alice)')).toBeTruthy()

    fireEvent.click(screen.getByText('Open PR'))
    fireEvent.click(screen.getByText('Copy PR Link'))
    fireEvent.click(screen.getByText('Start AI Review'))
    fireEvent.click(screen.getByText('Approve PR'))
    fireEvent.click(screen.getByText('Bookmark Repo'))
    fireEvent.click(screen.getByText('Open Profile'))
    fireEvent.click(screen.getByText('Refresh User'))
    fireEvent.click(screen.getByText('Toggle Favorite'))
    fireEvent.click(screen.getByText('Close PR Menu'))
    fireEvent.click(screen.getByText('Close User Menu'))

    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/acme/repo/pull/123')
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/alice')
    expect(mockSidebarData.openPRReview).toHaveBeenCalledWith(mockSidebarData.prContextMenu.pr)
    expect(mockSidebarData.refreshUser).toHaveBeenCalledWith('acme', 'alice')
    expect(mockSidebarData.toggleFavoriteUser).toHaveBeenCalledWith('acme', 'alice')

    await waitFor(() => {
      expect(mockSidebarData.copyToClipboard).toHaveBeenCalledWith(
        'https://github.com/acme/repo/pull/123'
      )
      expect(mockSidebarData.handleApprovePR).toHaveBeenCalledWith(
        mockSidebarData.prContextMenu?.pr
      )
      expect(mockSidebarData.toggleBookmarkRepoByValues).toHaveBeenCalledWith(
        'acme',
        'repo',
        'https://github.com/acme/repo'
      )
    })

    expect(mockSidebarData.setPrContextMenu).toHaveBeenCalledWith(null)
    expect(mockSidebarData.setUserContextMenu).toHaveBeenCalledWith(null)
  })

  it('supports keyDown on Pull Requests section header', () => {
    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.keyDown(screen.getByText('Pull Requests').closest('[role="button"]') as HTMLElement, {
      key: ' ',
    })
    expect(mockSidebarData.toggleSection).toHaveBeenCalledWith('pull-requests')
  })

  it('supports click on Organizations section header', () => {
    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.click(screen.getByText('Organizations').closest('[role="button"]') as HTMLElement)
    expect(mockSidebarData.toggleSection).toHaveBeenCalledWith('organizations')
  })

  it('ignores non-activating keys on section headers', () => {
    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.keyDown(screen.getByText('Pull Requests').closest('[role="button"]') as HTMLElement, {
      key: 'Tab',
    })
    fireEvent.keyDown(screen.getByText('Organizations').closest('[role="button"]') as HTMLElement, {
      key: 'Tab',
    })
    expect(mockSidebarData.toggleSection).not.toHaveBeenCalled()
  })

  it('renders collapsed sections without child content', () => {
    mockSidebarData.expandedSections = new Set<string>()

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    expect(screen.getByText('Pull Requests')).toBeTruthy()
    expect(screen.getByText('Organizations')).toBeTruthy()
    expect(screen.queryByTestId('pr-tree-section')).toBeNull()
    expect(screen.queryByTestId('org-repo-tree')).toBeNull()
  })

  it('displays user login when name is not available', () => {
    mockSidebarData.orgMembers = { acme: [{ login: 'bob' }] } as typeof mockSidebarData.orgMembers
    mockSidebarData.userContextMenu = { org: 'acme', login: 'bob', x: 0, y: 0 }

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('uses empty string for org when PR has no org', async () => {
    mockSidebarData.prContextMenu = {
      x: 0,
      y: 0,
      pr: {
        title: 'No org PR',
        url: 'https://github.com/someone/repo/pull/1',
        repository: 'repo',
        org: undefined,
      },
    }

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.click(screen.getByText('Bookmark Repo'))

    await waitFor(() => {
      expect(mockSidebarData.toggleBookmarkRepoByValues).toHaveBeenCalledWith(
        '',
        'repo',
        'https://github.com/someone/repo'
      )
    })
  })

  it('handles copyToClipboard failure in PR context menu', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSidebarData.copyToClipboard = vi.fn().mockRejectedValue(new Error('copy failed'))
    mockSidebarData.prContextMenu = {
      x: 0,
      y: 0,
      pr: {
        title: 'Failing copy',
        url: 'https://github.com/acme/repo/pull/99',
        repository: 'repo',
        org: 'acme',
      },
    }

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.click(screen.getByText('Copy PR Link'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to copy PR link:', expect.any(Error))
    })

    expect(mockSidebarData.setPrContextMenu).toHaveBeenCalledWith(null)
    consoleSpy.mockRestore()
  })

  it('renders bookmarked-only active state', () => {
    mockSidebarData.showBookmarkedOnly = true

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    expect(screen.getByTitle('Showing bookmarked only')).toBeTruthy()
    expect(screen.getByTitle('Showing bookmarked only').className).toContain('active')
  })

  it('handles ipcRenderer.invoke rejection in bookmark filter', async () => {
    ;(window.ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ipc fail')
    )

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    fireEvent.click(screen.getByTitle('Showing all repos'))

    // Should not throw — the .catch(() => {}) swallows the error
    await waitFor(() => {
      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
        'config:set-show-bookmarked-only',
        true
      )
    })
  })

  it('displays user login when orgMembers has no entry for the user', () => {
    mockSidebarData.orgMembers = { acme: [] } as typeof mockSidebarData.orgMembers
    mockSidebarData.userContextMenu = { org: 'acme', login: 'unknown', x: 0, y: 0 }

    render(
      <GitHubSidebar onItemSelect={vi.fn()} selectedItem={null} counts={{}} badgeProgress={{}} />
    )

    expect(screen.getByText('unknown')).toBeTruthy()
  })
})
