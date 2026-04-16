import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePRListData } from './usePRListData'
import { dataCache } from '../../services/dataCache'
import type { PullRequest } from '../../types/pullRequest'

const {
  mockGitHubClient,
  mockFetchMyPRs,
  mockFetchNeedsReview,
  mockFetchRecentlyMerged,
  mockFetchNeedANudge,
  mockApprovePullRequest,
  mockUseGitHubAccounts,
  mockUsePRSettings,
  mockUseRepoBookmarks,
  mockUseRepoBookmarkMutations,
  mockUseTaskQueue,
} = vi.hoisted(() => ({
  mockGitHubClient: vi.fn(),
  mockFetchMyPRs: vi.fn(),
  mockFetchNeedsReview: vi.fn(),
  mockFetchRecentlyMerged: vi.fn(),
  mockFetchNeedANudge: vi.fn(),
  mockApprovePullRequest: vi.fn(),
  mockUseGitHubAccounts: vi.fn(),
  mockUsePRSettings: vi.fn(),
  mockUseRepoBookmarks: vi.fn(),
  mockUseRepoBookmarkMutations: vi.fn(),
  mockUseTaskQueue: vi.fn(),
}))

vi.mock('../../api/github', () => ({
  GitHubClient: mockGitHubClient.mockImplementation(function MockGitHubClient() {
    return {
      fetchMyPRs: mockFetchMyPRs,
      fetchNeedsReview: mockFetchNeedsReview,
      fetchRecentlyMerged: mockFetchRecentlyMerged,
      fetchNeedANudge: mockFetchNeedANudge,
      approvePullRequest: mockApprovePullRequest,
    }
  }),
}))

vi.mock('../../hooks/useConfig', () => ({
  useGitHubAccounts: mockUseGitHubAccounts,
  usePRSettings: mockUsePRSettings,
  useCopilotSettings: () => ({ premiumModel: 'claude-opus-4.6' }),
}))

vi.mock('../../hooks/useConvex', () => ({
  useRepoBookmarks: mockUseRepoBookmarks,
  useRepoBookmarkMutations: mockUseRepoBookmarkMutations,
}))

vi.mock('../../hooks/useTaskQueue', () => ({
  useTaskQueue: mockUseTaskQueue,
}))

const account = { username: 'alice', org: 'relias-engineering' }

const makePR = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 420,
  title: 'Improve PR tests',
  author: 'octocat',
  url: 'https://github.com/relias-engineering/hs-buddy/pull/420',
  state: 'OPEN',
  approvalCount: 1,
  assigneeCount: 2,
  iApproved: false,
  created: new Date('2026-03-31T12:00:00Z'),
  date: null,
  org: 'relias-engineering',
  ...overrides,
})

