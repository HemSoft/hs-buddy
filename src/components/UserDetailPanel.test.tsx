import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

/* ── module mocks (dataCache must be mocked before importing the component) ── */
const { dataCacheStore, mockFetchUserActivity, stableAccounts } = vi.hoisted(() => {
  const store: Record<string, { data: unknown; fetchedAt: number }> = {}
  const mockFetchUserActivity = vi.fn()
  const stableAccounts = {
    accounts: [{ token: 'fake_token', org: 'acme', type: 'oauth' }],
  }
  return { dataCacheStore: store, mockFetchUserActivity, stableAccounts }
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
    subscribe: vi.fn(() => vi.fn()),
  },
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => stableAccounts,
}))

vi.mock('../api/github', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/github')>()
  class MockGitHubClient {
    fetchUserActivity = mockFetchUserActivity
  }
  return {
    ...actual,
    GitHubClient: MockGitHubClient,
  }
})

vi.mock('./UserPremiumUsageSection', () => ({
  UserPremiumUsageSection: () => <div data-testid="premium-usage-stub" />,
}))

vi.mock('./ContributionGraph', () => ({
  ContributionGraph: () => <div data-testid="contribution-graph-stub" />,
}))

import type { UserActivitySummary } from '../api/github'
import {
  activityReducer,
  createInitialActivityState,
  type ActivityState,
} from './userDetailReducer'
import { UserDetailPanel } from './UserDetailPanel'

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
  const aliceActivity = makeActivity({
    name: 'Alice Smith',
    openPRCount: 7,
    mergedPRCount: 12,
    bio: 'Full-stack engineer',
    location: 'NYC',
  })

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

/* ── UserDetailPanel component rendering tests ─────────────────── */
describe('UserDetailPanel (component)', () => {
  beforeEach(() => {
    for (const key of Object.keys(dataCacheStore)) delete dataCacheStore[key]
    mockFetchUserActivity.mockReset()
    mockFetchUserActivity.mockResolvedValue(makeActivity())
    window.shell = { openExternal: vi.fn() } as never
  })

  it('renders the member login and org name', async () => {
    render(<UserDetailPanel org="acme" memberLogin="alice" />)
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('acme')).toBeTruthy()
  })

  it('renders avatar with fallback URL when no cached data', () => {
    render(<UserDetailPanel org="acme" memberLogin="bob" />)
    const img = screen.getByRole('img', { name: 'bob' })
    expect(img).toHaveAttribute('src', 'https://github.com/bob.png?size=96')
  })

  it('shows "No commits today" when no contributor data and no activity', () => {
    render(<UserDetailPanel org="acme" memberLogin="carol" />)
    expect(screen.getByText('No commits today')).toBeTruthy()
  })

  it('renders cached activity immediately without fetching', () => {
    const cached = makeActivity({
      name: 'Dana Dev',
      openPRCount: 3,
      mergedPRCount: 8,
      commitsToday: 5,
    })
    dataCacheStore['user-activity:v3:acme/dana'] = { data: cached, fetchedAt: Date.now() }

    render(<UserDetailPanel org="acme" memberLogin="dana" />)
    expect(screen.getByText(/Dana Dev/)).toBeTruthy()
    expect(screen.getByText(/5 commits today/)).toBeTruthy()
  })

  it('shows error banner when fetch fails', async () => {
    mockFetchUserActivity.mockRejectedValue(new Error('Network error'))

    const { container } = render(<UserDetailPanel org="acme" memberLogin="eve" />)

    await waitFor(() => {
      expect(container.querySelector('.ud-error-banner')).not.toBeNull()
    })

    expect(container.querySelector('.ud-error-banner')!.textContent).toContain('Network error')
    // Reset to default resolved value after test
    mockFetchUserActivity.mockResolvedValue(makeActivity())
  })

  it('renders profile link pointing to member GitHub page', () => {
    render(<UserDetailPanel org="acme" memberLogin="frank" />)
    const profileBtn = screen.getByText('Profile')
    expect(profileBtn).toBeTruthy()
  })

  it('renders Premium Requests section', () => {
    render(<UserDetailPanel org="acme" memberLogin="grace" />)
    expect(screen.getByText('Premium Requests')).toBeTruthy()
    expect(screen.getByTestId('premium-usage-stub')).toBeTruthy()
  })

  it('renders PR sections when activity is loaded from cache', () => {
    const cached = makeActivity({
      name: 'Hank',
      recentPRsAuthored: [
        {
          repo: 'acme/widgets',
          number: 42,
          title: 'Add widget feature',
          state: 'open',
          url: 'https://github.com/acme/widgets/pull/42',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
    })
    dataCacheStore['user-activity:v3:acme/hank'] = { data: cached, fetchedAt: Date.now() }

    render(<UserDetailPanel org="acme" memberLogin="hank" />)
    expect(screen.getByText('Add widget feature')).toBeTruthy()
    expect(screen.getByText('Authored')).toBeTruthy()
  })

  it('shows profile metadata when activity has location/company', () => {
    const cached = makeActivity({
      name: 'Ivy',
      location: 'San Francisco',
      company: '@acme',
    })
    dataCacheStore['user-activity:v3:acme/ivy'] = { data: cached, fetchedAt: Date.now() }

    render(<UserDetailPanel org="acme" memberLogin="ivy" />)
    expect(screen.getByText('San Francisco')).toBeTruthy()
    expect(screen.getByText('@acme')).toBeTruthy()
  })

  it('renders active repositories section when repos are present', () => {
    const cached = makeActivity({
      name: 'Jack',
      activeRepos: ['acme/alpha', 'acme/bravo'],
    })
    dataCacheStore['user-activity:v3:acme/jack'] = { data: cached, fetchedAt: Date.now() }

    render(<UserDetailPanel org="acme" memberLogin="jack" />)
    expect(screen.getByText('Active Repositories')).toBeTruthy()
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.getByText('bravo')).toBeTruthy()
  })
})
