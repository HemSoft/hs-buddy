import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activityReducer,
  createInitialActivityState,
  type ActivityState,
} from './userDetailReducer'
import type { UserActivitySummary } from '../api/github'

vi.mock('../services/dataCache', () => ({
  dataCache: { get: vi.fn() },
}))

import { dataCache } from '../services/dataCache'

const mockActivity = {
  name: 'Test User',
  bio: null,
  company: null,
  location: null,
  statusMessage: null,
  statusEmoji: null,
  createdAt: null,
  orgRole: null,
  teams: [],
  recentPRsAuthored: [],
  recentPRsReviewed: [],
  recentEvents: [],
  openPRCount: 0,
  mergedPRCount: 0,
  activeRepos: [],
  commitsToday: 0,
  totalContributions: null,
  contributionWeeks: null,
  contributionSource: 'graphql',
} satisfies UserActivitySummary

const idleState: ActivityState = {
  activity: null,
  phase: 'idle',
  error: null,
}

describe('activityReducer', () => {
  it('handles RESET_FROM_CACHE action', () => {
    const result = activityReducer(idleState, {
      type: 'RESET_FROM_CACHE',
      payload: mockActivity,
    })

    expect(result).toEqual({
      activity: mockActivity,
      phase: 'ready',
      error: null,
    })
  })

  it('handles FETCH_START action', () => {
    const result = activityReducer(idleState, { type: 'FETCH_START' })

    expect(result).toEqual({
      activity: null,
      phase: 'loading',
      error: null,
    })
  })

  it('handles FETCH_SUCCESS action', () => {
    const loadingState: ActivityState = {
      activity: null,
      phase: 'loading',
      error: null,
    }

    const result = activityReducer(loadingState, {
      type: 'FETCH_SUCCESS',
      payload: mockActivity,
    })

    expect(result).toEqual({
      activity: mockActivity,
      phase: 'ready',
      error: null,
    })
  })

  it('handles FETCH_ERROR action', () => {
    const loadingState: ActivityState = {
      activity: null,
      phase: 'loading',
      error: null,
    }

    const result = activityReducer(loadingState, {
      type: 'FETCH_ERROR',
      payload: 'Network failure',
    })

    expect(result).toEqual({
      activity: null,
      phase: 'error',
      error: 'Network failure',
    })
  })

  it('preserves existing activity data on FETCH_ERROR', () => {
    const readyState: ActivityState = {
      activity: mockActivity,
      phase: 'ready',
      error: null,
    }

    const result = activityReducer(readyState, {
      type: 'FETCH_ERROR',
      payload: 'Refresh failed',
    })

    expect(result.activity).toBe(mockActivity)
    expect(result.phase).toBe('error')
    expect(result.error).toBe('Refresh failed')
  })

  it('clears previous activity and error on FETCH_START', () => {
    const errorState: ActivityState = {
      activity: mockActivity,
      phase: 'error',
      error: 'Previous error',
    }

    const result = activityReducer(errorState, { type: 'FETCH_START' })

    expect(result).toEqual({
      activity: null,
      phase: 'loading',
      error: null,
    })
  })

  it('returns same state for unknown action', () => {
    const result = activityReducer(idleState, { type: 'UNKNOWN' } as never)
    expect(result).toBe(idleState)
  })
})

describe('createInitialActivityState', () => {
  beforeEach(() => {
    vi.mocked(dataCache.get).mockReset()
  })

  it('returns ready state when cache has data', () => {
    vi.mocked(dataCache.get).mockReturnValue({
      data: mockActivity,
      fetchedAt: Date.now(),
    })

    const result = createInitialActivityState('user:testuser')

    expect(dataCache.get).toHaveBeenCalledWith('user:testuser')
    expect(result).toEqual({
      activity: mockActivity,
      phase: 'ready',
      error: null,
    })
  })

  it('returns idle state when cache returns null', () => {
    vi.mocked(dataCache.get).mockReturnValue(null)

    const result = createInitialActivityState('user:missing')

    expect(result).toEqual({
      activity: null,
      phase: 'idle',
      error: null,
    })
  })

  it('returns idle state when cached entry has falsy data', () => {
    vi.mocked(dataCache.get).mockReturnValue({
      data: null as unknown as UserActivitySummary,
      fetchedAt: Date.now(),
    })

    const result = createInitialActivityState('user:empty')

    expect(result).toEqual({
      activity: null,
      phase: 'idle',
      error: null,
    })
  })
})