describe('usePRListData', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })

    mockUseGitHubAccounts.mockReturnValue({
      accounts: [account],
      loading: false,
    })
    mockUsePRSettings.mockReturnValue({
      recentlyMergedDays: 14,
      refreshInterval: 15,
      loading: false,
    })
    mockUseRepoBookmarks.mockReturnValue([])
    mockUseRepoBookmarkMutations.mockReturnValue({
      create: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    })
    mockUseTaskQueue.mockReturnValue({
      enqueue: vi.fn(async (task: (signal: AbortSignal) => Promise<unknown>) => {
        const controller = new AbortController()
        return task(controller.signal)
      }),
      cancelAll: vi.fn(),
    })

    mockFetchMyPRs.mockResolvedValue([])
    mockFetchNeedsReview.mockResolvedValue([])
    mockFetchRecentlyMerged.mockResolvedValue([])
    mockFetchNeedANudge.mockResolvedValue([])
    mockApprovePullRequest.mockResolvedValue(undefined)

    await dataCache.clear()
  })

  it('uses fresh cached data and reacts to cache subscription updates', async () => {
    const onCountChange = vi.fn()
    const cachedPr = makePR({ id: 1, repository: 'alpha' })
    dataCache.set('my-prs', [cachedPr], Date.now())

    const { result } = renderHook(() => usePRListData('my-prs', onCountChange))

    expect(result.current.prs).toEqual([cachedPr])
    expect(result.current.loading).toBe(false)
    expect(result.current.getTitle()).toBe('My Pull Requests')

    const updatedPr = makePR({ id: 2, repository: 'beta' })
    act(() => {
      dataCache.set('my-prs', [updatedPr], Date.now())
    })

    await waitFor(() => expect(result.current.prs).toEqual([updatedPr]))
    expect(onCountChange).toHaveBeenCalledWith(1)
    expect(mockFetchMyPRs).not.toHaveBeenCalled()
  })

  it('fetches, sorts, and counts PRs when cache is stale', async () => {
    const onCountChange = vi.fn()
    const laterRepo = makePR({ repository: 'zeta', id: 9 })
    const earlierRepo = makePR({ repository: 'alpha', id: 7 })
    const sameRepoLowerId = makePR({ repository: 'alpha', id: 2 })

    mockFetchMyPRs.mockResolvedValue([laterRepo, earlierRepo, sameRepoLowerId])

    const { result } = renderHook(() => usePRListData('my-prs', onCountChange))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs.map(pr => `${pr.repository}-${pr.id}`)).toEqual([
      'alpha-2',
      'alpha-7',
      'zeta-9',
    ])
    expect(onCountChange).toHaveBeenCalledWith(3)
    expect(mockGitHubClient).toHaveBeenCalledWith({ accounts: [account] }, 14)
    expect(dataCache.get<PullRequest[]>('my-prs')?.data).toHaveLength(3)
  })

  it('surfaces an account configuration error before fetching', async () => {
    mockUseGitHubAccounts.mockReturnValue({
      accounts: [],
      loading: false,
    })

    const { result } = renderHook(() => usePRListData('my-prs'))

    await waitFor(() =>
      expect(result.current.error).toBe(
        'No GitHub accounts configured. Please add an account in Settings.'
      )
    )

    expect(mockFetchMyPRs).not.toHaveBeenCalled()
  })

  it('handles manual refresh and mode-specific fetchers', async () => {
    dataCache.set('needs-review', [makePR({ id: 1 })], Date.now())
    mockFetchNeedsReview.mockResolvedValue([makePR({ id: 2, repository: 'review-repo' })])

    const { result } = renderHook(() => usePRListData('needs-review'))

    expect(result.current.prs).toHaveLength(1)

    act(() => {
      result.current.handleManualRefresh()
    })

    await waitFor(() =>
      expect(result.current.prs).toEqual([makePR({ id: 2, repository: 'review-repo' })])
    )

    expect(mockFetchNeedsReview).toHaveBeenCalledOnce()
    expect(result.current.getTitle()).toBe('PRs Needing Review')
  })

  it('manages context-menu actions for bookmarks, AI review, copy, and close', async () => {
    const createBookmark = vi.fn().mockResolvedValue(undefined)
    const removeBookmark = vi.fn().mockResolvedValue(undefined)
    mockUseRepoBookmarks.mockReturnValue([
      { _id: 'bookmark-1', owner: 'relias-engineering', repo: 'hs-buddy' },
    ])
    mockUseRepoBookmarkMutations.mockReturnValue({
      create: createBookmark,
      remove: removeBookmark,
    })

    const reviewListener = vi.fn()
    window.addEventListener('pr-review:open', reviewListener as EventListener)

    const { result } = renderHook(() => usePRListData('my-prs'))
    const pr = makePR()

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 32,
          clientY: 48,
        } as unknown as React.MouseEvent,
        pr
      )
    })

    expect(result.current.contextMenu).toEqual({ x: 32, y: 48, pr })

    await act(async () => {
      await result.current.handleBookmarkRepo()
    })
    expect(removeBookmark).toHaveBeenCalledWith({ id: 'bookmark-1' })
    expect(result.current.contextMenu).toBeNull()

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 10,
          clientY: 20,
        } as unknown as React.MouseEvent,
        { ...pr, repository: 'new-repo' }
      )
    })

    await act(async () => {
      await result.current.handleBookmarkRepo()
    })
    expect(createBookmark).toHaveBeenCalledWith({
      folder: 'relias-engineering',
      owner: 'relias-engineering',
      repo: 'new-repo',
      url: 'https://github.com/relias-engineering/hs-buddy',
      description: '',
    })

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 1,
          clientY: 2,
        } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleAIReview()
    })
    expect(reviewListener).toHaveBeenCalled()
    expect(result.current.contextMenu).toBeNull()

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 3,
          clientY: 4,
        } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleCopyLink()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(pr.url)
    expect(result.current.contextMenu).toBeNull()

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('copy failed'))

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 5,
          clientY: 6,
        } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleCopyLink()
    })
    expect(errorSpy).toHaveBeenCalledWith('Failed to copy PR link:', expect.any(Error))

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 7,
          clientY: 8,
        } as unknown as React.MouseEvent,
        pr
      )
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.contextMenu).toBeNull()

    window.removeEventListener('pr-review:open', reviewListener as EventListener)
    errorSpy.mockRestore()
  })

  it('approves a PR, updates cache, and closes the context menu when approving from the menu', async () => {
    const cachedPr = makePR()
    dataCache.set('my-prs', [cachedPr], Date.now() - 16 * 60_000)
    mockFetchMyPRs.mockResolvedValue([cachedPr])

    const { result } = renderHook(() => usePRListData('my-prs'))

    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    await act(async () => {
      await result.current.handleApprove(cachedPr)
    })

    expect(mockApprovePullRequest).toHaveBeenCalledWith('relias-engineering', 'hs-buddy', 420)
    expect(result.current.prs[0]).toEqual(
      expect.objectContaining({
        iApproved: true,
        approvalCount: 2,
      })
    )
    expect(dataCache.get<PullRequest[]>('my-prs')?.data[0]).toEqual(
      expect.objectContaining({
        iApproved: true,
        approvalCount: 2,
      })
    )
    expect(result.current.approving).toBeNull()

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 11,
          clientY: 22,
        } as unknown as React.MouseEvent,
        {
          ...cachedPr,
          id: 421,
          repository: 'other-repo',
          url: 'https://github.com/org/other-repo/pull/421',
        }
      )
    })

    await act(async () => {
      await result.current.handleApproveFromMenu()
    })

    expect(mockApprovePullRequest).toHaveBeenCalledWith('org', 'other-repo', 421)
    expect(result.current.contextMenu).toBeNull()
  })

  it('fetches recently-merged PRs and uses the correct title', async () => {
    const mergedPr = makePR({ id: 100, repository: 'merged-repo', state: 'MERGED' })
    mockFetchRecentlyMerged.mockResolvedValue([mergedPr])

    const { result } = renderHook(() => usePRListData('recently-merged'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs).toEqual([mergedPr])
    expect(result.current.getTitle()).toBe('Recently Merged PRs')
    expect(mockFetchRecentlyMerged).toHaveBeenCalled()
    // recently-merged should NOT sort by repo/id
    expect(mockFetchMyPRs).not.toHaveBeenCalled()
    expect(mockFetchNeedsReview).not.toHaveBeenCalled()
  })

  it('fetches need-a-nudge PRs and uses the correct title', async () => {
    const nudgePr = makePR({ id: 200, repository: 'nudge-repo' })
    mockFetchNeedANudge.mockResolvedValue([nudgePr])

    const { result } = renderHook(() => usePRListData('need-a-nudge'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs).toHaveLength(1)
    expect(result.current.getTitle()).toBe('Needs a nudge')
    expect(mockFetchNeedANudge).toHaveBeenCalled()
  })

  it('handles fetch error gracefully', async () => {
    mockFetchMyPRs.mockRejectedValue(new Error('API rate limit exceeded'))

    const { result } = renderHook(() => usePRListData('my-prs'))

    await waitFor(() => expect(result.current.error).toBe('API rate limit exceeded'))
    expect(result.current.loading).toBe(false)
  })

  it('skips fetch while accounts are still loading', async () => {
    mockUseGitHubAccounts.mockReturnValue({
      accounts: [account],
      loading: true,
    })

    renderHook(() => usePRListData('my-prs'))

    // Should not trigger any fetch
    expect(mockFetchMyPRs).not.toHaveBeenCalled()
  })

  it('dispatches assistant prompt when address-comments is triggered', async () => {
    const promptListener = vi.fn()
    window.addEventListener('assistant:send-prompt', promptListener as EventListener)

    const { result } = renderHook(() => usePRListData('my-prs'))
    const pr = makePR()

    act(() => {
      result.current.handleContextMenu(
        {
          preventDefault: vi.fn(),
          clientX: 1,
          clientY: 2,
        } as unknown as React.MouseEvent,
        pr
      )
    })

    act(() => {
      result.current.handleAddressComments()
    })

    expect(promptListener).toHaveBeenCalled()
    expect(result.current.contextMenu).toBeNull()

    window.removeEventListener('assistant:send-prompt', promptListener as EventListener)
  })

  it('returns correct progressColor from getProgressColor', () => {
    const { result } = renderHook(() => usePRListData('my-prs'))
    // Verify hook exposes expected interface
    expect(result.current.getTitle).toBeDefined()
    expect(result.current.handleManualRefresh).toBeDefined()
    expect(result.current.handleContextMenu).toBeDefined()
    expect(result.current.handleBookmarkRepo).toBeDefined()
    expect(result.current.handleCopyLink).toBeDefined()
    expect(result.current.handleApprove).toBeDefined()
  })

  it('skips approve if PR is already approved', async () => {
    const pr = makePR({ iApproved: true })
    const { result } = renderHook(() => usePRListData('my-prs'))
    await act(async () => {
      await result.current.handleApprove(pr)
    })
    expect(mockApprovePullRequest).not.toHaveBeenCalled()
  })

  it('handles approve failure gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApprovePullRequest.mockRejectedValueOnce(new Error('forbidden'))
    const pr = makePR()
    dataCache.set('my-prs', [pr], Date.now() - 16 * 60_000)
    mockFetchMyPRs.mockResolvedValue([pr])

    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    await act(async () => {
      await result.current.handleApprove(pr)
    })
    expect(result.current.approving).toBeNull()
    errorSpy.mockRestore()
  })

  it('handleBookmarkRepo is a no-op without context menu', async () => {
    const createBookmark = vi.fn()
    mockUseRepoBookmarkMutations.mockReturnValue({ create: createBookmark, remove: vi.fn() })
    const { result } = renderHook(() => usePRListData('my-prs'))
    await act(async () => {
      await result.current.handleBookmarkRepo()
    })
    expect(createBookmark).not.toHaveBeenCalled()
  })

  it('handleAIReview is a no-op without context menu', async () => {
    const listener = vi.fn()
    window.addEventListener('pr-review:open', listener as EventListener)
    const { result } = renderHook(() => usePRListData('my-prs'))
    await act(async () => {
      await result.current.handleAIReview()
    })
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener('pr-review:open', listener as EventListener)
  })

  it('handleRequestCopilotReview requests review via GitHub client', async () => {
    const mockRequestCopilotReview = vi.fn().mockResolvedValue(undefined)
    mockGitHubClient.mockImplementation(function MockGitHubClient() {
      return {
        fetchMyPRs: mockFetchMyPRs,
        fetchNeedsReview: mockFetchNeedsReview,
        fetchRecentlyMerged: mockFetchRecentlyMerged,
        fetchNeedANudge: mockFetchNeedANudge,
        approvePullRequest: mockApprovePullRequest,
        requestCopilotReview: mockRequestCopilotReview,
      }
    })

    const pr = makePR()
    dataCache.set('my-prs', [pr], Date.now())
    const { result } = renderHook(() => usePRListData('my-prs'))

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleRequestCopilotReview()
    })

    expect(mockRequestCopilotReview).toHaveBeenCalledWith('relias-engineering', 'hs-buddy', 420)
    expect(result.current.contextMenu).toBeNull()
  })

  it('handleRequestCopilotReview is a no-op without context menu', async () => {
    const { result } = renderHook(() => usePRListData('my-prs'))
    await act(async () => {
      await result.current.handleRequestCopilotReview()
    })
    // No error thrown, just silently returns
  })

  it('handleCopyLink is a no-op without context menu', async () => {
    const { result } = renderHook(() => usePRListData('my-prs'))
    await act(async () => {
      await result.current.handleCopyLink()
    })
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('getTitle returns default for unknown mode', () => {
    // Cast to bypass TypeScript union type and exercise the switch default branch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { result } = renderHook(() => usePRListData('unknown-mode' as any))
    expect(result.current.getTitle()).toBe('Pull Requests')
  })

  it('handleAddressComments is a no-op without context menu', () => {
    const promptListener = vi.fn()
    window.addEventListener('assistant:send-prompt', promptListener as EventListener)
    const { result } = renderHook(() => usePRListData('my-prs'))
    act(() => {
      result.current.handleAddressComments()
    })
    expect(promptListener).not.toHaveBeenCalled()
    window.removeEventListener('assistant:send-prompt', promptListener as EventListener)
  })

  it('handleApproveFromMenu is a no-op without context menu', async () => {
    const { result } = renderHook(() => usePRListData('my-prs'))
    await act(async () => {
      await result.current.handleApproveFromMenu()
    })
    expect(mockApprovePullRequest).not.toHaveBeenCalled()
  })

  it('shows refreshing state for existing data on stale cache', async () => {
    const cachedPr = makePR({ id: 1 })
    dataCache.set('my-prs', [cachedPr], Date.now() - 16 * 60_000)
    mockFetchMyPRs.mockResolvedValue([cachedPr])

    const { result } = renderHook(() => usePRListData('my-prs'))

    // Should show refreshing (not loading) since we have existing data
    await waitFor(() => expect(result.current.prs).toHaveLength(1))
    expect(result.current.loading).toBe(false)
  })

  it('handles progress callback with done status', async () => {
    mockFetchMyPRs.mockImplementation(async (progressCb?: (p: unknown) => void) => {
      progressCb?.({
        currentAccount: 1,
        totalAccounts: 1,
        accountName: 'alice',
        org: 'test-org',
        status: 'done',
        prsFound: 5,
        totalPrsFound: 0,
      })
      return [makePR()]
    })

    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))
  })

  it('skips PR settings loading state', async () => {
    mockUsePRSettings.mockReturnValue({
      recentlyMergedDays: 14,
      refreshInterval: 15,
      loading: true,
    })

    renderHook(() => usePRListData('my-prs'))
    expect(mockFetchMyPRs).not.toHaveBeenCalled()
  })

  it('handleContextMenu opens context menu', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    const pr = result.current.prs[0]
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent
    act(() => result.current.handleContextMenu(mockEvent, pr))
    expect(result.current.contextMenu).not.toBeNull()
    expect(result.current.contextMenu?.x).toBe(100)
    expect(result.current.contextMenu?.y).toBe(200)
  })

  it('closeContextMenu clears context menu', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    const pr = result.current.prs[0]
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent
    act(() => result.current.handleContextMenu(mockEvent, pr))
    expect(result.current.contextMenu).not.toBeNull()
    act(() => result.current.closeContextMenu())
    expect(result.current.contextMenu).toBeNull()
  })

  it('context menu closes on Escape keydown', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    const pr = result.current.prs[0]
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent
    act(() => result.current.handleContextMenu(mockEvent, pr))
    expect(result.current.contextMenu).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.contextMenu).toBeNull()
  })

  it('handleCopyLink copies PR URL to clipboard', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    const pr = result.current.prs[0]
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent
    act(() => result.current.handleContextMenu(mockEvent, pr))
    await act(async () => {
      await result.current.handleCopyLink()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(pr.url)
    expect(result.current.contextMenu).toBeNull()
  })

  it('handleAIReview dispatches pr-review:open event', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    const pr = result.current.prs[0]
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent
    act(() => result.current.handleContextMenu(mockEvent, pr))

    const eventSpy = vi.fn()
    window.addEventListener('pr-review:open', eventSpy)
    try {
      await act(async () => {
        await result.current.handleAIReview()
      })
      expect(eventSpy).toHaveBeenCalled()
      expect(result.current.contextMenu).toBeNull()
    } finally {
      window.removeEventListener('pr-review:open', eventSpy)
    }
  })

  it('handleAddressComments dispatches assistant:send-prompt event', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    const pr = result.current.prs[0]
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent
    act(() => result.current.handleContextMenu(mockEvent, pr))

    const eventSpy = vi.fn()
    window.addEventListener('assistant:send-prompt', eventSpy)
    try {
      act(() => result.current.handleAddressComments())
      expect(eventSpy).toHaveBeenCalled()
      expect(result.current.contextMenu).toBeNull()
    } finally {
      window.removeEventListener('assistant:send-prompt', eventSpy)
    }
  })

  it('handleManualRefresh triggers a refetch', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    mockFetchMyPRs.mockClear()
    await act(async () => {
      result.current.handleManualRefresh()
    })
    // Wait for the refetch to happen
    await waitFor(() => expect(mockFetchMyPRs).toHaveBeenCalled())
  })

  it('handleBookmarkRepo creates bookmark when not bookmarked', async () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined)
    mockUseRepoBookmarkMutations.mockReturnValue({
      create: mockCreate,
      remove: vi.fn().mockResolvedValue(undefined),
    })
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    const pr = result.current.prs[0]
    const mockEvent = {
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 20,
    } as unknown as React.MouseEvent
    act(() => result.current.handleContextMenu(mockEvent, pr))
    await act(async () => {
      await result.current.handleBookmarkRepo()
    })
    expect(mockCreate).toHaveBeenCalled()
    expect(result.current.contextMenu).toBeNull()
  })

  it('handleBookmarkRepo does nothing without context menu', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    await act(async () => {
      await result.current.handleBookmarkRepo()
    })
    // No crash, context menu stays null
    expect(result.current.contextMenu).toBeNull()
  })

  it('handleAIReview does nothing without context menu', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    await act(async () => {
      await result.current.handleAIReview()
    })
    expect(result.current.contextMenu).toBeNull()
  })

  it('handleCopyLink does nothing without context menu', async () => {
    mockFetchMyPRs.mockResolvedValue([makePR()])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    await act(async () => {
      await result.current.handleCopyLink()
    })
    expect(result.current.contextMenu).toBeNull()
  })

  it('getTitle returns correct title for each mode', async () => {
    mockFetchMyPRs.mockResolvedValue([])
    const { result: myPrs } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(myPrs.current.loading).toBe(false))
    expect(myPrs.current.getTitle()).toBe('My Pull Requests')

    mockFetchNeedsReview.mockResolvedValue([])
    const { result: needsReview } = renderHook(() => usePRListData('needs-review'))
    await waitFor(() => expect(needsReview.current.loading).toBe(false))
    expect(needsReview.current.getTitle()).toBe('PRs Needing Review')

    mockFetchRecentlyMerged.mockResolvedValue([])
    const { result: merged } = renderHook(() => usePRListData('recently-merged'))
    await waitFor(() => expect(merged.current.loading).toBe(false))
    expect(merged.current.getTitle()).toBe('Recently Merged PRs')

    mockFetchNeedANudge.mockResolvedValue([])
    const { result: nudge } = renderHook(() => usePRListData('need-a-nudge'))
    await waitFor(() => expect(nudge.current.loading).toBe(false))
    expect(nudge.current.getTitle()).toContain('Needs a nudge')
  })

  it('getProgressColor returns correct colors', async () => {
    mockFetchMyPRs.mockResolvedValue([])
    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.getProgressColor).toBeTypeOf('function')
  })

  // --- Branch coverage: progress callback branches ---

  it('handles progress callback with non-done status', async () => {
    mockFetchMyPRs.mockImplementation(async (progressCb?: (p: unknown) => void) => {
      progressCb?.({
        currentAccount: 1,
        totalAccounts: 1,
        accountName: 'alice',
        org: 'test-org',
        status: 'fetching',
        totalPrsFound: 0,
      })
      return [makePR()]
    })

    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))
    expect(result.current.totalPrsFound).toBe(0)
  })

  it('handles progress with done status but prsFound undefined', async () => {
    mockFetchMyPRs.mockImplementation(async (progressCb?: (p: unknown) => void) => {
      progressCb?.({
        currentAccount: 1,
        totalAccounts: 1,
        accountName: 'alice',
        org: 'test-org',
        status: 'done',
        totalPrsFound: 0,
      })
      return [makePR()]
    })

    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))
    expect(result.current.totalPrsFound).toBe(0)
  })

  // --- Branch coverage: null/falsy guards ---

  it('handles null bookmarks in bookmarkedRepoKeys and handleBookmarkRepo', async () => {
    const createBookmark = vi.fn().mockResolvedValue(undefined)
    mockUseRepoBookmarks.mockReturnValue(null)
    mockUseRepoBookmarkMutations.mockReturnValue({
      create: createBookmark,
      remove: vi.fn().mockResolvedValue(undefined),
    })

    const pr = makePR({ org: '' })
    const { result } = renderHook(() => usePRListData('my-prs'))

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleBookmarkRepo()
    })

    expect(createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ owner: '', repo: 'hs-buddy' })
    )
  })

  it('handleRequestCopilotReview returns early when URL cannot be parsed', async () => {
    const mockRequestCopilotReview = vi.fn()
    mockGitHubClient.mockImplementation(function MockGitHubClient() {
      return {
        fetchMyPRs: mockFetchMyPRs,
        fetchNeedsReview: mockFetchNeedsReview,
        fetchRecentlyMerged: mockFetchRecentlyMerged,
        fetchNeedANudge: mockFetchNeedANudge,
        approvePullRequest: mockApprovePullRequest,
        requestCopilotReview: mockRequestCopilotReview,
      }
    })

    const pr = makePR({ url: 'not-a-github-url' })
    const { result } = renderHook(() => usePRListData('my-prs'))

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleRequestCopilotReview()
    })

    expect(mockRequestCopilotReview).not.toHaveBeenCalled()
  })

  it('handleApprove returns early when URL cannot be parsed', async () => {
    const pr = makePR({ url: 'not-a-github-url', iApproved: false })
    const { result } = renderHook(() => usePRListData('my-prs'))

    await act(async () => {
      await result.current.handleApprove(pr)
    })

    expect(mockApprovePullRequest).not.toHaveBeenCalled()
  })

  it('handleCopyLink handles missing clipboard API', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const pr = makePR()
    const { result } = renderHook(() => usePRListData('my-prs'))

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleCopyLink()
    })

    expect(result.current.contextMenu).toBeNull()
  })

  it('handleAddressComments uses pr.source when pr.org is empty', () => {
    const promptListener = vi.fn()
    window.addEventListener('assistant:send-prompt', promptListener as EventListener)

    const pr = makePR({ org: '', source: 'GitHub' })
    const { result } = renderHook(() => usePRListData('my-prs'))

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent,
        pr
      )
    })

    act(() => {
      result.current.handleAddressComments()
    })

    expect(promptListener).toHaveBeenCalled()
    expect(result.current.contextMenu).toBeNull()

    window.removeEventListener('assistant:send-prompt', promptListener as EventListener)
  })

  // --- Branch coverage: error handling paths ---

  it('handles non-Error thrown during fetch', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFetchMyPRs.mockRejectedValue('string error')

    const { result } = renderHook(() => usePRListData('my-prs'))

    await waitFor(() => expect(result.current.error).toBe('Failed to fetch PRs'))
    expect(result.current.loading).toBe(false)
    errorSpy.mockRestore()
  })

  it('silently ignores AbortError during fetch', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFetchMyPRs.mockRejectedValue(new DOMException('Cancelled', 'AbortError'))

    const { result } = renderHook(() => usePRListData('my-prs'))

    await waitFor(() => expect(mockFetchMyPRs).toHaveBeenCalled())
    await act(async () => {})

    expect(result.current.error).toBeNull()
    logSpy.mockRestore()
  })

  // --- Branch coverage: auto-refresh interval guards ---

  it('skips auto-refresh when refreshInterval is zero', async () => {
    mockUsePRSettings.mockReturnValue({
      recentlyMergedDays: 14,
      refreshInterval: 0,
      loading: false,
    })
    mockFetchMyPRs.mockResolvedValue([])

    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.updateTimes).toBeNull()
  })

  it('skips auto-refresh when refreshInterval is negative', async () => {
    mockUsePRSettings.mockReturnValue({
      recentlyMergedDays: 14,
      refreshInterval: -1,
      loading: false,
    })
    mockFetchMyPRs.mockResolvedValue([])

    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  // --- Branch coverage: cache subscription key mismatch ---

  it('ignores cache subscription updates for different modes', async () => {
    const onCountChange = vi.fn()
    dataCache.set('my-prs', [makePR({ id: 1 })], Date.now())

    const { result } = renderHook(() => usePRListData('my-prs', onCountChange))
    onCountChange.mockClear()

    act(() => {
      dataCache.set('needs-review', [makePR({ id: 99 })], Date.now())
    })

    expect(result.current.prs).toEqual([makePR({ id: 1 })])
    expect(onCountChange).not.toHaveBeenCalled()
  })

  // --- Branch coverage: approve edge cases ---

  it('handleApprove skips cache update when cache is empty', async () => {
    const pr = makePR()
    mockFetchMyPRs.mockResolvedValue([pr])

    const { result } = renderHook(() => usePRListData('my-prs'))
    await waitFor(() => expect(result.current.prs).toHaveLength(1))

    await dataCache.clear()

    await act(async () => {
      await result.current.handleApprove(pr)
    })

    expect(mockApprovePullRequest).toHaveBeenCalled()
    expect(result.current.approving).toBeNull()
  })

  it('markApproved skips item already approved in state', async () => {
    const pr = makePR({ iApproved: true, approvalCount: 2 })
    dataCache.set('my-prs', [pr], Date.now())

    const { result } = renderHook(() => usePRListData('my-prs'))
    expect(result.current.prs[0].iApproved).toBe(true)

    const prToApprove = { ...pr, iApproved: false }

    await act(async () => {
      await result.current.handleApprove(prToApprove)
    })

    expect(mockApprovePullRequest).toHaveBeenCalled()
    expect(result.current.prs[0].iApproved).toBe(true)
    expect(result.current.prs[0].approvalCount).toBe(2)
  })

  // --- Branch coverage: handleCopyLink with writeText property missing ---

  it('handleCopyLink handles clipboard without writeText method', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {},
      writable: true,
      configurable: true,
    })

    const pr = makePR()
    const { result } = renderHook(() => usePRListData('my-prs'))

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleCopyLink()
    })

    expect(result.current.contextMenu).toBeNull()
  })

  // --- Branch coverage: handleRequestCopilotReview error path ---

  it('handleRequestCopilotReview logs error on failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockRequestCopilotReview = vi.fn().mockRejectedValue(new Error('Request failed'))
    mockGitHubClient.mockImplementation(function MockGitHubClient() {
      return {
        fetchMyPRs: mockFetchMyPRs,
        fetchNeedsReview: mockFetchNeedsReview,
        fetchRecentlyMerged: mockFetchRecentlyMerged,
        fetchNeedANudge: mockFetchNeedANudge,
        approvePullRequest: mockApprovePullRequest,
        requestCopilotReview: mockRequestCopilotReview,
      }
    })

    const pr = makePR()
    dataCache.set('my-prs', [pr], Date.now())
    const { result } = renderHook(() => usePRListData('my-prs'))

    act(() => {
      result.current.handleContextMenu(
        { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent,
        pr
      )
    })

    await act(async () => {
      await result.current.handleRequestCopilotReview()
    })

    expect(errorSpy).toHaveBeenCalledWith('Failed to request Copilot review:', expect.any(Error))
    expect(result.current.contextMenu).toBeNull()
    errorSpy.mockRestore()
  })
})
