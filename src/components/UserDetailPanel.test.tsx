import { describe, expect, it, vi, beforeEach } from 'vitest'

/* ── module mocks (dataCache must be mocked before importing the component) ── */
const { dataCacheStore } = vi.hoisted(() => {
  const store: Record<string, { data: unknown; fetchedAt: number }> = {}
  return { dataCacheStore: store }
})

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: (key: string) => dataCacheStore[key] ?? null,
    set: (key: string, data: unknown, fetchedAt: number = Date.now()) => {
      dataCacheStore[key] = { data, fetchedAt }
    },
    delete: (key: string) => {
      delete dataCacheStore[key]
    },
  },
}))

import type { UserActivitySummary } from '../api/github'
import {
  activityReducer,
  createInitialActivityState,
  type ActivityState,
} from './userDetailReducer'

/* ── helpers ──────────────────────────────────────────────────────── */
function makeActivity(overrides: Partial<UserActivitySummary> = {}): UserActivitySummary {
  return {
    name: null,
    bio: null,
    company: null,
    location: null,
    statusMessage: null,
    statusEmoji: null,
    createdAt: null,
    orgRole: 'member',
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
    ...overrides,
  }
}

/* ── activityReducer tests ─────────────────────────────────────── */
describe('activityReducer', () => {
  const aliceActivity = makeActivity({ name: 'Alice Smith', openPRCount: 7, mergedPRCount: 12, bio: 'Full-stack engineer', location: 'NYC' })

  describe('FETCH_START clears stale activity data', () => {
    it('resets activity to null so old user data is not displayed', () => {
      // State after user A's data was loaded
      const stateWithAlice: ActivityState = {
        activity: aliceActivity,
        phase: 'ready',
        error: null,
      }

      // User switches → FETCH_START dispatched for new user
      const nextState = activityReducer(stateWithAlice, { type: 'FETCH_START' })

      // THE BUG: without the fix, activity still contains Alice's data
      // while memberLogin has changed to "bob" → shows "Alice Smith (bob)"
      expect(nextState.activity).toBeNull()
      expect(nextState.phase).toBe('loading')
      expect(nextState.error).toBeNull()
    })

    it('transitions from idle to loading with null activity', () => {
      const idleState: ActivityState = {
        activity: null,
        phase: 'idle',
        error: null,
      }

      const nextState = activityReducer(idleState, { type: 'FETCH_START' })

      expect(nextState.activity).toBeNull()
      expect(nextState.phase).toBe('loading')
    })

    it('clears error state when starting a new fetch', () => {
      const errorState: ActivityState = {
        activity: null,
        phase: 'error',
        error: 'Network failure',
      }

      const nextState = activityReducer(errorState, { type: 'FETCH_START' })

      expect(nextState.error).toBeNull()
      expect(nextState.phase).toBe('loading')
    })
  })

  describe('FETCH_SUCCESS sets new activity data', () => {
    it('replaces activity with the new payload', () => {
      const loadingState: ActivityState = {
        activity: null,
        phase: 'loading',
        error: null,
      }

      const bobActivity = makeActivity({ name: 'Bob Jones', openPRCount: 3 })
      const nextState = activityReducer(loadingState, {
        type: 'FETCH_SUCCESS',
        payload: bobActivity,
      })

      expect(nextState.activity).toBe(bobActivity)
      expect(nextState.phase).toBe('ready')
    })
  })

  describe('FETCH_ERROR preserves null activity', () => {
    it('sets error and keeps activity null when loading fails', () => {
      const loadingState: ActivityState = {
        activity: null,
        phase: 'loading',
        error: null,
      }

      const nextState = activityReducer(loadingState, {
        type: 'FETCH_ERROR',
        payload: 'Not found',
      })

      expect(nextState.activity).toBeNull()
      expect(nextState.phase).toBe('error')
      expect(nextState.error).toBe('Not found')
    })
  })

  describe('RESET_FROM_CACHE sets activity immediately', () => {
    it('skips loading phase when cache is warm', () => {
      const idleState: ActivityState = {
        activity: null,
        phase: 'idle',
        error: null,
      }

      const nextState = activityReducer(idleState, {
        type: 'RESET_FROM_CACHE',
        payload: aliceActivity,
      })

      expect(nextState.activity).toBe(aliceActivity)
      expect(nextState.phase).toBe('ready')
    })
  })
})

