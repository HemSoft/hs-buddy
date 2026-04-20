import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

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
    contributionSource: 'public',
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

/* ── Branch & function coverage tests ──────────────────────────── */
describe('UserDetailPanel – uncovered branches & functions', () => {
  beforeEach(() => {
    for (const key of Object.keys(dataCacheStore)) delete dataCacheStore[key]
    mockFetchUserActivity.mockReset()
    mockFetchUserActivity.mockResolvedValue(makeActivity())
    window.shell = { openExternal: vi.fn() } as never
  })

  /* ── PRStateIcon switch branches ── */
  describe('PRStateIcon states', () => {
    it('renders merged icon for merged PRs', () => {
      const cached = makeActivity({
        recentPRsAuthored: [
          {
            repo: 'acme/widgets',
            number: 10,
            title: 'Merged PR',
            state: 'merged',
            url: 'https://github.com/acme/widgets/pull/10',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/pr-merged'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="pr-merged" />)
      expect(container.querySelector('.ud-pr-merged')).not.toBeNull()
    })

    it('renders closed (default) icon for closed PRs', () => {
      const cached = makeActivity({
        recentPRsAuthored: [
          {
            repo: 'acme/widgets',
            number: 11,
            title: 'Closed PR',
            state: 'closed',
            url: 'https://github.com/acme/widgets/pull/11',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/pr-closed'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="pr-closed" />)
      expect(container.querySelector('.ud-pr-closed')).not.toBeNull()
    })
  })

  /* ── EventRow rendering ── */
  describe('EventRow', () => {
    it('renders recent events with repo short name', () => {
      const cached = makeActivity({
        recentEvents: [
          {
            id: 'e1',
            type: 'PushEvent',
            repo: 'acme/core',
            createdAt: '2025-01-15T10:00:00Z',
            summary: 'Pushed 3 commits',
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/eventer'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="eventer" />)
      expect(screen.getByText('Pushed 3 commits')).toBeTruthy()
      expect(screen.getByText('core')).toBeTruthy()
    })

    it('falls back to full repo name when no slash exists', () => {
      const cached = makeActivity({
        recentEvents: [
          {
            id: 'e2',
            type: 'CreateEvent',
            repo: 'standalone-repo',
            createdAt: '2025-01-15T10:00:00Z',
            summary: 'Created branch',
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/eventer2'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="eventer2" />)
      expect(screen.getByText('standalone-repo')).toBeTruthy()
    })
  })

  /* ── navigateToView via org button and repo chips ── */
  describe('navigateToView', () => {
    it('dispatches app:navigate when org button is clicked', () => {
      const spy = vi.spyOn(window, 'dispatchEvent')

      render(<UserDetailPanel org="acme" memberLogin="nav1" />)
      fireEvent.click(screen.getByText('acme'))

      const navEvent = spy.mock.calls.find(
        ([e]) => e instanceof CustomEvent && e.type === 'app:navigate'
      )
      expect(navEvent).toBeTruthy()
      expect((navEvent![0] as CustomEvent).detail.viewId).toBe('org-detail:acme')

      spy.mockRestore()
    })

    it('dispatches app:navigate when a repo chip is clicked', () => {
      const cached = makeActivity({ activeRepos: ['acme/myrepo'] })
      dataCacheStore['user-activity:v3:acme/nav2'] = { data: cached, fetchedAt: Date.now() }
      const spy = vi.spyOn(window, 'dispatchEvent')

      render(<UserDetailPanel org="acme" memberLogin="nav2" />)
      fireEvent.click(screen.getByText('myrepo'))

      const navEvent = spy.mock.calls.find(
        ([e]) => e instanceof CustomEvent && e.type === 'app:navigate'
      )
      expect(navEvent).toBeTruthy()
      expect((navEvent![0] as CustomEvent).detail.viewId).toBe('repo-detail:acme/myrepo')

      spy.mockRestore()
    })
  })

  /* ── UserDetailHero branches ── */
  describe('UserDetailHero branches', () => {
    it('shows "Admin" when orgRole is admin', () => {
      const cached = makeActivity({ orgRole: 'admin' })
      dataCacheStore['user-activity:v3:acme/adm'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="adm" />)
      expect(screen.getByText(/Admin of acme/)).toBeTruthy()
    })

    it('shows "Member" when orgRole is not admin', () => {
      const cached = makeActivity({ orgRole: 'member' })
      dataCacheStore['user-activity:v3:acme/mem'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="mem" />)
      expect(screen.getByText(/Member of acme/)).toBeTruthy()
    })

    it('shows name with login in parentheses when name is present', () => {
      const cached = makeActivity({ name: 'Kim K' })
      dataCacheStore['user-activity:v3:acme/kim'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="kim" />)
      expect(screen.getByText(/Kim K \(kim\)/)).toBeTruthy()
    })

    it('renders status emoji when present', () => {
      const cached = makeActivity({
        name: 'Emoji User',
        statusEmoji: '🚀',
        statusMessage: 'Shipping code',
      })
      dataCacheStore['user-activity:v3:acme/emoji'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="emoji" />)
      const emojiSpan = container.querySelector('.ud-status-emoji')
      expect(emojiSpan).not.toBeNull()
      expect(emojiSpan!.textContent).toBe('🚀')
      expect(emojiSpan!.getAttribute('title')).toBe('Shipping code')
    })

    it('renders status emoji with undefined title when statusMessage is null', () => {
      const cached = makeActivity({
        name: 'No Msg',
        statusEmoji: '🎉',
        statusMessage: null,
      })
      dataCacheStore['user-activity:v3:acme/nomsg'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="nomsg" />)
      const emojiSpan = container.querySelector('.ud-status-emoji')
      expect(emojiSpan).not.toBeNull()
      expect(emojiSpan!.hasAttribute('title')).toBe(false)
    })

    it('shows singular "1 commit today"', () => {
      const cached = makeActivity({ commitsToday: 1 })
      dataCacheStore['user-activity:v3:acme/single'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="single" />)
      expect(screen.getByText('1 commit today')).toBeTruthy()
    })

    it('shows plural "3 commits today"', () => {
      const cached = makeActivity({ commitsToday: 3 })
      dataCacheStore['user-activity:v3:acme/plural'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="plural" />)
      expect(screen.getByText('3 commits today')).toBeTruthy()
    })

    it('disables refresh button during loading and shows spin class', async () => {
      mockFetchUserActivity.mockImplementation(() => new Promise(() => {}))

      const { container } = render(<UserDetailPanel org="acme" memberLogin="loading1" />)

      await waitFor(() => {
        const btn = container.querySelector('.ud-action-btn[title="Refresh user data"]')
        expect(btn).not.toBeNull()
        expect(btn!.hasAttribute('disabled')).toBe(true)
      })
    })

    it('opens profile via window.shell.openExternal when Profile button is clicked', () => {
      render(<UserDetailPanel org="acme" memberLogin="profclick" />)
      fireEvent.click(screen.getByText('Profile'))
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/profclick')
    })
  })

  /* ── UserProfileMeta branches ── */
  describe('UserProfileMeta branches', () => {
    it('renders teams when present', () => {
      const cached = makeActivity({ teams: ['frontend', 'platform'] })
      dataCacheStore['user-activity:v3:acme/teams'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="teams" />)
      expect(screen.getByText('frontend, platform')).toBeTruthy()
    })

    it('renders bio when present', () => {
      const cached = makeActivity({ bio: 'I love open source' })
      dataCacheStore['user-activity:v3:acme/bio'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="bio" />)
      expect(screen.getByText('I love open source')).toBeTruthy()
    })

    it('renders createdAt date', () => {
      const cached = makeActivity({ createdAt: '2019-03-15T00:00:00Z' })
      dataCacheStore['user-activity:v3:acme/created'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="created" />)
      expect(screen.getByText(/GitHub since/)).toBeTruthy()
      expect(screen.getByText(/Mar 2019/)).toBeTruthy()
    })

    it('renders statusMessage with fallback emoji 💬 when statusEmoji is null', () => {
      const cached = makeActivity({
        statusMessage: 'On vacation',
        statusEmoji: null,
      })
      dataCacheStore['user-activity:v3:acme/status1'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="status1" />)
      const statusEl = container.querySelector('.ud-meta-status')
      expect(statusEl).not.toBeNull()
      expect(statusEl!.textContent).toContain('💬')
      expect(statusEl!.textContent).toContain('On vacation')
    })

    it('renders statusMessage with provided statusEmoji', () => {
      const cached = makeActivity({
        statusMessage: 'Coding',
        statusEmoji: '💻',
      })
      dataCacheStore['user-activity:v3:acme/status2'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="status2" />)
      const statusEl = container.querySelector('.ud-meta-status')
      expect(statusEl).not.toBeNull()
      expect(statusEl!.textContent).toContain('💻')
      expect(statusEl!.textContent).toContain('Coding')
    })

    it('does not render profile meta when activity has no metadata fields', () => {
      const cached = makeActivity({
        teams: [],
        company: null,
        location: null,
        createdAt: null,
        bio: null,
        statusMessage: null,
      })
      dataCacheStore['user-activity:v3:acme/empty-meta'] = {
        data: cached,
        fetchedAt: Date.now(),
      }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="empty-meta" />)
      const metaEl = container.querySelector('.ud-profile-meta')
      expect(metaEl).not.toBeNull()
      // Meta section is rendered but has no meta items
      expect(metaEl!.querySelectorAll('.ud-meta-item').length).toBe(0)
    })
  })

  /* ── Loading state: SectionLoader, spinners ── */
  describe('loading state sections', () => {
    beforeEach(() => {
      mockFetchUserActivity.mockImplementation(() => new Promise(() => {}))
    })

    it('shows SectionLoader for contributions during loading', async () => {
      render(<UserDetailPanel org="acme" memberLogin="load-contrib" />)

      await waitFor(() => {
        expect(screen.getByText('Loading contributions…')).toBeTruthy()
      })
    })

    it('shows SectionLoader for pull requests during loading', async () => {
      render(<UserDetailPanel org="acme" memberLogin="load-prs" />)

      await waitFor(() => {
        expect(screen.getByText('Loading pull requests…')).toBeTruthy()
      })
    })

    it('shows SectionLoader for reviews during loading', async () => {
      render(<UserDetailPanel org="acme" memberLogin="load-reviews" />)

      await waitFor(() => {
        expect(screen.getByText('Loading reviews…')).toBeTruthy()
      })
    })

    it('shows SectionLoader for activity during loading', async () => {
      render(<UserDetailPanel org="acme" memberLogin="load-activity" />)

      await waitFor(() => {
        expect(screen.getByText('Loading activity…')).toBeTruthy()
      })
    })

    it('shows spinner in metrics grid during loading', async () => {
      const { container } = render(<UserDetailPanel org="acme" memberLogin="load-metrics" />)

      await waitFor(() => {
        const spinners = container.querySelectorAll('.ud-metric-value .spin')
        expect(spinners.length).toBeGreaterThan(0)
      })
    })
  })

  /* ── UserMetricsGrid – dash for error state ── */
  describe('UserMetricsGrid error fallback', () => {
    it('shows dash values when phase is error', async () => {
      mockFetchUserActivity.mockRejectedValue(new Error('fail'))

      const { container } = render(<UserDetailPanel org="acme" memberLogin="err-m" />)

      await waitFor(() => {
        expect(container.querySelector('.ud-error-banner')).not.toBeNull()
      })

      const values = container.querySelectorAll('.ud-metric-value')
      const dashes = Array.from(values).filter(el => el.textContent === '—')
      // Open PRs, Merged (90d), and Active Repos show '—' in error state
      expect(dashes.length).toBeGreaterThanOrEqual(3)
    })
  })

  /* ── UserContributionSection – ready with data ── */
  describe('UserContributionSection', () => {
    it('renders ContributionGraph when ready with contribution data', () => {
      const cached = makeActivity({
        totalContributions: 150,
        contributionWeeks: [
          {
            contributionDays: [{ date: '2025-01-01', contributionCount: 5, color: '#216e39' }],
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/contrib'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="contrib" />)
      expect(screen.getByTestId('contribution-graph-stub')).toBeTruthy()
    })

    it('returns null when ready but no contribution data', () => {
      const cached = makeActivity({
        totalContributions: null,
        contributionWeeks: null,
      })
      dataCacheStore['user-activity:v3:acme/no-contrib'] = {
        data: cached,
        fetchedAt: Date.now(),
      }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="no-contrib" />)
      expect(container.querySelector('[data-testid="contribution-graph-stub"]')).toBeNull()
    })

    it('shows contribution graph even for public view with 0 contributions', () => {
      const cached = makeActivity({
        totalContributions: 0,
        contributionWeeks: [],
        contributionSource: 'public',
      })
      dataCacheStore['user-activity:v3:acme/other-user'] = {
        data: cached,
        fetchedAt: Date.now(),
      }

      render(<UserDetailPanel org="acme" memberLogin="other-user" />)
      expect(screen.getByTestId('contribution-graph-stub')).toBeTruthy()
    })

    it('renders graph for self-view even with 0 contributions', () => {
      const cached = makeActivity({
        totalContributions: 0,
        contributionWeeks: [],
        contributionSource: 'self',
      })
      dataCacheStore['user-activity:v3:acme/self-user'] = {
        data: cached,
        fetchedAt: Date.now(),
      }

      render(<UserDetailPanel org="acme" memberLogin="self-user" />)
      expect(screen.getByTestId('contribution-graph-stub')).toBeTruthy()
    })
  })

  /* ── UserPullRequestSections – reviewed PRs and empty states ── */
  describe('UserPullRequestSections', () => {
    it('shows "No recent pull requests" when authored list is empty', () => {
      const cached = makeActivity({ recentPRsAuthored: [] })
      dataCacheStore['user-activity:v3:acme/no-prs'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="no-prs" />)
      expect(screen.getByText('No recent pull requests.')).toBeTruthy()
    })

    it('shows "No recent reviews" when reviewed list is empty', () => {
      const cached = makeActivity({ recentPRsReviewed: [] })
      dataCacheStore['user-activity:v3:acme/no-revs'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="no-revs" />)
      expect(screen.getByText('No recent reviews.')).toBeTruthy()
    })

    it('renders reviewed PRs when present', () => {
      const cached = makeActivity({
        recentPRsReviewed: [
          {
            repo: 'acme/api',
            number: 99,
            title: 'Fix auth bug',
            state: 'open',
            url: 'https://github.com/acme/api/pull/99',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/reviewer'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="reviewer" />)
      expect(screen.getByText('Fix auth bug')).toBeTruthy()
      expect(screen.getByText('Reviewed')).toBeTruthy()
    })
  })

  /* ── UserActivitySection – ready with events vs no events ── */
  describe('UserActivitySection', () => {
    it('shows event list when ready with events', () => {
      const cached = makeActivity({
        recentEvents: [
          {
            id: 'ev1',
            type: 'PushEvent',
            repo: 'acme/lib',
            createdAt: '2025-01-10T12:00:00Z',
            summary: 'Pushed 2 commits',
          },
          {
            id: 'ev2',
            type: 'IssuesEvent',
            repo: 'acme/lib',
            createdAt: '2025-01-10T11:00:00Z',
            summary: 'Opened issue',
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/evts'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="evts" />)
      expect(screen.getByText('Recent Activity')).toBeTruthy()
      expect(screen.getByText('Pushed 2 commits')).toBeTruthy()
      expect(screen.getByText('Opened issue')).toBeTruthy()
    })

    it('hides activity section when ready but no events', () => {
      const cached = makeActivity({ recentEvents: [] })
      dataCacheStore['user-activity:v3:acme/no-evts'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="no-evts" />)
      expect(screen.queryByText('Recent Activity')).toBeNull()
    })
  })

  /* ── UserRepositoriesSection – empty repos ── */
  describe('UserRepositoriesSection', () => {
    it('does not render when activeRepos is empty', () => {
      const cached = makeActivity({ activeRepos: [] })
      dataCacheStore['user-activity:v3:acme/no-repos'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="no-repos" />)
      expect(screen.queryByText('Active Repositories')).toBeNull()
    })

    it('shows repo full name when repo has no slash', () => {
      const cached = makeActivity({ activeRepos: ['standalone'] })
      dataCacheStore['user-activity:v3:acme/repo-noslash'] = {
        data: cached,
        fetchedAt: Date.now(),
      }

      render(<UserDetailPanel org="acme" memberLogin="repo-noslash" />)
      expect(screen.getByText('standalone')).toBeTruthy()
    })
  })

  /* ── MetricCard variant classes ── */
  describe('MetricCard variants', () => {
    it('applies warm variant class when commitsToday > 0', () => {
      const cached = makeActivity({ commitsToday: 5 })
      dataCacheStore['user-activity:v3:acme/warm'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="warm" />)
      expect(container.querySelector('.ud-metric-card-warm')).not.toBeNull()
    })

    it('does not apply variant class when commitsToday is 0', () => {
      const cached = makeActivity({ commitsToday: 0 })
      dataCacheStore['user-activity:v3:acme/no-warm'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="no-warm" />)
      expect(container.querySelector('.ud-metric-card-warm')).toBeNull()
    })

    it('applies cool variant class for merged PRs metric', () => {
      const cached = makeActivity({ mergedPRCount: 5 })
      dataCacheStore['user-activity:v3:acme/cool'] = { data: cached, fetchedAt: Date.now() }

      const { container } = render(<UserDetailPanel org="acme" memberLogin="cool" />)
      expect(container.querySelector('.ud-metric-card-cool')).not.toBeNull()
    })
  })

  /* ── PR row click → openExternal ── */
  describe('PRRow click', () => {
    it('opens PR URL via shell.openExternal when clicked', () => {
      const cached = makeActivity({
        recentPRsAuthored: [
          {
            repo: 'acme/app',
            number: 55,
            title: 'Clickable PR',
            state: 'open',
            url: 'https://github.com/acme/app/pull/55',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })
      dataCacheStore['user-activity:v3:acme/clicker'] = { data: cached, fetchedAt: Date.now() }

      render(<UserDetailPanel org="acme" memberLogin="clicker" />)
      fireEvent.click(screen.getByText('Clickable PR'))

      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/acme/app/pull/55')
    })
  })

  /* ── handleRefresh triggers re-fetch ── */
  describe('handleRefresh', () => {
    it('clears cache and re-fetches when refresh button is clicked', async () => {
      const cached = makeActivity({ name: 'Stale User', commitsToday: 1 })
      dataCacheStore['user-activity:v3:acme/refreshme'] = {
        data: cached,
        fetchedAt: Date.now(),
      }

      const updated = makeActivity({ name: 'Fresh User', commitsToday: 10 })
      mockFetchUserActivity.mockResolvedValue(updated)

      render(<UserDetailPanel org="acme" memberLogin="refreshme" />)
      expect(screen.getByText(/Stale User/)).toBeTruthy()

      const refreshBtn = screen.getByTitle('Refresh user data')
      fireEvent.click(refreshBtn)

      await waitFor(() => {
        expect(screen.getByText(/Fresh User/)).toBeTruthy()
      })
      expect(mockFetchUserActivity).toHaveBeenCalled()
    })
  })

  /* ── Member/contributor from cached org data ── */
  describe('cached org data lookups', () => {
    it('uses avatarUrl from cached org-members when available', () => {
      dataCacheStore['org-members:acme'] = {
        data: {
          members: [
            {
              login: 'cached-member',
              name: 'Cached M',
              avatarUrl: 'https://example.com/avatar.png',
              url: 'https://github.com/cached-member',
              type: 'User',
            },
          ],
          authenticatedAs: 'bot',
          isUserNamespace: false,
        },
        fetchedAt: Date.now(),
      }

      render(<UserDetailPanel org="acme" memberLogin="cached-member" />)
      const img = screen.getByRole('img', { name: 'cached-member' })
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.png')
    })

    it('uses commits from cached overview contributor when activity has no commitsToday', async () => {
      dataCacheStore['org-overview:acme'] = {
        data: {
          metrics: {
            org: 'acme',
            repoCount: 10,
            privateRepoCount: 5,
            archivedRepoCount: 0,
            openIssueCount: 0,
            openPullRequestCount: 0,
            totalStars: 0,
            totalForks: 0,
            activeReposToday: 0,
            commitsToday: 0,
            lastPushAt: null,
            topContributorsToday: [
              { login: 'contrib-user', avatarUrl: null, url: null, commits: 7 },
            ],
          },
          authenticatedAs: 'bot',
          isUserNamespace: false,
        },
        fetchedAt: Date.now(),
      }

      // Return activity with commitsToday: 0 so fallback to contributor.commits
      mockFetchUserActivity.mockResolvedValue(makeActivity({ commitsToday: 0 }))

      render(<UserDetailPanel org="acme" memberLogin="contrib-user" />)

      // Initially, before fetch resolves, commitsToday = activity?.commitsToday ?? contributor?.commits ?? 0
      // Since activity is null in idle and contributor.commits is 7, should show 7
      expect(screen.getByText('7 commits today')).toBeTruthy()
    })
  })

  /* ── hero subtitle shows login prefix when name is present ── */
  it('shows memberLogin prefix in subtitle when activity.name is set', () => {
    const cached = makeActivity({ name: 'Display Name', commitsToday: 2 })
    dataCacheStore['user-activity:v3:acme/sub-test'] = { data: cached, fetchedAt: Date.now() }

    render(<UserDetailPanel org="acme" memberLogin="sub-test" />)
    expect(screen.getByText(/sub-test ·/)).toBeTruthy()
  })

  /* ── hero subtitle omits login prefix when name is absent ── */
  it('omits memberLogin prefix in subtitle when activity.name is null', () => {
    const cached = makeActivity({ name: null, commitsToday: 2 })
    dataCacheStore['user-activity:v3:acme/sub-test2'] = { data: cached, fetchedAt: Date.now() }

    render(<UserDetailPanel org="acme" memberLogin="sub-test2" />)
    expect(screen.getByText('2 commits today')).toBeTruthy()
    expect(screen.queryByText(/sub-test2 ·/)).toBeNull()
  })
})
