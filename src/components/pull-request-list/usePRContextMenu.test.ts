import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePRContextMenu } from './usePRContextMenu'
import type { PullRequest } from '../../types/pullRequest'
import type { Id } from '../../../convex/_generated/dataModel'
import { parseOwnerRepoFromUrl } from '../../utils/githubUrl'
import { buildAddressCommentsPrompt } from '../../utils/assistantPrompts'
import { dispatchPRReviewOpen } from '../../utils/prReviewEvents'

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

  it('warns and returns early when pr.org is undefined (nullish coalescing fallback)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pr = makePR({ org: undefined, repository: 'hs-buddy' })

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
      expect.objectContaining({ org: undefined })
    )

    warnSpy.mockRestore()
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

describe('usePRContextMenu – early return guards (no contextMenu)', () => {
  const createBookmark = vi.fn()
  const removeBookmark = vi.fn()
  const enqueueRef = { current: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handleBookmarkRepo returns early without contextMenu', async () => {
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

    await act(async () => {
      await result.current.handleBookmarkRepo()
    })
    expect(createBookmark).not.toHaveBeenCalled()
    expect(removeBookmark).not.toHaveBeenCalled()
  })

  it('handleAIReview returns early without contextMenu', async () => {
    const mockDispatch = vi.mocked(dispatchPRReviewOpen)
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

    await act(async () => {
      await result.current.handleAIReview()
    })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('handleRequestCopilotReview returns early without contextMenu', async () => {
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

    await act(async () => {
      await result.current.handleRequestCopilotReview()
    })
    expect(enqueueRef.current).not.toHaveBeenCalled()
  })

  it('handleAddressComments returns early without contextMenu', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
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
      result.current.handleAddressComments()
    })
    expect(dispatchSpy).not.toHaveBeenCalled()
    dispatchSpy.mockRestore()
  })

  it('handleCopyLink returns early without contextMenu', async () => {
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

    await act(async () => {
      await result.current.handleCopyLink()
    })
    // No crash, no clipboard call
    expect(result.current.contextMenu).toBeNull()
  })
})

describe('usePRContextMenu – createBookmark path', () => {
  const createBookmark = vi.fn().mockResolvedValue(undefined)
  const removeBookmark = vi.fn().mockResolvedValue(undefined)
  const enqueueRef = { current: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates bookmark when key is not in bookmarkedRepoKeys', async () => {
    const pr = makePR({
      org: 'my-org',
      repository: 'hs-buddy',
      url: 'https://github.com/my-org/hs-buddy/pull/1',
    })

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

    expect(createBookmark).toHaveBeenCalledWith({
      folder: 'my-org',
      owner: 'my-org',
      repo: 'hs-buddy',
      url: 'https://github.com/my-org/hs-buddy',
      description: '',
    })
    expect(result.current.contextMenu).toBeNull()
  })

  it('removes bookmark when key is in bookmarkedRepoKeys and bookmark found', async () => {
    const pr = makePR({ org: 'my-org', repository: 'hs-buddy' })
    const bookmarkId = 'bm-123' as Id<'repoBookmarks'>

    const { result } = renderHook(() =>
      usePRContextMenu({
        accounts: [],
        bookmarks: [{ _id: bookmarkId, owner: 'my-org', repo: 'hs-buddy' }],
        bookmarkedRepoKeys: new Set(['my-org/hs-buddy']),
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

    expect(removeBookmark).toHaveBeenCalledWith({ id: bookmarkId })
    expect(result.current.contextMenu).toBeNull()
  })
})

describe('usePRContextMenu – handleAIReview', () => {
  const createBookmark = vi.fn()
  const removeBookmark = vi.fn()
  const enqueueRef = { current: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches PR review open event and closes menu', async () => {
    const mockDispatch = vi.mocked(dispatchPRReviewOpen)
    const pr = makePR({
      org: 'my-org',
      repository: 'hs-buddy',
      id: 42,
      title: 'My PR',
      author: 'alice',
    })

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
      await result.current.handleAIReview()
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      prUrl: pr.url,
      prTitle: pr.title,
      prNumber: 42,
      repo: 'hs-buddy',
      org: 'my-org',
      author: 'alice',
    })
    expect(result.current.contextMenu).toBeNull()
  })
})

