import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePRContextMenu } from './usePRContextMenu'
import type { PullRequest } from '../../types/pullRequest'
import type { Id } from '../../../convex/_generated/dataModel'

vi.mock('../../api/github', () => ({
  GitHubClient: vi.fn(),
}))

vi.mock('../../utils/githubUrl', () => ({
  parseOwnerRepoFromUrl: vi.fn(),
}))

vi.mock('../../utils/assistantPrompts', () => ({
  buildAddressCommentsPrompt: vi.fn(() => 'prompt'),
}))

vi.mock('../../utils/errorUtils', () => ({
  throwIfAborted: vi.fn(),
}))

vi.mock('../../utils/prReviewEvents', () => ({
  dispatchPRReviewOpen: vi.fn(),
}))

const makePR = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 1,
  title: 'Test PR',
  author: 'octocat',
  url: 'https://github.com/my-org/hs-buddy/pull/1',
  state: 'OPEN',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: new Date('2026-01-01'),
  date: null,
  org: 'my-org',
  ...overrides,
})

describe('usePRContextMenu – toggleBookmark edge cases', () => {
  const createBookmark = vi.fn().mockResolvedValue(undefined)
  const removeBookmark = vi.fn().mockResolvedValue(undefined)
  const enqueueRef = { current: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs error when bookmarkedRepoKeys has key but bookmark array has no match', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pr = makePR({ org: 'my-org', repository: 'hs-buddy' })

    // Set has the key but bookmarks array doesn't contain a matching entry
    const bookmarkedRepoKeys = new Set(['my-org/hs-buddy'])
    const bookmarks: Array<{
      _id: Id<'repoBookmarks'>
      owner?: string | null
      repo?: string | null
    }> = [
      { _id: 'other-id' as Id<'repoBookmarks'>, owner: 'different-org', repo: 'different-repo' },
    ]

    const { result } = renderHook(() =>
      usePRContextMenu({
        accounts: [{ username: 'alice', org: 'my-org' }],
        bookmarks,
        bookmarkedRepoKeys,
        recentlyMergedDays: 14,
        premiumModel: 'gpt-4',
        createBookmark,
        removeBookmark,
        enqueueRef,
      })
    )

    // Open context menu
    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 10, clientY: 20 } as unknown as React.MouseEvent,
        pr
      )
    })

    // Trigger bookmark toggle — key in Set but no matching bookmark
    await act(async () => {
      await result.current.handleBookmarkRepo()
    })

    expect(removeBookmark).not.toHaveBeenCalled()
    expect(createBookmark).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('toggleBookmark: key in Set but bookmark not found', {
      org: 'my-org',
      repoName: 'hs-buddy',
    })

    errorSpy.mockRestore()
  })

  it('logs error when bookmarks is null and key exists in Set', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pr = makePR({ org: 'my-org', repository: 'hs-buddy' })

    const bookmarkedRepoKeys = new Set(['my-org/hs-buddy'])

    const { result } = renderHook(() =>
      usePRContextMenu({
        accounts: [],
        bookmarks: null,
        bookmarkedRepoKeys,
        recentlyMergedDays: 14,
        premiumModel: 'gpt-4',
        createBookmark,
        removeBookmark,
        enqueueRef,
      })
    )

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 10, clientY: 20 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleBookmarkRepo()
    })

    expect(removeBookmark).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('toggleBookmark: key in Set but bookmark not found', {
      org: 'my-org',
      repoName: 'hs-buddy',
    })

    errorSpy.mockRestore()
  })

  it('warns and returns early when pr.org is falsy', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pr = makePR({ org: '', repository: 'hs-buddy' })

    const { result } = renderHook(() =>
      usePRContextMenu({
        accounts: [],
        bookmarks: [],
        bookmarkedRepoKeys: new Set(),
        recentlyMergedDays: 14,
        premiumModel: 'gpt-4',
        createBookmark,
        removeBookmark,
        enqueueRef,
      })
    )

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 10, clientY: 20 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleBookmarkRepo()
    })

    expect(createBookmark).not.toHaveBeenCalled()
    expect(removeBookmark).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      'toggleBookmark: missing org or repository',
      expect.objectContaining({ org: '' })
    )

    warnSpy.mockRestore()
  })
})
