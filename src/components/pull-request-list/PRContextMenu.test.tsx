import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PRContextMenu } from './PRContextMenu'
import type { PullRequest } from '../../types/pullRequest'

const basePr: PullRequest = {
  source: 'GitHub',
  repository: 'buddy',
  id: 42,
  title: 'Add tests',
  author: 'alice',
  url: 'https://github.com/relias-engineering/hs-buddy/pull/42',
  state: 'OPEN',
  approvalCount: 1,
  assigneeCount: 2,
  iApproved: false,
  created: new Date('2026-03-31T12:00:00Z'),
  date: null,
  org: 'relias-engineering',
}

describe('PRContextMenu', () => {
  it('renders available actions and invokes their handlers', () => {
    const onAIReview = vi.fn()
    const onApprove = vi.fn()
    const onCopyLink = vi.fn()
    const onBookmark = vi.fn()
    const onClose = vi.fn()

    render(
      <PRContextMenu
        x={12}
        y={24}
        pr={basePr}
        bookmarkedRepoKeys={new Set()}
        onAIReview={onAIReview}
        onApprove={onApprove}
        onCopyLink={onCopyLink}
        onBookmark={onBookmark}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /request ai review/i }))
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    fireEvent.click(screen.getByRole('button', { name: /bookmark buddy/i }))
    fireEvent.click(document.querySelector('.pr-context-menu-overlay')!)

    expect(onAIReview).toHaveBeenCalledOnce()
    expect(onApprove).toHaveBeenCalledOnce()
    expect(onCopyLink).toHaveBeenCalledOnce()
    expect(onBookmark).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.querySelector('.pr-context-menu')).toHaveStyle({
      top: '24px',
      left: '12px',
    })
  })

  it('shows approved and bookmarked states', () => {
    render(
      <PRContextMenu
        x={0}
        y={0}
        pr={{ ...basePr, iApproved: true }}
        bookmarkedRepoKeys={new Set(['relias-engineering/buddy'])}
        onAIReview={vi.fn()}
        onApprove={vi.fn()}
        onCopyLink={vi.fn()}
        onBookmark={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /already approved/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /unbookmark buddy/i })).toBeTruthy()
  })
})
