import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RepoNode } from './RepoNode'
import type { OrgRepo } from '../../../api/github'

vi.mock('../../../services/dataCache', () => ({
  dataCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

/* ── helpers ──────────────────────────────────────────────────────── */
function makeRepo(overrides: Partial<OrgRepo> = {}): OrgRepo {
  return {
    name: 'my-repo',
    fullName: 'acme/my-repo',
    description: 'A test repo',
    url: 'https://github.com/acme/my-repo',
    defaultBranch: 'main',
    language: 'TypeScript',
    stargazersCount: 10,
    forksCount: 3,
    isPrivate: false,
    isArchived: false,
    updatedAt: '2026-01-01T00:00:00Z',
    pushedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeDefaultCallbacks() {
  return {
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
  }
}

function makeDefaultProps(overrides = {}) {
  return {
    org: 'acme',
    repo: makeRepo(),
    bookmarkedRepoKeys: new Set<string>(),
    expandedRepos: new Set<string>(),
    expandedRepoIssueGroups: new Set<string>(),
    expandedRepoIssueStateGroups: new Set<string>(),
    expandedRepoPRGroups: new Set<string>(),
    expandedRepoPRStateGroups: new Set<string>(),
    expandedRepoCommitGroups: new Set<string>(),
    expandedPRNodes: new Set<string>(),
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
    selectedItem: null,
    refreshTick: Date.now(),
    ...makeDefaultCallbacks(),
    ...overrides,
  }
}

/* ── collapsed state ──────────────────────────────────────────────── */
describe('RepoNode', () => {
  it('renders repo name when collapsed', () => {
    render(<RepoNode {...makeDefaultProps()} />)
    expect(screen.getByText('my-repo')).toBeTruthy()
  })

  it('renders language badge', () => {
    render(<RepoNode {...makeDefaultProps()} />)
    expect(screen.getByText('TypeScript')).toBeTruthy()
  })

  it('does not render children when collapsed', () => {
    render(<RepoNode {...makeDefaultProps()} />)
    expect(screen.queryByText('Overview')).toBeFalsy()
    expect(screen.queryByText('Commits')).toBeFalsy()
  })

  it('calls onToggleRepo when header clicked', () => {
    const onToggleRepo = vi.fn()
    render(<RepoNode {...makeDefaultProps({ onToggleRepo })} />)
    fireEvent.click(screen.getByText('my-repo'))
    expect(onToggleRepo).toHaveBeenCalledWith('acme', 'my-repo')
  })

  it('shows bookmark as active when bookmarked', () => {
    const props = makeDefaultProps({
      bookmarkedRepoKeys: new Set(['acme/my-repo']),
    })
    render(<RepoNode {...props} />)
    const bookmarkBtn = screen.getByTitle('Remove bookmark')
    expect(bookmarkBtn).toBeTruthy()
  })

  it('shows bookmark as inactive when not bookmarked', () => {
    render(<RepoNode {...makeDefaultProps()} />)
    const bookmarkBtn = screen.getByTitle('Bookmark this repo')
    expect(bookmarkBtn).toBeTruthy()
  })

  it('calls onBookmarkToggle when bookmark clicked', () => {
    const onBookmarkToggle = vi.fn()
    render(<RepoNode {...makeDefaultProps({ onBookmarkToggle })} />)
    fireEvent.click(screen.getByTitle('Bookmark this repo'))
    expect(onBookmarkToggle).toHaveBeenCalled()
  })

  /* ── expanded state ──────────────────────────────────────────── */
  it('renders child sections when expanded', () => {
    const props = makeDefaultProps({
      expandedRepos: new Set(['acme/my-repo']),
    })
    render(<RepoNode {...props} />)
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Commits')).toBeTruthy()
    expect(screen.getByText('Issues')).toBeTruthy()
    expect(screen.getByText('Pull Requests')).toBeTruthy()
  })

  it('shows overview item and selects on click', () => {
    const onItemSelect = vi.fn()
    const props = makeDefaultProps({
      expandedRepos: new Set(['acme/my-repo']),
      onItemSelect,
    })
    render(<RepoNode {...props} />)
    fireEvent.click(screen.getByText('Overview'))
    expect(onItemSelect).toHaveBeenCalledWith('repo-detail:acme/my-repo')
  })

  /* ── keyboard navigation ─────────────────────────────────────── */
  it('handles Enter key on repo header', () => {
    const onToggleRepo = vi.fn()
    render(<RepoNode {...makeDefaultProps({ onToggleRepo })} />)
    fireEvent.keyDown(screen.getByText('my-repo').closest('[role="button"]')!, {
      key: 'Enter',
    })
    expect(onToggleRepo).toHaveBeenCalledWith('acme', 'my-repo')
  })

  it('handles Space key on repo header', () => {
    const onToggleRepo = vi.fn()
    render(<RepoNode {...makeDefaultProps({ onToggleRepo })} />)
    fireEvent.keyDown(screen.getByText('my-repo').closest('[role="button"]')!, {
      key: ' ',
    })
    expect(onToggleRepo).toHaveBeenCalledWith('acme', 'my-repo')
  })

  it('ignores other keys on repo header', () => {
    const onToggleRepo = vi.fn()
    render(<RepoNode {...makeDefaultProps({ onToggleRepo })} />)
    fireEvent.keyDown(screen.getByText('my-repo').closest('[role="button"]')!, {
      key: 'Tab',
    })
    expect(onToggleRepo).not.toHaveBeenCalled()
  })

  /* ── SFL status section ──────────────────────────────────────── */
  it('renders SFL status section when repo is expanded and SFL data exists', () => {
    const props = makeDefaultProps({
      expandedRepos: new Set(['acme/my-repo']),
      sflStatusData: {
        'acme/my-repo': {
          isSFLEnabled: true,
          overallStatus: 'healthy',
          workflows: [
            {
              id: 1,
              name: 'SFL Auditor',
              state: 'active',
              latestRun: {
                status: 'completed',
                conclusion: 'success',
                createdAt: '2026-01-01T00:00:00Z',
                url: 'https://example.com',
              },
            },
          ],
        },
      },
    })
    render(<RepoNode {...props} />)
    expect(screen.getByText('SFL Loop')).toBeTruthy()
  })

  it('renders SFL section with failure status', () => {
    const props = makeDefaultProps({
      expandedRepos: new Set(['acme/my-repo']),
      expandedSFLGroups: new Set(['acme/my-repo']),
      sflStatusData: {
        'acme/my-repo': {
          isSFLEnabled: true,
          overallStatus: 'recent-failure',
          workflows: [
            {
              id: 1,
              name: 'Issue Processor',
              state: 'active',
              latestRun: {
                status: 'completed',
                conclusion: 'failure',
                createdAt: '2026-01-01T00:00:00Z',
                url: 'https://example.com',
              },
            },
            {
              id: 2,
              name: 'Auditor',
              state: 'disabled_manually',
              latestRun: null,
            },
          ],
        },
      },
    })
    render(<RepoNode {...props} />)
    expect(screen.getByText('SFL Loop')).toBeTruthy()
    expect(screen.getByText('Recent failure')).toBeTruthy()
  })

  /* ── commits expanded ────────────────────────────────────────── */
  it('renders commit items when commits section is expanded', () => {
    const props = makeDefaultProps({
      expandedRepos: new Set(['acme/my-repo']),
      expandedRepoCommitGroups: new Set(['acme/my-repo']),
      repoCommitTreeData: {
        'acme/my-repo': [
          { sha: 'abc123def456', message: 'Initial commit', author: 'alice', date: '2026-01-01' },
          { sha: 'def456abc789', message: 'Add tests', author: 'bob', date: '2026-01-02' },
        ],
      },
    })
    render(<RepoNode {...props} />)
    expect(screen.getByText('Initial commit')).toBeTruthy()
    expect(screen.getByText('abc123d')).toBeTruthy()
  })

  /* ── loading state for commits ──────────────────────────────── */
  it('shows loading indicator for commits when loading', () => {
    const props = makeDefaultProps({
      expandedRepos: new Set(['acme/my-repo']),
      expandedRepoCommitGroups: new Set(['acme/my-repo']),
      loadingRepoCommits: new Set(['acme/my-repo']),
    })
    render(<RepoNode {...props} />)
    expect(screen.getByText('Loading commits...')).toBeTruthy()
  })

  /* ── no language badge ──────────────────────────────────────── */
  it('does not render language badge when null', () => {
    const props = makeDefaultProps({
      repo: makeRepo({ language: null }),
    })
    render(<RepoNode {...props} />)
    expect(screen.queryByText('TypeScript')).toBeFalsy()
  })

  /* ── repo description as title ──────────────────────────────── */
  it('uses fullName as title when description is null', () => {
    const props = makeDefaultProps({
      repo: makeRepo({ description: null }),
    })
    render(<RepoNode {...props} />)
    const header = screen.getByText('my-repo').closest('[role="button"]')!
    expect(header.getAttribute('title')).toBe('acme/my-repo')
  })

  /* ── issues section expanded ─────────────────────────────────── */
  describe('issues section', () => {
    it('renders issue count badge when counts are available', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        repoCounts: { 'acme/my-repo': { issues: 5, prs: 3 } },
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('Issues')).toBeTruthy()
      expect(screen.getByText('5')).toBeTruthy()
    })

    it('shows loading indicator for issue counts', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        loadingRepoCounts: new Set(['acme/my-repo']),
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('Issues')).toBeTruthy()
    })

    it('renders open and closed sub-sections when expanded', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        expandedRepoIssueGroups: new Set(['acme/my-repo']),
        repoCounts: { 'acme/my-repo': { issues: 5, prs: 3 } },
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('Open')).toBeTruthy()
      expect(screen.getByText('Closed')).toBeTruthy()
    })

    it('renders open issue items when state group is expanded', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        expandedRepoIssueGroups: new Set(['acme/my-repo']),
        expandedRepoIssueStateGroups: new Set(['acme/my-repo:open']),
        repoIssueTreeData: {
          'open:acme/my-repo': [
            {
              number: 1,
              title: 'Bug report',
              state: 'open',
              createdAt: '2026-01-01',
              updatedAt: '2026-01-02',
              labels: [],
            },
            {
              number: 2,
              title: 'Feature request',
              state: 'open',
              createdAt: '2026-01-01',
              updatedAt: '2026-01-02',
              labels: [],
            },
          ],
        },
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('#1 Bug report')).toBeTruthy()
      expect(screen.getByText('#2 Feature request')).toBeTruthy()
    })

    it('shows loading indicator for open issues', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        expandedRepoIssueGroups: new Set(['acme/my-repo']),
        expandedRepoIssueStateGroups: new Set(['acme/my-repo:open']),
        loadingRepoIssues: new Set(['open:acme/my-repo']),
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('Loading issues...')).toBeTruthy()
    })

    it('renders closed issue items when closed state group is expanded', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        expandedRepoIssueGroups: new Set(['acme/my-repo']),
        expandedRepoIssueStateGroups: new Set(['acme/my-repo:closed']),
        repoIssueTreeData: {
          'closed:acme/my-repo': [
            {
              number: 10,
              title: 'Old bug',
              state: 'closed',
              createdAt: '2026-01-01',
              updatedAt: '2026-01-02',
              labels: [],
            },
          ],
        },
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('#10 Old bug')).toBeTruthy()
    })

    it('calls onToggleRepoIssueGroup when issues section is clicked', () => {
      const onToggleRepoIssueGroup = vi.fn()
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        onToggleRepoIssueGroup,
      })
      render(<RepoNode {...props} />)
      fireEvent.click(screen.getByText('Issues'))
      expect(onToggleRepoIssueGroup).toHaveBeenCalledWith('acme', 'my-repo')
    })

    it('calls onToggleRepoIssueStateGroup when open section is clicked', () => {
      const onToggleRepoIssueStateGroup = vi.fn()
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        expandedRepoIssueGroups: new Set(['acme/my-repo']),
        onToggleRepoIssueStateGroup,
      })
      render(<RepoNode {...props} />)
      fireEvent.click(screen.getByText('Open'))
      expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('acme', 'my-repo', 'open')
    })

    it('calls onItemSelect when an issue item is clicked', () => {
      const onItemSelect = vi.fn()
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        expandedRepoIssueGroups: new Set(['acme/my-repo']),
        expandedRepoIssueStateGroups: new Set(['acme/my-repo:open']),
        repoIssueTreeData: {
          'open:acme/my-repo': [
            {
              number: 1,
              title: 'Bug report',
              state: 'open',
              createdAt: '2026-01-01',
              updatedAt: '2026-01-02',
              labels: [],
            },
          ],
        },
        onItemSelect,
      })
      render(<RepoNode {...props} />)
      fireEvent.click(screen.getByText('#1 Bug report'))
      expect(onItemSelect).toHaveBeenCalledWith('repo-issue:acme/my-repo/1')
    })
  })

  /* ── pull requests section ───────────────────────────────────── */
  describe('pull requests section', () => {
    it('renders PR count badge', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        repoCounts: { 'acme/my-repo': { issues: 5, prs: 3 } },
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('Pull Requests')).toBeTruthy()
      expect(screen.getByText('3')).toBeTruthy()
    })

    it('calls onToggleRepoPRGroup when PR section is clicked', () => {
      const onToggleRepoPRGroup = vi.fn()
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        onToggleRepoPRGroup,
      })
      render(<RepoNode {...props} />)
      fireEvent.click(screen.getByText('Pull Requests'))
      expect(onToggleRepoPRGroup).toHaveBeenCalledWith('acme', 'my-repo')
    })

    it('shows loading indicator for PRs', () => {
      const props = makeDefaultProps({
        expandedRepos: new Set(['acme/my-repo']),
        expandedRepoPRGroups: new Set(['acme/my-repo']),
        loadingRepoPRs: new Set(['acme/my-repo']),
      })
      render(<RepoNode {...props} />)
      expect(screen.getByText('Pull Requests')).toBeTruthy()
    })
  })

  /* ── commit count badge ──────────────────────────────────────── */
  it('renders commit count badge when commits exist', () => {
    const props = makeDefaultProps({
      expandedRepos: new Set(['acme/my-repo']),
      repoCommitTreeData: {
        'acme/my-repo': Array.from({ length: 8 }, (_, i) => ({
          sha: `sha${i}1234567`,
          message: `Commit ${i}`,
          author: 'alice',
          date: '2026-01-01',
        })),
      },
    })
    render(<RepoNode {...props} />)
    expect(screen.getByText('8')).toBeTruthy()
  })

  /* ── context menu on repo header ─────────────────────────────── */
  it('fires onContextMenu from repo header right-click', () => {
    const onContextMenu = vi.fn()
    const props = makeDefaultProps({ onContextMenu })
    render(<RepoNode {...props} />)
    const header = screen.getByText('my-repo').closest('[role="button"]')!
    fireEvent.contextMenu(header)
  })
})
