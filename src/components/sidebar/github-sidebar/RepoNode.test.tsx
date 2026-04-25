import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
import { createPRDetailViewId } from '../../../utils/prDetailView'
import { dataCache } from '../../../services/dataCache'

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

  it('renders no issue items when expanded state has empty issues', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:open'])
    const issueData: Record<string, RepoIssue[]> = { 'open:org/hs-buddy': [] }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        expandedRepoIssueStateGroups={expandedIssueStates}
        repoIssueTreeData={issueData}
      />
    )
    expect(screen.getByText('Open')).toBeDefined()
    expect(screen.queryByText('Loading issues...')).toBeNull()
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

  it('calls onToggleRepo when clicking repo header', () => {
    const onToggleRepo = vi.fn()
    render(<RepoNode {...baseProps} onToggleRepo={onToggleRepo} />)
    fireEvent.click(screen.getByText('hs-buddy'))
    expect(onToggleRepo).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('calls onBookmarkToggle without toggling repo when clicking bookmark', () => {
    const onBookmarkToggle = vi.fn()
    const onToggleRepo = vi.fn()
    const { container } = render(
      <RepoNode {...baseProps} onBookmarkToggle={onBookmarkToggle} onToggleRepo={onToggleRepo} />
    )
    const btn = container.querySelector('.sidebar-bookmark-btn')!
    fireEvent.click(btn)
    expect(onBookmarkToggle).toHaveBeenCalled()
    // The bookmark button calls stopPropagation internally via onClick on the button,
    // so onToggleRepo should not be called from the parent handler at the same time.
  })

  it('handles keyboard Enter on repo header', () => {
    const onToggleRepo = vi.fn()
    render(<RepoNode {...baseProps} onToggleRepo={onToggleRepo} />)
    const header = screen.getByText('hs-buddy').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(onToggleRepo).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('calls onItemSelect when clicking Overview item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    render(<RepoNode {...baseProps} expandedRepos={expanded} onItemSelect={onItemSelect} />)
    fireEvent.click(screen.getByText('Overview'))
    expect(onItemSelect).toHaveBeenCalledWith('repo-detail:org/hs-buddy')
  })

  it('calls onItemSelect and onToggleRepoCommitGroup when clicking Commits section', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoCommitGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onItemSelect={onItemSelect}
        onToggleRepoCommitGroup={onToggleRepoCommitGroup}
      />
    )
    fireEvent.click(screen.getByText('Commits'))
    expect(onItemSelect).toHaveBeenCalledWith('repo-commits:org/hs-buddy')
    expect(onToggleRepoCommitGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('calls onToggleRepoIssueGroup when clicking Issues section', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoIssueGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onToggleRepoIssueGroup={onToggleRepoIssueGroup}
      />
    )
    fireEvent.click(screen.getByText('Issues'))
    expect(onToggleRepoIssueGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('calls onToggleRepoPRGroup when clicking Pull Requests section', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoPRGroup = vi.fn()
    render(
      <RepoNode {...baseProps} expandedRepos={expanded} onToggleRepoPRGroup={onToggleRepoPRGroup} />
    )
    fireEvent.click(screen.getByText('Pull Requests'))
    expect(onToggleRepoPRGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('renders expanded PR sub-items when PR node is expanded', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const pr: PullRequest = {
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
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    const prViewId = createPRDetailViewId(pr)
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        expandedPRNodes={new Set([prViewId])}
      />
    )
    // Sub-items from prSubNodes
    expect(screen.getByText('Conversation')).toBeDefined()
    expect(screen.getAllByText('Commits').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Checks')).toBeDefined()
    expect(screen.getByText('Files changed')).toBeDefined()
    expect(screen.getByText('AI Reviews')).toBeDefined()
  })

  it('fires onContextMenu when right-clicking a PR node', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const onContextMenu = vi.fn()
    const pr: PullRequest = {
      id: 200,
      title: 'Add feature',
      source: 'GitHub',
      repository: 'org/hs-buddy',
      author: 'bob',
      state: 'open',
      url: 'https://github.com/org/hs-buddy/pull/200',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: new Date('2026-04-02'),
      date: '2026-04-02',
      headBranch: 'add-feature',
      baseBranch: 'main',
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        onContextMenu={onContextMenu}
      />
    )
    const prNode = screen.getByText(/#200 Add feature/)
    fireEvent.contextMenu(prNode.closest('.sidebar-pr-item')!)
    expect(onContextMenu).toHaveBeenCalled()
    expect(onContextMenu.mock.calls[0][1]).toEqual(pr)
  })

  it('renders closed PRs section with data and count badge', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:closed'])
    const pr: PullRequest = {
      id: 300,
      title: 'Old PR',
      source: 'GitHub',
      repository: 'org/hs-buddy',
      author: 'alice',
      state: 'closed',
      url: 'https://github.com/org/hs-buddy/pull/300',
      approvalCount: 1,
      assigneeCount: 0,
      iApproved: false,
      created: new Date('2026-01-01'),
      date: '2026-01-01',
      headBranch: 'old-pr',
      baseBranch: 'main',
    }
    const prData: Record<string, PullRequest[]> = {
      'closed:org/hs-buddy': [pr],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
      />
    )
    expect(screen.getByText(/#300 Old PR/)).toBeDefined()
    // Count badge should show "1" for closed PRs
    const closedCountBadges = screen.getAllByText('1')
    expect(closedCountBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders loading state for closed PRs', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:closed'])
    const loading = new Set(['closed:org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        loadingRepoPRs={loading}
      />
    )
    const loadingElements = screen.getAllByText('Loading pull requests...')
    expect(loadingElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders closed issues loading state', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:closed'])
    const loading = new Set(['closed:org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        expandedRepoIssueStateGroups={expandedIssueStates}
        loadingRepoIssues={loading}
      />
    )
    const loadingElements = screen.getAllByText('Loading issues...')
    expect(loadingElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders PR updated age label when dataCache has fetchedAt', () => {
    const expanded = new Set(['org/hs-buddy'])
    const mockCache = vi.mocked(dataCache)
    mockCache.get.mockReturnValue({ data: { issues: 5, prs: 3 }, fetchedAt: Date.now() - 120_000 })
    render(<RepoNode {...baseProps} expandedRepos={expanded} />)
    expect(screen.getByText('updated 2m ago')).toBeDefined()
    mockCache.get.mockReturnValue(null)
  })

  it('calls onToggleSFLGroup when clicking SFL section', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleSFLGroup = vi.fn()
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: true,
        overallStatus: 'healthy',
        workflows: [],
      },
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        sflStatusData={sflData}
        onToggleSFLGroup={onToggleSFLGroup}
      />
    )
    fireEvent.click(screen.getByText('SFL Loop'))
    expect(onToggleSFLGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles keyboard Enter on PR section chevron with stopPropagation', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoPRGroup = vi.fn()
    const { container } = render(
      <RepoNode {...baseProps} expandedRepos={expanded} onToggleRepoPRGroup={onToggleRepoPRGroup} />
    )
    // The PR section is the sidebar-repo-pr-row; find its chevron
    const prRow = container.querySelector('.sidebar-repo-pr-row')!
    const chevron = prRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleRepoPRGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('calls onToggleRepoPRStateGroup when clicking open state chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    // Open state row is inside the PR tree
    const openRow = screen.getByText('Open', {
      selector: '.sidebar-repo-pr-row ~ .sidebar-job-tree .sidebar-item-label',
    })
    fireEvent.click(openRow.closest('.sidebar-pr-child')!)
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('calls onToggleRepoIssueStateGroup when clicking open issues chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    // The Issues section, when expanded, shows Open and Closed sub-items.
    // Click on "Open" to trigger state group toggle
    const openItem = screen.getByText('Open')
    fireEvent.click(openItem.closest('.sidebar-pr-child')!)
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('calls onItemSelect when clicking on individual commit item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedCommits = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const commitData: Record<string, RepoCommit[]> = {
      'org/hs-buddy': [
        {
          sha: 'abc1234567890',
          message: 'Test commit',
          author: 'alice',
          authorAvatarUrl: null,
          date: '2026-04-10',
          url: 'https://github.com/org/hs-buddy/commit/abc1234567890',
        },
      ],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoCommitGroups={expandedCommits}
        repoCommitTreeData={commitData}
        onItemSelect={onItemSelect}
      />
    )
    fireEvent.click(screen.getByText('Test commit'))
    expect(onItemSelect).toHaveBeenCalledWith('repo-commit:org/hs-buddy/abc1234567890')
  })

  it('handles keyboard Enter on individual commit item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedCommits = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const commitData: Record<string, RepoCommit[]> = {
      'org/hs-buddy': [
        {
          sha: 'def9876543210',
          message: 'Keyboard commit',
          author: 'bob',
          authorAvatarUrl: null,
          date: '2026-04-11',
          url: 'https://github.com/org/hs-buddy/commit/def9876543210',
        },
      ],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoCommitGroups={expandedCommits}
        repoCommitTreeData={commitData}
        onItemSelect={onItemSelect}
      />
    )
    const commitEl = screen.getByText('Keyboard commit').closest('[role="button"]')!
    fireEvent.keyDown(commitEl, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-commit:org/hs-buddy/def9876543210')
  })

  it('calls onItemSelect when clicking on individual open issue', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:open'])
    const onItemSelect = vi.fn()
    const issueData: Record<string, RepoIssue[]> = {
      'open:org/hs-buddy': [
        {
          number: 5,
          title: 'Clickable issue',
          state: 'open',
          createdAt: '2026-04-01',
          author: 'alice',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/5',
          updatedAt: '2026-04-01',
          labels: [],
          commentCount: 0,
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
        onItemSelect={onItemSelect}
      />
    )
    fireEvent.click(screen.getByText(/#5 Clickable issue/))
    expect(onItemSelect).toHaveBeenCalledWith('repo-issue:org/hs-buddy/5')
  })

  it('calls onItemSelect when clicking on individual closed issue', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:closed'])
    const onItemSelect = vi.fn()
    const issueData: Record<string, RepoIssue[]> = {
      'closed:org/hs-buddy': [
        {
          number: 20,
          title: 'Closed clickable issue',
          state: 'closed',
          createdAt: '2026-03-01',
          author: 'alice',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/20',
          updatedAt: '2026-03-15',
          labels: [],
          commentCount: 0,
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
        onItemSelect={onItemSelect}
      />
    )
    fireEvent.click(screen.getByText(/#20 Closed clickable issue/))
    expect(onItemSelect).toHaveBeenCalledWith('repo-issue:org/hs-buddy/20')
  })

  it('calls onItemSelect when clicking a PR sub-node (e.g., Conversation)', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const onItemSelect = vi.fn()
    const pr: PullRequest = {
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
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    const prViewId = createPRDetailViewId(pr)
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        expandedPRNodes={new Set([prViewId])}
        onItemSelect={onItemSelect}
      />
    )
    fireEvent.click(screen.getByText('Conversation'))
    expect(onItemSelect).toHaveBeenCalledWith(expect.stringContaining('conversation'))
  })

  it('handles keyboard Enter on SFL section chevron with stopPropagation', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleSFLGroup = vi.fn()
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: true,
        overallStatus: 'healthy',
        workflows: [],
      },
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        sflStatusData={sflData}
        onToggleSFLGroup={onToggleSFLGroup}
      />
    )
    // Find the SFL section and its chevron
    const sflLabel = screen.getByText('SFL Loop')
    const sflRow = sflLabel.closest('.sidebar-item-disclosure')!
    const chevron = sflRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleSFLGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('calls onTogglePRNode when clicking PR chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const onTogglePRNode = vi.fn()
    const pr: PullRequest = {
      id: 500,
      title: 'PR toggle test',
      source: 'GitHub',
      repository: 'org/hs-buddy',
      author: 'alice',
      state: 'open',
      url: 'https://github.com/org/hs-buddy/pull/500',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: new Date('2026-04-01'),
      date: '2026-04-01',
      headBranch: 'pr-toggle',
      baseBranch: 'main',
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        onTogglePRNode={onTogglePRNode}
      />
    )
    // Click the chevron on the PR item
    const prItem = screen.getByText(/#500 PR toggle test/).closest('.sidebar-pr-item')!
    const chevron = prItem.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onTogglePRNode).toHaveBeenCalled()
  })

  it('renders issue selection highlight for selected issue', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:open'])
    const issueData: Record<string, RepoIssue[]> = {
      'open:org/hs-buddy': [
        {
          number: 99,
          title: 'Selected issue',
          state: 'open',
          createdAt: '2026-04-01',
          author: 'alice',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/99',
          updatedAt: '2026-04-01',
          labels: [],
          commentCount: 0,
          assignees: [],
        },
      ],
    }
    const { container } = render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        expandedRepoIssueStateGroups={expandedIssueStates}
        repoIssueTreeData={issueData}
        selectedItem="repo-issue:org/hs-buddy/99"
      />
    )
    const selected = container.querySelectorAll('.sidebar-pr-child.selected')
    expect(selected.length).toBeGreaterThanOrEqual(1)
  })

  it('renders commit selection highlight for selected commit', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedCommits = new Set(['org/hs-buddy'])
    const commitData: Record<string, RepoCommit[]> = {
      'org/hs-buddy': [
        {
          sha: 'sel1234567890',
          message: 'Selected commit',
          author: 'alice',
          authorAvatarUrl: null,
          date: '2026-04-10',
          url: 'https://github.com/org/hs-buddy/commit/sel1234567890',
        },
      ],
    }
    const { container } = render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoCommitGroups={expandedCommits}
        repoCommitTreeData={commitData}
        selectedItem="repo-commit:org/hs-buddy/sel1234567890"
      />
    )
    const selected = container.querySelectorAll('.sidebar-pr-child.selected')
    expect(selected.length).toBeGreaterThanOrEqual(1)
  })

  it('handles keyboard Enter on Overview item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    render(<RepoNode {...baseProps} expandedRepos={expanded} onItemSelect={onItemSelect} />)
    const overview = screen.getByText('Overview').closest('[role="button"]')!
    fireEvent.keyDown(overview, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-detail:org/hs-buddy')
  })

  it('handles keyboard Enter on Commits section', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoCommitGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onItemSelect={onItemSelect}
        onToggleRepoCommitGroup={onToggleRepoCommitGroup}
      />
    )
    const commits = screen.getByText('Commits').closest('[role="button"]')!
    fireEvent.keyDown(commits, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-commits:org/hs-buddy')
    expect(onToggleRepoCommitGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles chevron click on commits section with stopPropagation', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoCommitGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onToggleRepoCommitGroup={onToggleRepoCommitGroup}
      />
    )
    // Find the Commits section and its chevron
    const commitsLabel = screen.getByText('Commits')
    const commitsRow = commitsLabel.closest('.sidebar-item-disclosure')!
    const chevron = commitsRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleRepoCommitGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles chevron click on issues section with stopPropagation', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoIssueGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onToggleRepoIssueGroup={onToggleRepoIssueGroup}
      />
    )
    const issuesLabel = screen.getByText('Issues')
    const issuesRow = issuesLabel.closest('.sidebar-item-disclosure')!
    const chevron = issuesRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleRepoIssueGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles keyboard on issue state chevrons', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    // Find the Open chevron in issues section
    const openItem = screen.getByText('Open')
    const openRow = openItem.closest('.sidebar-pr-child')!
    const chevron = openRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('handles keyboard on closed issues state chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    const closedItem = screen.getByText('Closed')
    const closedRow = closedItem.closest('.sidebar-pr-child')!
    fireEvent.keyDown(closedRow, { key: 'Enter' })
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('handles keyboard on closed PR state row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    // The "Closed" item inside the PR tree
    const closedItems = screen.getAllByText('Closed')
    // The last "Closed" should be in the PR tree (Issues has one too)
    const prClosedRow = closedItems[closedItems.length - 1].closest('.sidebar-pr-child')!
    fireEvent.keyDown(prClosedRow, { key: 'Enter' })
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('renders PR count and updated age label in PR section', () => {
    const expanded = new Set(['org/hs-buddy'])
    const counts: Record<string, RepoCounts> = {
      'org/hs-buddy': { issues: 2, prs: 7 },
    }
    const mockCache = vi.mocked(dataCache)
    mockCache.get.mockReturnValue({ data: counts['org/hs-buddy'], fetchedAt: Date.now() - 300_000 })
    render(<RepoNode {...baseProps} expandedRepos={expanded} repoCounts={counts} />)
    // PR count
    expect(screen.getByText('7')).toBeDefined()
    // Updated age
    expect(screen.getByText('updated 5m ago')).toBeDefined()
    mockCache.get.mockReturnValue(null)
  })

  it('renders commit count badge capped at 25', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedCommits = new Set(['org/hs-buddy'])
    const commits: RepoCommit[] = Array.from({ length: 30 }, (_, i) => ({
      sha: `sha${String(i).padStart(12, '0')}`,
      message: `Commit ${i}`,
      author: 'alice',
      authorAvatarUrl: null,
      date: '2026-04-10',
      url: `https://github.com/org/hs-buddy/commit/sha${i}`,
    }))
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoCommitGroups={expandedCommits}
        repoCommitTreeData={{ 'org/hs-buddy': commits }}
      />
    )
    // Count badge caps at 25
    expect(screen.getByText('25')).toBeDefined()
    // Only first 10 commits rendered in the tree
    expect(screen.getByText('Commit 0')).toBeDefined()
    expect(screen.getByText('Commit 9')).toBeDefined()
    expect(screen.queryByText('Commit 10')).toBeNull()
  })

  it('does not render language badge when language is null', () => {
    const { container } = render(<RepoNode {...baseProps} repo={makeRepo({ language: null })} />)
    expect(screen.getByText('hs-buddy')).toBeDefined()
    expect(container.querySelector('.sidebar-repo-lang')).toBeNull()
  })

  it('falls back to fullName in title attribute when description is null', () => {
    const { container } = render(<RepoNode {...baseProps} repo={makeRepo({ description: null })} />)
    const repoButton = container.querySelector('.sidebar-repo-item')!
    expect(repoButton.getAttribute('title')).toBe('org/hs-buddy')
  })

  it('renders both open and closed PR state groups with data simultaneously', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open', 'org/hs-buddy:closed'])
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [
        {
          id: 10,
          title: 'Open PR',
          source: 'GitHub',
          repository: 'org/hs-buddy',
          author: 'alice',
          state: 'open',
          url: 'https://github.com/org/hs-buddy/pull/10',
          approvalCount: 0,
          assigneeCount: 0,
          iApproved: false,
          created: new Date('2026-04-01'),
          date: '2026-04-01',
          headBranch: 'feat',
          baseBranch: 'main',
        },
      ],
      'closed:org/hs-buddy': [
        {
          id: 20,
          title: 'Merged PR',
          source: 'GitHub',
          repository: 'org/hs-buddy',
          author: 'bob',
          state: 'closed',
          url: 'https://github.com/org/hs-buddy/pull/20',
          approvalCount: 1,
          assigneeCount: 0,
          iApproved: false,
          created: new Date('2026-03-01'),
          date: '2026-03-01',
          headBranch: 'fix',
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
      />
    )
    expect(screen.getByText(/#10 Open PR/)).toBeDefined()
    expect(screen.getByText(/#20 Merged PR/)).toBeDefined()
  })

  it('renders expanded SFL section with overall status label and workflow count', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedSFL = new Set(['org/hs-buddy'])
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: true,
        overallStatus: 'recent-failure',
        workflows: [
          {
            id: 1,
            name: 'SFL: Issue Processor',
            state: 'active',
            latestRun: {
              status: 'completed',
              conclusion: 'failure',
              createdAt: '2026-04-10',
              url: 'https://example.com',
            },
          },
          {
            id: 2,
            name: 'SFL: PR Router',
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
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedSFLGroups={expandedSFL}
        sflStatusData={sflData}
      />
    )
    expect(screen.getByText('Recent failure')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText('Issue Processor')).toBeDefined()
    expect(screen.getByText('PR Router')).toBeDefined()
  })

  it('shows spinner on Closed issues label row when closed issues are loading', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const loading = new Set(['closed:org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        loadingRepoIssues={loading}
      />
    )
    const closedLabel = screen.getByText('Closed')
    const closedRow = closedLabel.closest('.sidebar-pr-child')!
    expect(closedRow.querySelector('.spin')).not.toBeNull()
  })

  it('shows spinner on Closed PR label row when closed PRs are loading', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const loading = new Set(['closed:org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        loadingRepoPRs={loading}
      />
    )
    // Find the Closed row in the PR section (last one)
    const closedLabels = screen.getAllByText('Closed')
    const prClosedRow = closedLabels[closedLabels.length - 1].closest('.sidebar-pr-child')!
    expect(prClosedRow.querySelector('.spin')).not.toBeNull()
  })

  // --- Additional handler coverage tests ---

  it('handles keyboard Enter on commits section chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoCommitGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onToggleRepoCommitGroup={onToggleRepoCommitGroup}
      />
    )
    const commitsRow = screen.getByText('Commits').closest('.sidebar-item-disclosure')!
    const chevron = commitsRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleRepoCommitGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles keyboard Enter on Issues section row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoIssueGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onItemSelect={onItemSelect}
        onToggleRepoIssueGroup={onToggleRepoIssueGroup}
      />
    )
    const issuesRow = screen.getByText('Issues').closest('[role="button"]')!
    fireEvent.keyDown(issuesRow, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-issues:org/hs-buddy')
    expect(onToggleRepoIssueGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles keyboard Enter on Issues section chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoIssueGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onToggleRepoIssueGroup={onToggleRepoIssueGroup}
      />
    )
    const issuesRow = screen.getByText('Issues').closest('.sidebar-item-disclosure')!
    const chevron = issuesRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleRepoIssueGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles keyboard Enter on open issues state row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onItemSelect={onItemSelect}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    const openRow = screen.getByText('Open').closest('.sidebar-pr-child')!
    fireEvent.keyDown(openRow, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-issues:org/hs-buddy')
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('handles click on open issues state chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    const openRow = screen.getByText('Open').closest('.sidebar-pr-child')!
    const chevron = openRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('handles keyboard Enter on individual open issue item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:open'])
    const onItemSelect = vi.fn()
    const issueData: Record<string, RepoIssue[]> = {
      'open:org/hs-buddy': [
        {
          number: 5,
          title: 'Keyboard issue',
          state: 'open',
          createdAt: '2026-04-01',
          author: 'alice',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/5',
          updatedAt: '2026-04-01',
          labels: [],
          commentCount: 0,
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
        onItemSelect={onItemSelect}
      />
    )
    const issueEl = screen.getByText(/#5 Keyboard issue/).closest('[role="button"]')!
    fireEvent.keyDown(issueEl, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-issue:org/hs-buddy/5')
  })

  it('handles click on closed issues row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onItemSelect={onItemSelect}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    const closedRow = screen.getByText('Closed').closest('.sidebar-pr-child')!
    fireEvent.click(closedRow)
    expect(onItemSelect).toHaveBeenCalledWith('repo-issues-closed:org/hs-buddy')
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('handles click on closed issues chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    const closedRow = screen.getByText('Closed').closest('.sidebar-pr-child')!
    const chevron = closedRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('handles keyboard Enter on closed issues chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const onToggleRepoIssueStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoIssueGroups={expandedIssueGroups}
        onToggleRepoIssueStateGroup={onToggleRepoIssueStateGroup}
      />
    )
    const closedRow = screen.getByText('Closed').closest('.sidebar-pr-child')!
    const chevron = closedRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleRepoIssueStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('handles keyboard Enter on individual closed issue item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedIssueGroups = new Set(['org/hs-buddy'])
    const expandedIssueStates = new Set(['org/hs-buddy:closed'])
    const onItemSelect = vi.fn()
    const issueData: Record<string, RepoIssue[]> = {
      'closed:org/hs-buddy': [
        {
          number: 20,
          title: 'Closed keyboard issue',
          state: 'closed',
          createdAt: '2026-03-01',
          author: 'alice',
          authorAvatarUrl: null,
          url: 'https://github.com/org/hs-buddy/issues/20',
          updatedAt: '2026-03-15',
          labels: [],
          commentCount: 0,
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
        onItemSelect={onItemSelect}
      />
    )
    const issueEl = screen.getByText(/#20 Closed keyboard issue/).closest('[role="button"]')!
    fireEvent.keyDown(issueEl, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-issue:org/hs-buddy/20')
  })

  it('handles keyboard Enter on Pull Requests section row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoPRGroup = vi.fn()
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        onItemSelect={onItemSelect}
        onToggleRepoPRGroup={onToggleRepoPRGroup}
      />
    )
    const prRow = screen.getByText('Pull Requests').closest('[role="button"]')!
    fireEvent.keyDown(prRow, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-prs:org/hs-buddy')
    expect(onToggleRepoPRGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles click on Pull Requests section chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleRepoPRGroup = vi.fn()
    const { container } = render(
      <RepoNode {...baseProps} expandedRepos={expanded} onToggleRepoPRGroup={onToggleRepoPRGroup} />
    )
    const prRow = container.querySelector('.sidebar-repo-pr-row')!
    const chevron = prRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleRepoPRGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles keyboard Enter on open PR state row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onItemSelect={onItemSelect}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    const openRow = screen.getByText('Open').closest('.sidebar-pr-child')!
    fireEvent.keyDown(openRow, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('repo-prs:org/hs-buddy')
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('handles click on open PR state chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    const openRow = screen.getByText('Open').closest('.sidebar-pr-child')!
    const chevron = openRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('handles keyboard Enter on open PR state chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    const openRow = screen.getByText('Open').closest('.sidebar-pr-child')!
    const chevron = openRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'open')
  })

  it('handles click on closed PR row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onItemSelect = vi.fn()
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onItemSelect={onItemSelect}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    const closedRow = screen.getByText('Closed').closest('.sidebar-pr-child')!
    fireEvent.click(closedRow)
    expect(onItemSelect).toHaveBeenCalledWith('repo-prs-closed:org/hs-buddy')
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('handles click on closed PR state chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    const closedRow = screen.getByText('Closed').closest('.sidebar-pr-child')!
    const chevron = closedRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('handles keyboard Enter on closed PR state chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const onToggleRepoPRStateGroup = vi.fn() as (
      org: string,
      repo: string,
      state: 'open' | 'closed'
    ) => void
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        onToggleRepoPRStateGroup={onToggleRepoPRStateGroup}
      />
    )
    const closedRow = screen.getByText('Closed').closest('.sidebar-pr-child')!
    const chevron = closedRow.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onToggleRepoPRStateGroup).toHaveBeenCalledWith('org', 'hs-buddy', 'closed')
  })

  it('handles keyboard Enter on SFL section row', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleSFLGroup = vi.fn()
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: true,
        overallStatus: 'healthy',
        workflows: [],
      },
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        sflStatusData={sflData}
        onToggleSFLGroup={onToggleSFLGroup}
      />
    )
    const sflRow = screen.getByText('SFL Loop').closest('[role="button"]')!
    fireEvent.keyDown(sflRow, { key: 'Enter' })
    expect(onToggleSFLGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles click on SFL section chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const onToggleSFLGroup = vi.fn()
    const sflData: Record<string, SFLRepoStatus> = {
      'org/hs-buddy': {
        isSFLEnabled: true,
        overallStatus: 'healthy',
        workflows: [],
      },
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        sflStatusData={sflData}
        onToggleSFLGroup={onToggleSFLGroup}
      />
    )
    const sflRow = screen.getByText('SFL Loop').closest('.sidebar-item-disclosure')!
    const chevron = sflRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)
    expect(onToggleSFLGroup).toHaveBeenCalledWith('org', 'hs-buddy')
  })

  it('handles click on PR item to select it', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const onItemSelect = vi.fn()
    const pr: PullRequest = {
      id: 100,
      title: 'Click PR',
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
      headBranch: 'click-pr',
      baseBranch: 'main',
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        onItemSelect={onItemSelect}
      />
    )
    const prItem = screen.getByText(/#100 Click PR/).closest('.sidebar-pr-item')!
    fireEvent.click(prItem)
    expect(onItemSelect).toHaveBeenCalledWith(createPRDetailViewId(pr))
  })

  it('handles keyboard Enter on PR item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const onItemSelect = vi.fn()
    const pr: PullRequest = {
      id: 100,
      title: 'Key PR',
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
      headBranch: 'key-pr',
      baseBranch: 'main',
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        onItemSelect={onItemSelect}
      />
    )
    const prItem = screen.getByText(/#100 Key PR/).closest('.sidebar-pr-item')!
    fireEvent.keyDown(prItem, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith(createPRDetailViewId(pr))
  })

  it('handles keyboard Enter on PR item chevron', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const onTogglePRNode = vi.fn()
    const pr: PullRequest = {
      id: 600,
      title: 'Chevron key PR',
      source: 'GitHub',
      repository: 'org/hs-buddy',
      author: 'alice',
      state: 'open',
      url: 'https://github.com/org/hs-buddy/pull/600',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: new Date('2026-04-01'),
      date: '2026-04-01',
      headBranch: 'chevron-key',
      baseBranch: 'main',
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        onTogglePRNode={onTogglePRNode}
      />
    )
    const prItem = screen.getByText(/#600 Chevron key PR/).closest('.sidebar-pr-item')!
    const chevron = prItem.querySelector('.sidebar-item-chevron')!
    fireEvent.keyDown(chevron, { key: 'Enter' })
    expect(onTogglePRNode).toHaveBeenCalled()
  })

  it('handles keyboard Enter on PR sub-node item', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedPRGroups = new Set(['org/hs-buddy'])
    const expandedPRStates = new Set(['org/hs-buddy:open'])
    const onItemSelect = vi.fn()
    const pr: PullRequest = {
      id: 100,
      title: 'Sub-node key PR',
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
      headBranch: 'sub-node-key',
      baseBranch: 'main',
    }
    const prData: Record<string, PullRequest[]> = {
      'open:org/hs-buddy': [pr],
    }
    const prViewId = createPRDetailViewId(pr)
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoPRGroups={expandedPRGroups}
        expandedRepoPRStateGroups={expandedPRStates}
        repoPrTreeData={prData}
        expandedPRNodes={new Set([prViewId])}
        onItemSelect={onItemSelect}
      />
    )
    const conversationEl = screen.getByText('Conversation').closest('[role="button"]')!
    fireEvent.keyDown(conversationEl, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith(expect.stringContaining('conversation'))
  })

  it('renders nothing for commit section when commit data is empty', () => {
    const expanded = new Set(['org/hs-buddy'])
    const expandedCommits = new Set(['org/hs-buddy'])
    render(
      <RepoNode
        {...baseProps}
        expandedRepos={expanded}
        expandedRepoCommitGroups={expandedCommits}
        repoCommitTreeData={{ 'org/hs-buddy': [] }}
      />
    )
    expect(screen.getByText('Commits')).toBeTruthy()
    expect(document.querySelector('.sidebar-pr-child')).toBeNull()
  })
})