describe('usePRContextMenu – handleRequestCopilotReview', () => {
  const createBookmark = vi.fn()
  const removeBookmark = vi.fn()
  const enqueueRef = { current: vi.fn().mockResolvedValue(undefined) }
  const mockParseOwnerRepo = vi.mocked(parseOwnerRepoFromUrl)

  beforeEach(() => {
    vi.clearAllMocks()
    mockParseOwnerRepo.mockReturnValue({ owner: 'my-org', repo: 'hs-buddy' })
  })

  it('enqueues copilot review request and closes menu', async () => {
    const mockSignal = new AbortController().signal
    enqueueRef.current = vi
      .fn()
      .mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => {
        await fn(mockSignal)
      })

    const mockRequestCopilotReview = vi.fn().mockResolvedValue(undefined)
    const { GitHubClient } = await import('../../api/github')
    vi.mocked(GitHubClient).mockImplementation(function () {
      return { requestCopilotReview: mockRequestCopilotReview }
    } as unknown as typeof GitHubClient)

    const pr = makePR({ org: 'my-org', repository: 'hs-buddy', id: 7 })

    const { result } = renderHook(() =>
      usePRContextMenu({
        accounts: [{ username: 'alice', org: 'my-org' }],
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
      await result.current.handleRequestCopilotReview()
    })

    expect(enqueueRef.current).toHaveBeenCalledWith(expect.any(Function), {
      name: 'copilot-review-hs-buddy-7',
    })
    expect(mockRequestCopilotReview).toHaveBeenCalledWith('my-org', 'hs-buddy', 7)
    expect(result.current.contextMenu).toBeNull()
  })

  it('returns early when parseOwnerRepoFromUrl returns null', async () => {
    mockParseOwnerRepo.mockReturnValue(null)

    const pr = makePR()

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
      await result.current.handleRequestCopilotReview()
    })

    expect(enqueueRef.current).not.toHaveBeenCalled()
  })

  it('catches and logs errors from enqueue', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    enqueueRef.current = vi.fn().mockRejectedValue(new Error('fail'))

    const pr = makePR()

    const { result } = renderHook(() =>
      usePRContextMenu({
        accounts: [{ username: 'alice', org: 'my-org' }],
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
      await result.current.handleRequestCopilotReview()
    })

    expect(errorSpy).toHaveBeenCalledWith('Failed to request Copilot review:', expect.any(Error))
    errorSpy.mockRestore()
  })
})

describe('usePRContextMenu – handleAddressComments', () => {
  const createBookmark = vi.fn()
  const removeBookmark = vi.fn()
  const enqueueRef = { current: vi.fn() }
  const mockBuildPrompt = vi.mocked(buildAddressCommentsPrompt)

  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPrompt.mockReturnValue('generated-prompt')
  })

  it('dispatches assistant:send-prompt event and closes menu', async () => {
    const pr = makePR({ org: 'my-org', repository: 'hs-buddy', id: 5, source: 'GitHub' })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { result } = renderHook(() =>
      usePRContextMenu({
        accounts: [],
        bookmarks: [],
        bookmarkedRepoKeys: new Set(),
        recentlyMergedDays: 14,
        premiumModel: 'claude-opus-4.6',
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

    act(() => {
      result.current.handleAddressComments()
    })

    expect(mockBuildPrompt).toHaveBeenCalledWith({
      prId: 5,
      org: 'my-org',
      repository: 'hs-buddy',
      url: pr.url,
    })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant:send-prompt',
      })
    )
    expect(result.current.contextMenu).toBeNull()
    dispatchSpy.mockRestore()
  })

  it('falls back to pr.source when pr.org is falsy', () => {
    const pr = makePR({ org: '', source: 'FallbackSource', repository: 'hs-buddy', id: 9 })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

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

    act(() => {
      result.current.handleAddressComments()
    })

    expect(mockBuildPrompt).toHaveBeenCalledWith(expect.objectContaining({ org: 'FallbackSource' }))
    dispatchSpy.mockRestore()
  })
})

describe('usePRContextMenu – handleCopyLink', () => {
  const createBookmark = vi.fn()
  const removeBookmark = vi.fn()
  const enqueueRef = { current: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies PR url to clipboard and closes menu', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    })

    const pr = makePR({ url: 'https://github.com/my-org/hs-buddy/pull/99' })

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
      await result.current.handleCopyLink()
    })

    expect(mockWriteText).toHaveBeenCalledWith('https://github.com/my-org/hs-buddy/pull/99')
    expect(result.current.contextMenu).toBeNull()
  })

  it('handles clipboard error gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    })

    const pr = makePR()

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
      await result.current.handleCopyLink()
    })

    expect(errorSpy).toHaveBeenCalledWith('Failed to copy PR link:', expect.any(Error))
    expect(result.current.contextMenu).toBeNull()
    errorSpy.mockRestore()
  })

  it('handles missing clipboard API gracefully', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const pr = makePR()

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
      await result.current.handleCopyLink()
    })

    // No crash, menu still closes
    expect(result.current.contextMenu).toBeNull()
  })
})

describe('usePRContextMenu – closeContextMenu', () => {
  const createBookmark = vi.fn()
  const removeBookmark = vi.fn()
  const enqueueRef = { current: vi.fn() }

  it('clears context menu state', () => {
    const pr = makePR()

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

    expect(result.current.contextMenu).not.toBeNull()

    act(() => {
      result.current.closeContextMenu()
    })

    expect(result.current.contextMenu).toBeNull()
  })
})
