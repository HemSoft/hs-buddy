import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SidebarPRContextMenu } from './SidebarPRContextMenu'
import type { PullRequest } from '../../../types/pullRequest'

const basePr: PullRequest = {
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 423,
  title: 'Add sidebar tree coverage',
  author: 'alice',
  url: 'https://github.com/relias-engineering/hs-buddy/pull/423',
  state: 'OPEN',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: new Date('2026-03-31T12:00:00Z'),
  date: '2026-03-31T12:00:00Z',
  org: 'relias-engineering',
}

describe('SidebarPRContextMenu', () => {
  it('renders actions, positions the menu, and invokes handlers', async () => {
    const onOpen = vi.fn()
    const onCopyLink = vi.fn()
    const onAIReview = vi.fn()
    const onApprove = vi.fn().mockResolvedValue(undefined)
    const onBookmark = vi.fn()
    const onClose = vi.fn()

    render(
      <SidebarPRContextMenu
        pr={basePr}
        x={12}
        y={24}
        approvingPrKey={null}
        bookmarkedRepoKeys={new Set(['relias-engineering/hs-buddy'])}
        onOpen={onOpen}
        onCopyLink={onCopyLink}
        onAIReview={onAIReview}
        onApprove={onApprove}
        onBookmark={onBookmark}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /open pull request/i }))
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    fireEvent.click(screen.getByRole('button', { name: /request ai review/i }))
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /unbookmark hs-buddy/i }))
    fireEvent.click(document.querySelector('.context-menu-overlay')!)

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onCopyLink).toHaveBeenCalledOnce()
    expect(onAIReview).toHaveBeenCalledOnce()
    expect(onBookmark).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce())
    expect(document.querySelector('.context-menu')).toHaveStyle({ top: '24px', left: '12px' })
  })

  it('shows the in-progress approval state', () => {
    render(
      <SidebarPRContextMenu
        pr={basePr}
        x={0}
        y={0}
        approvingPrKey="GitHub-hs-buddy-423"
        bookmarkedRepoKeys={new Set()}
        onOpen={vi.fn()}
        onCopyLink={vi.fn()}
        onAIReview={vi.fn()}
        onApprove={vi.fn().mockResolvedValue(undefined)}
        onBookmark={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /approving/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /bookmark hs-buddy/i })).toBeTruthy()
  })

  it('disables approval when the pull request is already approved', () => {
    render(
      <SidebarPRContextMenu
        pr={{ ...basePr, iApproved: true }}
        x={0}
        y={0}
        approvingPrKey={null}
        bookmarkedRepoKeys={new Set()}
        onOpen={vi.fn()}
        onCopyLink={vi.fn()}
        onAIReview={vi.fn()}
        onApprove={vi.fn().mockResolvedValue(undefined)}
        onBookmark={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /already approved/i })).toBeDisabled()
  })

  it('handles pr.org being undefined by using empty string in bookmark key', () => {
    const prNoOrg = { ...basePr, org: undefined } as unknown as typeof basePr
    render(
      <SidebarPRContextMenu
        pr={prNoOrg}
        x={0}
        y={0}
        approvingPrKey={null}
        bookmarkedRepoKeys={new Set(['/hs-buddy'])}
        onOpen={vi.fn()}
        onCopyLink={vi.fn()}
        onAIReview={vi.fn()}
        onApprove={vi.fn().mockResolvedValue(undefined)}
        onBookmark={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /unbookmark hs-buddy/i })).toBeTruthy()
  })
})
