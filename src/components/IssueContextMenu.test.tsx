import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IssueContextMenu, type IssueContextMenuProps } from './IssueContextMenu'
import type { RepoIssue } from '../api/github'

function makeIssue(overrides: Partial<RepoIssue> = {}): RepoIssue {
  return {
    number: 42,
    title: 'Test issue',
    author: 'alice',
    authorAvatarUrl: '',
    url: 'https://github.com/o/r/issues/42',
    state: 'open',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    labels: [],
    commentCount: 0,
    assignees: [],
    ...overrides,
  } as RepoIssue
}

type MockHandlers = Partial<
  Record<
    keyof Pick<
      IssueContextMenuProps,
      'onStartRalphLoop' | 'onViewDetails' | 'onCopyLink' | 'onOpenOnGitHub' | 'onClose'
    >,
    ReturnType<typeof vi.fn>
  >
>

function renderMenu(issueOverrides: Partial<RepoIssue> = {}, handlers: MockHandlers = {}) {
  const props = {
    x: 100,
    y: 200,
    issue: makeIssue(issueOverrides),
    owner: 'test-org',
    repo: 'test-repo',
    onStartRalphLoop: handlers.onStartRalphLoop ?? vi.fn(),
    onViewDetails: handlers.onViewDetails ?? vi.fn(),
    onCopyLink: handlers.onCopyLink ?? vi.fn(),
    onOpenOnGitHub: handlers.onOpenOnGitHub ?? vi.fn(),
    onClose: handlers.onClose ?? vi.fn(),
  }
  return render(<IssueContextMenu {...(props as IssueContextMenuProps)} />)
}

describe('IssueContextMenu', () => {
  it('renders all menu buttons', () => {
    renderMenu()
    expect(screen.getByText('View Details')).toBeInTheDocument()
    expect(screen.getByText('Start Ralph Loop')).toBeInTheDocument()
    expect(screen.getByText('Copy Link')).toBeInTheDocument()
    expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
  })

  it('calls onViewDetails when clicked', () => {
    const onViewDetails = vi.fn()
    renderMenu({}, { onViewDetails })
    fireEvent.click(screen.getByText('View Details'))
    expect(onViewDetails).toHaveBeenCalled()
  })

  it('calls onStartRalphLoop when clicked on open issue', () => {
    const onStartRalphLoop = vi.fn()
    renderMenu({ state: 'open' }, { onStartRalphLoop })
    const btn = screen.getByText('Start Ralph Loop')
    expect(btn.closest('button')).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onStartRalphLoop).toHaveBeenCalled()
  })

  it('disables Start Ralph Loop for closed issues and shows "Issue Closed"', () => {
    renderMenu({ state: 'closed' })
    expect(screen.getByText('Issue Closed')).toBeInTheDocument()
    expect(screen.getByText('Issue Closed').closest('button')).toBeDisabled()
  })

  it('calls onCopyLink when clicked', () => {
    const onCopyLink = vi.fn()
    renderMenu({}, { onCopyLink })
    fireEvent.click(screen.getByText('Copy Link'))
    expect(onCopyLink).toHaveBeenCalled()
  })

  it('calls onOpenOnGitHub when clicked', () => {
    const onOpenOnGitHub = vi.fn()
    renderMenu({}, { onOpenOnGitHub })
    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(onOpenOnGitHub).toHaveBeenCalled()
  })

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn()
    const { container } = renderMenu({}, { onClose })
    const overlay = container.querySelector('.context-menu-overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })
})
