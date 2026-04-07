import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNewPRIndicator } from './useNewPRIndicator'
import { dataCache } from '../services/dataCache'
import type { PullRequest } from '../types/pullRequest'

function makePR(id: number, repo = 'repo'): PullRequest {
  return {
    source: 'GitHub',
    repository: repo,
    id,
    title: `PR #${id}`,
    author: 'alice',
    url: `https://github.com/org/${repo}/pull/${id}`,
    state: 'open',
    approvalCount: 0,
    assigneeCount: 0,
    iApproved: false,
    created: null,
    date: null,
  }
}

describe('useNewPRIndicator', () => {
  let getSpy: ReturnType<typeof vi.spyOn>
  let setSpy: ReturnType<typeof vi.spyOn>
  let subscribeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    getSpy = vi.spyOn(dataCache, 'get')
    setSpy = vi.spyOn(dataCache, 'set').mockImplementation(() => {})
    subscribeSpy = vi.spyOn(dataCache, 'subscribe').mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns zero new counts on first launch (no seen data)', () => {
    getSpy.mockReturnValue(null)

    const { result } = renderHook(() => useNewPRIndicator())

    expect(result.current.newCounts).toEqual({
      'pr-my-prs': 0,
      'pr-needs-review': 0,
    })
    expect(result.current.totalNewCount).toBe(0)
  })

  it('seeds seen set from current data on first launch', () => {
    const prs = [makePR(1), makePR(2)]
    getSpy.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: prs, fetchedAt: Date.now() }
      if (key === 'needs-review') return { data: [], fetchedAt: Date.now() }
      return null // no seen data
    })

    renderHook(() => useNewPRIndicator())

    expect(setSpy).toHaveBeenCalledWith(
      'seen-prs:my-prs',
      expect.arrayContaining([
        'https://github.com/org/repo/pull/1',
        'https://github.com/org/repo/pull/2',
      ])
    )
  })

  it('reports new PRs when seen set exists but new PRs appeared', () => {
    const seenUrls = ['https://github.com/org/repo/pull/1']
    const currentPrs = [makePR(1), makePR(2), makePR(3)]

    getSpy.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: currentPrs, fetchedAt: Date.now() }
      if (key === 'needs-review') return { data: [], fetchedAt: Date.now() }
      if (key === 'seen-prs:my-prs') return { data: seenUrls, fetchedAt: Date.now() }
      if (key === 'seen-prs:needs-review') return { data: [], fetchedAt: Date.now() }
      return null
    })

    const { result } = renderHook(() => useNewPRIndicator())

    expect(result.current.newCounts['pr-my-prs']).toBe(2)
    expect(result.current.newCounts['pr-needs-review']).toBe(0)
    expect(result.current.totalNewCount).toBe(2)
    expect(result.current.newUrls).toEqual(
      new Set(['https://github.com/org/repo/pull/2', 'https://github.com/org/repo/pull/3'])
    )
  })

  it('markAsSeen clears new count for a view', () => {
    let seenUrls = ['https://github.com/org/repo/pull/1']
    const currentPrs = [makePR(1), makePR(2)]

    getSpy.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: currentPrs, fetchedAt: Date.now() }
      if (key === 'needs-review') return { data: [], fetchedAt: Date.now() }
      if (key === 'seen-prs:my-prs') return { data: seenUrls, fetchedAt: Date.now() }
      if (key === 'seen-prs:needs-review') return { data: [], fetchedAt: Date.now() }
      return null
    })

    setSpy.mockImplementation((key: string, data: unknown) => {
      if (key === 'seen-prs:my-prs') seenUrls = data as string[]
    })

    const { result } = renderHook(() => useNewPRIndicator())
    expect(result.current.newCounts['pr-my-prs']).toBe(1)

    act(() => {
      result.current.markAsSeen('pr-my-prs')
    })

    expect(setSpy).toHaveBeenCalledWith(
      'seen-prs:my-prs',
      expect.arrayContaining([
        'https://github.com/org/repo/pull/1',
        'https://github.com/org/repo/pull/2',
      ])
    )
    expect(result.current.newCounts['pr-my-prs']).toBe(0)
  })

  it('subscribes to dataCache updates', () => {
    getSpy.mockReturnValue(null)

    renderHook(() => useNewPRIndicator())

    expect(subscribeSpy).toHaveBeenCalled()
  })

  it('ignores untracked modes (markAsSeen does nothing for recently-merged)', () => {
    getSpy.mockReturnValue(null)

    const { result } = renderHook(() => useNewPRIndicator())
    const setCallCount = setSpy.mock.calls.length

    act(() => {
      result.current.markAsSeen('pr-recently-merged')
    })

    expect(setSpy.mock.calls.length).toBe(setCallCount)
  })

  it('seeds needs-review on first data arrival when data was absent at mount', () => {
    let needsReviewData: PullRequest[] = []
    let needsReviewSeen: string[] | null = null
    let subscriberCb: ((key: string) => void) | null = null

    subscribeSpy.mockImplementation((cb: (key: string) => void) => {
      subscriberCb = cb
      return () => {}
    })

    getSpy.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [makePR(1)], fetchedAt: Date.now() }
      if (key === 'needs-review') {
        return needsReviewData.length > 0 ? { data: needsReviewData, fetchedAt: Date.now() } : null
      }
      if (key === 'seen-prs:my-prs')
        return { data: ['https://github.com/org/repo/pull/1'], fetchedAt: Date.now() }
      if (key === 'seen-prs:needs-review') {
        return needsReviewSeen ? { data: needsReviewSeen, fetchedAt: Date.now() } : null
      }
      return null
    })

    setSpy.mockImplementation((key: string, data: unknown) => {
      if (key === 'seen-prs:needs-review') {
        needsReviewSeen = data as string[]
      }
    })

    const { result } = renderHook(() => useNewPRIndicator())
    expect(result.current.newCounts['pr-needs-review']).toBe(0)

    // Simulate needs-review data arriving for the first time
    needsReviewData = [makePR(10, 'other'), makePR(11, 'other')]
    act(() => {
      subscriberCb?.('needs-review')
    })

    // The late-seed should have stored the initial set and returned 0 new
    expect(setSpy).toHaveBeenCalledWith(
      'seen-prs:needs-review',
      expect.arrayContaining([
        'https://github.com/org/other/pull/10',
        'https://github.com/org/other/pull/11',
      ])
    )
    expect(result.current.newCounts['pr-needs-review']).toBe(0)
  })

  it('markAsSeen before data loads stores pending intent, applied on data arrival', () => {
    let needsReviewData: PullRequest[] | null = null
    let needsReviewSeen: string[] | null = null
    let subscriberCb: ((key: string) => void) | null = null

    subscribeSpy.mockImplementation((cb: (key: string) => void) => {
      subscriberCb = cb
      return () => {}
    })

    getSpy.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [makePR(1)], fetchedAt: Date.now() }
      if (key === 'needs-review') {
        return needsReviewData !== null ? { data: needsReviewData, fetchedAt: Date.now() } : null
      }
      if (key === 'seen-prs:my-prs')
        return { data: ['https://github.com/org/repo/pull/1'], fetchedAt: Date.now() }
      if (key === 'seen-prs:needs-review') {
        return needsReviewSeen ? { data: needsReviewSeen, fetchedAt: Date.now() } : null
      }
      return null
    })

    setSpy.mockImplementation((key: string, data: unknown) => {
      if (key === 'seen-prs:needs-review') {
        needsReviewSeen = data as string[]
      }
    })

    const { result } = renderHook(() => useNewPRIndicator())
    const setCallsBefore = setSpy.mock.calls.length

    // User clicks Needs Review before data has arrived
    act(() => {
      result.current.markAsSeen('pr-needs-review')
    })

    // Should NOT have stored a seen set yet
    const seenCallsBefore = setSpy.mock.calls
      .slice(setCallsBefore)
      .filter(([key]: [string]) => key === 'seen-prs:needs-review')
    expect(seenCallsBefore).toHaveLength(0)

    // Now data arrives with 2 PRs — pending intent should apply
    needsReviewData = [makePR(10, 'other'), makePR(11, 'other')]
    act(() => {
      subscriberCb?.('needs-review')
    })

    // The pending mark should have stored the current set as seen
    expect(needsReviewSeen).toEqual(
      expect.arrayContaining([
        'https://github.com/org/other/pull/10',
        'https://github.com/org/other/pull/11',
      ])
    )
    // No new PRs since the user was already viewing
    expect(result.current.newCounts['pr-needs-review']).toBe(0)
  })

  it('seeds empty seen-set when first fetch returns no PRs, then shows new PRs later', () => {
    let needsReviewData: PullRequest[] = []
    let needsReviewSeen: string[] | null = null
    let subscriberCb: ((key: string) => void) | null = null

    subscribeSpy.mockImplementation((cb: (key: string) => void) => {
      subscriberCb = cb
      return () => {}
    })

    getSpy.mockImplementation((key: string) => {
      if (key === 'my-prs') return { data: [makePR(1)], fetchedAt: Date.now() }
      // needs-review starts loaded but empty (not null — cache entry exists)
      if (key === 'needs-review') {
        return { data: needsReviewData, fetchedAt: Date.now() }
      }
      if (key === 'seen-prs:my-prs')
        return { data: ['https://github.com/org/repo/pull/1'], fetchedAt: Date.now() }
      if (key === 'seen-prs:needs-review') {
        return needsReviewSeen ? { data: needsReviewSeen, fetchedAt: Date.now() } : null
      }
      return null
    })

    setSpy.mockImplementation((key: string, data: unknown) => {
      if (key === 'seen-prs:needs-review') {
        needsReviewSeen = data as string[]
      }
    })

    const { result } = renderHook(() => useNewPRIndicator())

    // Mount-time seed should have written an empty seen-set (data loaded but [])
    expect(setSpy).toHaveBeenCalledWith('seen-prs:needs-review', [])
    expect(result.current.newCounts['pr-needs-review']).toBe(0)

    // Later a PR appears in needs-review
    needsReviewData = [makePR(10, 'other')]
    act(() => {
      subscriberCb?.('needs-review')
    })

    // The new PR should show as "new" because the empty seen-set was stored
    expect(result.current.newCounts['pr-needs-review']).toBe(1)
  })
})
