import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SFLOverallStatus, SFLRepoStatus } from '../../../types/sflStatus'
import {
  SFL_STATUS_LABELS,
  sflOverallStatusIcon,
  sflWorkflowStateIcon,
  handleItemKeyDown,
} from './repoNodeUtils'
import { RepoNode } from './RepoNode'
import type { OrgRepo, RepoCounts, RepoCommit, RepoIssue } from '../../../api/github'
import type { PullRequest } from '../../../types/pullRequest'

describe('SFL_STATUS_LABELS', () => {
  it('maps all SFL statuses to labels', () => {
    const statuses: SFLOverallStatus[] = [
      'healthy',
      'active-work',
      'blocked',
      'ready-for-review',
      'recent-failure',
      'unknown',
    ]

    for (const status of statuses) {
      expect(SFL_STATUS_LABELS[status]).toBeTypeOf('string')
      expect(SFL_STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
  })

  it('has correct label values', () => {
    expect(SFL_STATUS_LABELS.healthy).toBe('Healthy')
    expect(SFL_STATUS_LABELS['active-work']).toBe('Active work')
    expect(SFL_STATUS_LABELS.blocked).toBe('Blocked')
    expect(SFL_STATUS_LABELS['ready-for-review']).toBe('Ready for review')
    expect(SFL_STATUS_LABELS['recent-failure']).toBe('Recent failure')
    expect(SFL_STATUS_LABELS.unknown).toBe('Unknown')
  })
})

describe('sflOverallStatusIcon', () => {
  it('renders success icon for healthy status', () => {
    const { container } = render(sflOverallStatusIcon('healthy'))
    expect(container.querySelector('.sfl-status-success')).not.toBeNull()
  })

  it('renders info icon for active-work status', () => {
    const { container } = render(sflOverallStatusIcon('active-work'))
    expect(container.querySelector('.sfl-status-info')).not.toBeNull()
  })

  it('renders warning icon for blocked status', () => {
    const { container } = render(sflOverallStatusIcon('blocked'))
    expect(container.querySelector('.sfl-status-warning')).not.toBeNull()
  })

  it('renders info icon for ready-for-review status', () => {
    const { container } = render(sflOverallStatusIcon('ready-for-review'))
    expect(container.querySelector('.sfl-status-info')).not.toBeNull()
  })

  it('renders error icon for recent-failure status', () => {
    const { container } = render(sflOverallStatusIcon('recent-failure'))
    expect(container.querySelector('.sfl-status-error')).not.toBeNull()
  })

  it('renders muted icon for unknown status', () => {
    const { container } = render(sflOverallStatusIcon('unknown'))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders muted icon for unrecognized status', () => {
    const { container } = render(sflOverallStatusIcon('garbage' as SFLOverallStatus))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })
})

describe('sflWorkflowStateIcon', () => {
  it('renders muted icon for inactive state', () => {
    const { container } = render(sflWorkflowStateIcon('disabled', null))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders muted icon for active state with no conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', null))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders success icon for active state with success conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'success'))
    expect(container.querySelector('.sfl-status-success')).not.toBeNull()
  })

  it('renders error icon for active state with failure conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'failure'))
    expect(container.querySelector('.sfl-status-error')).not.toBeNull()
  })

  it('renders error icon for active state with timed_out conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'timed_out'))
    expect(container.querySelector('.sfl-status-error')).not.toBeNull()
  })

  it('renders muted icon for active state with skipped conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'skipped'))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders info icon for active state with unknown conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'in_progress'))
    expect(container.querySelector('.sfl-status-info')).not.toBeNull()
  })
})