/* ── createInitialActivityState tests ──────────────────────────── */
describe('createInitialActivityState', () => {
  beforeEach(() => {
    for (const k of Object.keys(dataCacheStore)) delete dataCacheStore[k]
  })

  it('returns idle state when cache is empty', () => {
    const state = createInitialActivityState('user-activity:v3:org/unknown')

    expect(state.activity).toBeNull()
    expect(state.phase).toBe('idle')
    expect(state.error).toBeNull()
  })

  it('returns ready state with cached data when cache has data', () => {
    const cached = makeActivity({ name: 'Cached User' })
    dataCacheStore['user-activity:v3:org/cached'] = {
      data: cached,
      fetchedAt: Date.now(),
    }

    const state = createInitialActivityState('user-activity:v3:org/cached')

    expect(state.activity).toBe(cached)
    expect(state.phase).toBe('ready')
  })
})

/* ── User-switching simulation (reducer-level) ─────────────────── */
describe('User switching scenario (reducer-level)', () => {
  it('full Alice → Bob switch: no stale name visible during loading', () => {
    // 1. Start idle
    let state: ActivityState = { activity: null, phase: 'idle', error: null }

    // 2. Begin fetching Alice
    state = activityReducer(state, { type: 'FETCH_START' })
    expect(state.activity).toBeNull()
    expect(state.phase).toBe('loading')

    // 3. Alice data arrives
    const alice = makeActivity({ name: 'Alice Smith', openPRCount: 7 })
    state = activityReducer(state, { type: 'FETCH_SUCCESS', payload: alice })
    expect(state.activity?.name).toBe('Alice Smith')
    expect(state.phase).toBe('ready')

    // 4. User clicks Bob → FETCH_START for Bob
    state = activityReducer(state, { type: 'FETCH_START' })

    // CRITICAL: Alice's data must be gone
    expect(state.activity).toBeNull()
    expect(state.phase).toBe('loading')

    // Simulated hero render: should show "bob", not "Alice Smith (bob)"
    const memberLogin = 'bob'
    const displayTitle = state.activity?.name
      ? `${state.activity.name} (${memberLogin})`
      : memberLogin
    expect(displayTitle).toBe('bob')

    // 5. Bob data arrives
    const bob = makeActivity({ name: 'Bob Jones', openPRCount: 3 })
    state = activityReducer(state, { type: 'FETCH_SUCCESS', payload: bob })
    expect(state.activity?.name).toBe('Bob Jones')

    const finalTitle = state.activity?.name
      ? `${state.activity.name} (${memberLogin})`
      : memberLogin
    expect(finalTitle).toBe('Bob Jones (bob)')
  })

  it('switching users clears bio/location/company during loading', () => {
    const alice = makeActivity({
      name: 'Alice',
      bio: 'Full-stack engineer',
      location: 'NYC',
      company: 'Acme Corp',
    })

    let state: ActivityState = { activity: alice, phase: 'ready', error: null }

    // Switch to Bob
    state = activityReducer(state, { type: 'FETCH_START' })

    expect(state.activity).toBeNull()
    // These are gone because activity is null:
    expect(state.activity?.bio).toBeUndefined()
    expect(state.activity?.location).toBeUndefined()
    expect(state.activity?.company).toBeUndefined()
  })

  it('switching users clears stale metric counts', () => {
    const alice = makeActivity({ openPRCount: 7, mergedPRCount: 12 })

    let state: ActivityState = { activity: alice, phase: 'ready', error: null }

    state = activityReducer(state, { type: 'FETCH_START' })

    expect(state.activity?.openPRCount).toBeUndefined()
    expect(state.activity?.mergedPRCount).toBeUndefined()
  })
})
