import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PRItem } from './PRItem'
import type { PullRequest } from '../../types/pullRequest'

const { mockFormatDistanceToNow } = vi.hoisted(() => ({
  mockFormatDistanceToNow: vi.fn(() => '2 hours ago'),
}))

vi.mock('../../utils/dateUtils', () => ({
  formatDistanceToNow: mockFormatDistanceToNow,
}))

const basePr: PullRequest = {
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 420,
  title: 'Improve PR list coverage',
  author: 'octocat',
  authorAvatarUrl: 'https://example.com/author.png',
  url: 'https://github.com/relias-engineering/hs-buddy/pull/420',
  state: 'OPEN',
  approvalCount: 1,
  assigneeCount: 2,
  iApproved: false,
  created: new Date('2026-03-30T12:00:00Z'),
  date: '2026-03-31T08:00:00Z',
  orgAvatarUrl: 'https://example.com/org.png',
  org: 'relias-engineering',
  baseBranch: 'main',
  headBranch: 'agent-fix/issue-420',
  threadsAddressed: 3,
  threadsUnaddressed: 1,
}

describe('PRItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders PR metadata, branches, avatars, and thread badges', () => {
    render(
      <PRItem
        pr={basePr}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )

    expect(screen.getByText('Improve PR list coverage')).toBeTruthy()
    expect(screen.getByText('hs-buddy')).toBeTruthy()
    expect(screen.getByText('#420')).toBeTruthy()
    expect(screen.getByText('octocat')).toBeTruthy()
    expect(screen.getByText(/into/i)).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByAltText('relias-engineering')).toHaveAttribute(
      'src',
      'https://example.com/org.png'
    )
    expect(screen.getByAltText('octocat')).toHaveAttribute('src', 'https://example.com/author.png')
    expect(mockFormatDistanceToNow).toHaveBeenCalledWith(basePr.created)
  })

  it('opens the PR on click and keyboard interactions and forwards the context menu event', () => {
    const onOpen = vi.fn()
    const onContextMenu = vi.fn()

    render(
      <PRItem
        pr={basePr}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={onContextMenu}
        onOpen={onOpen}
      />
    )

    const item = screen.getByRole('link')
    fireEvent.click(item)
    fireEvent.keyDown(item, { key: 'Enter' })
    fireEvent.keyDown(item, { key: ' ' })
    fireEvent.contextMenu(item)

    expect(onOpen).toHaveBeenCalledTimes(3)
    expect(onOpen).toHaveBeenCalledWith(basePr)
    expect(onContextMenu).toHaveBeenCalledOnce()
    expect(onContextMenu.mock.calls[0]?.[1]).toEqual(basePr)
  })

  it('shows approving state and disables the approve button while approval is in flight', () => {
    render(
      <PRItem
        pr={basePr}
        mode="my-prs"
        approving="hs-buddy-420"
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )

    expect(screen.getByText(/approving/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
  })

  it('calls onApprove without bubbling and uses merged date in recently-merged mode', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined)
    const onOpen = vi.fn()

    render(
      <PRItem
        pr={{ ...basePr, iApproved: true }}
        mode="recently-merged"
        approving={null}
        onApprove={onApprove}
        onContextMenu={vi.fn()}
        onOpen={onOpen}
      />
    )

    const approveButton = screen.getByRole('button', { name: /approved/i })
    expect(approveButton).toBeDisabled()
    expect(mockFormatDistanceToNow).toHaveBeenCalledWith('2026-03-31T08:00:00Z')

    render(
      <PRItem
        pr={{ ...basePr, iApproved: false, orgAvatarUrl: undefined, authorAvatarUrl: undefined }}
        mode="recently-merged"
        approving={null}
        onApprove={onApprove}
        onContextMenu={vi.fn()}
        onOpen={onOpen}
      />
    )

    const activeApproveButton = screen.getAllByRole('button', { name: /^approve$/i })[0]
    fireEvent.click(activeApproveButton)

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({ repository: 'hs-buddy', id: 420 })
    )
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByText('GH')).toBeTruthy()
  })

  it('shows BB label for non-GitHub source without org avatar', () => {
    render(
      <PRItem
        pr={{ ...basePr, source: 'Bitbucket' as PullRequest['source'], orgAvatarUrl: undefined }}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('BB')).toBeTruthy()
  })

  it('hides branch flow when baseBranch is undefined', () => {
    render(
      <PRItem
        pr={{ ...basePr, baseBranch: undefined }}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(screen.queryByText(/into/i)).toBeNull()
  })

  it('hides thread badges when thread counts are null', () => {
    render(
      <PRItem
        pr={{ ...basePr, threadsAddressed: undefined, threadsUnaddressed: undefined }}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(document.querySelector('.pr-thread-status')).toBeNull()
  })

  it('shows question mark when assigneeCount is zero', () => {
    render(
      <PRItem
        pr={{ ...basePr, assigneeCount: 0 }}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('1/? approvals')).toBeTruthy()
  })

  it('does not trigger onOpen for non-interactive keys', () => {
    const onOpen = vi.fn()
    render(
      <PRItem
        pr={basePr}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={onOpen}
      />
    )
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Tab' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('falls back through date chain in recently-merged mode', () => {
    render(
      <PRItem
        pr={{ ...basePr, date: null }}
        mode="recently-merged"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(mockFormatDistanceToNow).toHaveBeenCalledWith(basePr.created)
  })

  it('uses Date.now when date and created are both null in recently-merged mode', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    render(
      <PRItem
        pr={{ ...basePr, date: null, created: null }}
        mode="recently-merged"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(mockFormatDistanceToNow).toHaveBeenCalledWith(now)
  })

  it('uses Date.now when created is null in non-recently-merged mode', () => {
    const now = 1700000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    render(
      <PRItem
        pr={{ ...basePr, created: null }}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    expect(mockFormatDistanceToNow).toHaveBeenCalledWith(now)
  })

  it('falls back to pr.source in avatar alt when org is empty', () => {
    render(
      <PRItem
        pr={{ ...basePr, org: '' }}
        mode="my-prs"
        approving={null}
        onApprove={vi.fn()}
        onContextMenu={vi.fn()}
        onOpen={vi.fn()}
      />
    )
    const img = document.querySelector('.pr-org-avatar') as HTMLImageElement
    expect(img.alt).toBe('GitHub')
  })
})
