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
})