describe('handleItemKeyDown', () => {
  it('calls action on Enter key', () => {
    const action = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(action).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('calls action on Space key', () => {
    const action = vi.fn()
    const event = {
      key: ' ',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(action).toHaveBeenCalledOnce()
  })

  it('does nothing for other keys', () => {
    const action = vi.fn()
    const event = {
      key: 'Tab',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(action).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('stops propagation when stopPropagation flag is true', () => {
    const action = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action, true)
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it('does not stop propagation by default', () => {
    const action = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})

// --- RepoNode component rendering tests ---

vi.mock('../../../services/dataCache', () => ({
  dataCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  },
}))

const noop = vi.fn()
const makeRepo = (overrides: Partial<OrgRepo> = {}): OrgRepo => ({
  name: 'hs-buddy',
  fullName: 'org/hs-buddy',
  description: 'A dev companion',
  language: 'TypeScript',
  url: 'https://github.com/org/hs-buddy',
  defaultBranch: 'main',
  stargazersCount: 0,
  forksCount: 0,
  isPrivate: true,
  isArchived: false,
  updatedAt: '2026-04-10T00:00:00Z',
  pushedAt: '2026-04-10T00:00:00Z',
  ...overrides,
})

const baseProps = {
  org: 'org',
  repo: makeRepo(),
  bookmarkedRepoKeys: new Set<string>(),
  expandedRepos: new Set<string>(),
  expandedRepoIssueGroups: new Set<string>(),
  expandedRepoIssueStateGroups: new Set<string>(),
  expandedRepoPRGroups: new Set<string>(),
  expandedRepoPRStateGroups: new Set<string>(),
  expandedRepoCommitGroups: new Set<string>(),
  expandedPRNodes: new Set<string>(),
  repoCounts: {} as Record<string, RepoCounts>,
  loadingRepoCounts: new Set<string>(),
  repoPrTreeData: {} as Record<string, PullRequest[]>,
  repoCommitTreeData: {} as Record<string, RepoCommit[]>,
  repoIssueTreeData: {} as Record<string, RepoIssue[]>,
  loadingRepoCommits: new Set<string>(),
  loadingRepoPRs: new Set<string>(),
  loadingRepoIssues: new Set<string>(),
  sflStatusData: {} as Record<string, SFLRepoStatus>,
  loadingSFLStatus: new Set<string>(),
  expandedSFLGroups: new Set<string>(),
  selectedItem: null as string | null,
  refreshTick: 0,
  onToggleRepo: noop,
  onToggleRepoIssueGroup: noop,
  onToggleRepoIssueStateGroup: noop as (
    org: string,
    repo: string,
    state: 'open' | 'closed'
  ) => void,
  onToggleRepoPRGroup: noop,
  onToggleRepoPRStateGroup: noop as (org: string, repo: string, state: 'open' | 'closed') => void,
  onToggleRepoCommitGroup: noop,
  onToggleSFLGroup: noop,
  onTogglePRNode: noop,
  onItemSelect: noop,
  onContextMenu: noop as (e: React.MouseEvent, pr: PullRequest) => void,
  onBookmarkToggle: noop as (e: React.MouseEvent, org: string, repo: string, url: string) => void,
}

describe('RepoNode component', () => {
  it('renders collapsed repo with name and language', () => {
    render(<RepoNode {...baseProps} />)
    expect(screen.getByText('hs-buddy')).toBeDefined()
    expect(screen.getByText('TypeScript')).toBeDefined()
  })

  it('renders without language badge when language is empty', () => {
    render(<RepoNode {...baseProps} repo={makeRepo({ language: '' })} />)
    expect(screen.getByText('hs-buddy')).toBeDefined()
    expect(screen.queryByText('TypeScript')).toBeNull()
  })

  it('shows bookmark active style when bookmarked', () => {
    const bookmarked = new Set(['org/hs-buddy'])
    const { container } = render(<RepoNode {...baseProps} bookmarkedRepoKeys={bookmarked} />)
    const btn = container.querySelector('.sidebar-bookmark-btn.active')
    expect(btn).not.toBeNull()
  })

  it('renders children when repo is expanded', () => {
    const expanded = new Set(['org/hs-buddy'])
    render(<RepoNode {...baseProps} expandedRepos={expanded} />)
    expect(screen.getByText('Overview')).toBeDefined()
    expect(screen.getByText('Commits')).toBeDefined()
    expect(screen.getByText('Issues')).toBeDefined()
    expect(screen.getByText('Pull Requests')).toBeDefined()
  })

  it('does not render children when collapsed', () => {
    render(<RepoNode {...baseProps} />)
    expect(screen.queryByText('Overview')).toBeNull()
  })

  it('renders counts when available', () => {
    const expanded = new Set(['org/hs-buddy'])
    const counts: Record<string, RepoCounts> = {
      'org/hs-buddy': { issues: 5, prs: 3 },
    }
    render(<RepoNode {...baseProps} expandedRepos={expanded} repoCounts={counts} />)
    const countElements = screen.getAllByText('5')
    expect(countElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders loading spinner for counts', () => {
    const expanded = new Set(['org/hs-buddy'])
    const loading = new Set(['org/hs-buddy'])
    const { container } = render(
      <RepoNode {...baseProps} expandedRepos={expanded} loadingRepoCounts={loading} />
    )
    const spinners = container.querySelectorAll('.spin')
    expect(spinners.length).toBeGreaterThanOrEqual(1)
  })

  it('renders commits section with expanded commits and data', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedCommits = new Set(['org/hs-buddy'])
    const commitData: Record<string, RepoCommit[]> = {
      'org/hs-buddy': [
        {
          sha: 'abc1234567890',
          message: 'Initial commit',
          author: 'alice',
          authorAvatarUrl: null,
          date: '2026-04-10',
          url: 'https://github.com/org/hs-buddy/commit/abc1234567890',
        },
        {
          sha: 'def5678901234',
          message: 'Add feature',
          author: 'bob',
          authorAvatarUrl: null,
          date: '2026-04-11',
          url: 'https://github.com/org/hs-buddy/commit/def5678901234',
        },
      ],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoCommitGroups={expandedCommits}
        repoCommitTreeData={commitData}
      />
    )
    expect(screen.getByText('Initial commit')).toBeDefined()
    expect(screen.getByText('Add feature')).toBeDefined()
    expect(screen.getByText('abc1234')).toBeDefined()
  })

  it('renders commits loading state', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedCommits = new Set(['org/hs-buddy'])
    const loading = new Set(['org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoCommitGroups={expandedCommits}
        loadingRepoCommits={loading}
      />
    )
    expect(screen.getByText('Loading commits...')).toBeDefined()
  })

  it('renders expanded issues section with open issues data', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:open'])
    const issueData: Record<string, RepoIssue[]> = {
      'open:org/hs-buddy': [
        {
          number: 1,
          title: 'Bug report',
          state: 'open',
          createdAt: '2026-04-01',
          author: 'alice',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/1',
          updatedAt: '2026-04-01',
          labels: [],
          commentCount: 0,
          assignees: [],
        },
        {
          number: 2,
          title: 'Feature request',
          state: 'open',
          createdAt: '2026-04-02',
          author: 'bob',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/2',
          updatedAt: '2026-04-02',
          labels: [],
          commentCount: 0,
          assignees: [],
        },
      ],
    }
    const counts: Record<string, RepoCounts> = {
      'org/hs-buddy': { issues: 2, prs: 0 },
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        expandedRepoIssueStateGroups={expandedIssueStates}
        repoIssueTreeData={issueData}
        repoCounts={counts}
      />
    )
    expect(screen.getByText(/#1 Bug report/)).toBeDefined()
    expect(screen.getByText(/#2 Feature request/)).toBeDefined()
  })

  it('renders loading issues state', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:open'])
    const loading = new Set(['open:org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        expandedRepoIssueStateGroups={expandedIssueStates}
        loadingRepoIssues={loading}
      />
    )
    expect(screen.getByText('Loading issues...')).toBeDefined()
  })

  it('renders selected item styling', () => {
    const expanded = new Set(['org/hs-buddy'])
    const { container } = render(
      <RepoNode {...baseProps} expandedRepos={expanded} selectedItem="repo-detail:org/hs-buddy" />
    )
    const selected = container.querySelector('.sidebar-repo-child.selected')
    expect(selected).not.toBeNull()
  })

  it('renders SFL section with status data', () => {
    const expanded = new Set(['org/hs-buddy'])
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: true,
        overallStatus: 'healthy',
        workflows: [
          {
            id: 1,
            name: 'SFL: Auditor',
            state: 'active',
            latestRun: {
              status: 'completed',
              conclusion: 'success',
              createdAt: '2026-04-10',
              url: 'https://example.com',
            },
          },
          {
            id: 2,
            name: 'SFL: Dispatcher',
            state: 'active',
            latestRun: {
              status: 'completed',
              conclusion: 'success',
              createdAt: '2026-04-10',
              url: 'https://example.com',
            },
          },
        ],
      },
    }
    render(<RepoNode {...baseProps} expandedRepos={expanded} sflStatusData={sflData} />)
    expect(screen.getByText('SFL Loop')).toBeDefined()
  })

  it('renders SFL section hidden when not enabled', () => {
    const expanded = new Set(['org/hs-buddy'])
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: false,
        overallStatus: 'unknown',
        workflows: [],
      },
    }
    render(<RepoNode {...baseProps} expandedRepos={expanded} sflStatusData={sflData} />)
    // SFL Loop label should not appear since it's not enabled
    expect(screen.queryByText('SFL Loop')).toBeNull()
  })

  it('renders SFL loading state', () => {
    const expanded = new Set(['org/hs-buddy'])
    const loading = new Set(['org/hs-buddy'])
    const { container } = render(
      <RepoNode {...baseProps} expandedRepos={expanded} loadingSFLStatus={loading} />
    )
    // SFL section should show "SFL Loop" label with loading spinner
    expect(screen.getByText('SFL Loop')).toBeDefined()
    expect(container.querySelectorAll('.spin').length).toBeGreaterThanOrEqual(1)
  })

  it('renders expanded SFL section with workflow details', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedSFL = new Set(['org/hs-buddy'])
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: true,
        overallStatus: 'healthy',
        workflows: [
          {
            id: 1,
            name: 'SFL: Auditor',
            state: 'active',
            latestRun: {
              status: 'completed',
              conclusion: 'success',
              createdAt: '2026-04-10',
              url: 'https://example.com',
            },
          },
          { id: 2, name: 'SFL: Dispatcher', state: 'disabled', latestRun: null },
        ],
      },
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedSFLGroups={expandedSFL}
        sflStatusData={sflData}
      />
    )
    expect(screen.getByText('Auditor')).toBeDefined()
    expect(screen.getByText('Dispatcher')).toBeDefined()
    expect(screen.getByText('off')).toBeDefined()
  })

  it('renders PR section with expanded open PRs', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const counts: Record<string, RepoCounts> = {
      'org/hs-buddy': { issues: 0, prs: 2 },
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [
        {
          id: 100,
          title: 'Fix bug',
          source: 'GitHub',
          repository: 'org/hs-buddy',
          author: 'alice',
          state: 'open',
          url: 'https://github.com/org/hs-buddy/pull/100',
          approvalCount: 0,
          assigneeCount: 1,
          iApproved: false,
          created: new Date('2026-04-01'),
          date: '2026-04-01',
          headBranch: 'fix-bug',
          baseBranch: 'main',
        },
      ],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        repoCounts={counts}
      />
    )
    expect(screen.getByText(/#100 Fix bug/)).toBeDefined()
  })

  it('renders loading PRs state', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const loading = new Set(['open:org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        loadingRepoPRs={loading}
      />
    )
    expect(screen.getByText('Loading pull requests...')).toBeDefined()
  })

  it('renders closed issues section when expanded', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:closed'])
    const issueData: Record<string, RepoIssue[]> = {
      'closed:org/hs-buddy': [
        {
          number: 10,
          title: 'Fixed bug',
          state: 'closed',
          createdAt: '2026-03-01',
          author: 'alice',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/10',
          updatedAt: '2026-03-15',
          labels: [],
          commentCount: 2,
          assignees: [],
        },
      ],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        expandedRepoIssueStateGroups={expandedIssueStates}
        repoIssueTreeData={issueData}
      />
    )
    expect(screen.getByText(/#10 Fixed bug/)).toBeDefined()
  })
})
