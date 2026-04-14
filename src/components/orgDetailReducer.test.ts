import { describe, expect, it } from 'vitest'
import type { OrgOverviewResult } from '../api/github'
import {
  createOrgCopilotState,
  normalizeOverview,
  orgCopilotReducer,
  resolvePersonalCopilotPhase,
  resolveRefreshPhase,
  type OrgCopilotState,
  type OrgCopilotUsageData,
  type PersonalQuotaSummary,
} from './orgDetailReducer'

/* ── helpers ──────────────────────────────────────────────────────── */
function makeUsage(overrides: Partial<OrgCopilotUsageData> = {}): OrgCopilotUsageData {
  return {
    org: 'test-org',
    premiumRequests: 100,
    grossCost: 50,
    discount: 10,
    netCost: 40,
    businessSeats: 5,
    fetchedAt: Date.now(),
    ...overrides,
  }
}

function makeOverview(overrides: Partial<OrgOverviewResult['metrics']> = {}): OrgOverviewResult {
  return {
    authenticatedAs: 'user1',
    isUserNamespace: false,
    metrics: {
      org: 'test-org',
      repoCount: 10,
      privateRepoCount: 3,
      archivedRepoCount: 1,
      openIssueCount: 5,
      openPullRequestCount: 2,
      totalStars: 100,
      totalForks: 50,
      activeReposToday: 4,
      commitsToday: 15,
      lastPushAt: '2026-01-01T00:00:00Z',
      topContributorsToday: [],
      ...overrides,
    },
  }
}

/* ── createOrgCopilotState ─────────────────────────────────────── */
describe('createOrgCopilotState', () => {
  it('returns ready state when cached data is provided', () => {
    const usage = makeUsage()
    const state = createOrgCopilotState(usage)
    expect(state.usage).toBe(usage)
    expect(state.phase).toBe('ready')
    expect(state.error).toBeNull()
  })

  it('returns loading state when no cached data', () => {
    const state = createOrgCopilotState(null)
    expect(state.usage).toBeNull()
    expect(state.phase).toBe('loading')
    expect(state.error).toBeNull()
  })
})

/* ── orgCopilotReducer ─────────────────────────────────────────── */
describe('orgCopilotReducer', () => {
  it('resets state for user namespace', () => {
    const state: OrgCopilotState = { usage: makeUsage(), phase: 'ready', error: null }
    const next = orgCopilotReducer(state, { type: 'reset-for-user-namespace' })
    expect(next.usage).toBeNull()
    expect(next.phase).toBe('loading')
    expect(next.error).toBeNull()
  })

  it('hydrates from cache', () => {
    const usage = makeUsage()
    const state: OrgCopilotState = { usage: null, phase: 'loading', error: null }
    const next = orgCopilotReducer(state, { type: 'hydrate-cache', usage })
    expect(next.usage).toBe(usage)
    expect(next.phase).toBe('ready')
  })

  it('hydrates null from cache', () => {
    const state: OrgCopilotState = { usage: null, phase: 'loading', error: null }
    const next = orgCopilotReducer(state, { type: 'hydrate-cache', usage: null })
    expect(next.usage).toBeNull()
    expect(next.phase).toBe('ready')
  })

  it('starts loading with no existing usage', () => {
    const state: OrgCopilotState = { usage: null, phase: 'ready', error: null }
    const next = orgCopilotReducer(state, { type: 'start-loading', hasUsage: false })
    expect(next.phase).toBe('loading')
    expect(next.error).toBeNull()
  })

  it('starts refreshing when existing usage present', () => {
    const usage = makeUsage()
    const state: OrgCopilotState = { usage, phase: 'ready', error: null }
    const next = orgCopilotReducer(state, { type: 'start-loading', hasUsage: true })
    expect(next.phase).toBe('refreshing')
    expect(next.usage).toBe(usage)
  })

  it('handles success', () => {
    const usage = makeUsage({ premiumRequests: 200 })
    const state: OrgCopilotState = { usage: null, phase: 'loading', error: null }
    const next = orgCopilotReducer(state, { type: 'success', usage })
    expect(next.usage).toBe(usage)
    expect(next.phase).toBe('ready')
  })

  it('handles error', () => {
    const state: OrgCopilotState = { usage: null, phase: 'loading', error: null }
    const next = orgCopilotReducer(state, { type: 'error', error: 'Network error' })
    expect(next.phase).toBe('error')
    expect(next.error).toBe('Network error')
  })

  it('handles error with null message', () => {
    const state: OrgCopilotState = { usage: null, phase: 'loading', error: null }
    const next = orgCopilotReducer(state, { type: 'error', error: null })
    expect(next.phase).toBe('error')
    expect(next.error).toBeNull()
  })

  it('preserves existing usage on error', () => {
    const usage = makeUsage()
    const state: OrgCopilotState = { usage, phase: 'refreshing', error: null }
    const next = orgCopilotReducer(state, { type: 'error', error: 'Failed' })
    expect(next.usage).toBe(usage)
    expect(next.phase).toBe('error')
  })

  it('returns same state for unknown action', () => {
    const state: OrgCopilotState = { usage: null, phase: 'idle', error: null }
    const next = orgCopilotReducer(state, { type: 'unknown' } as never)
    expect(next).toBe(state)
  })
})

/* ── normalizeOverview ─────────────────────────────────────────── */
describe('normalizeOverview', () => {
  it('returns null for null input', () => {
    expect(normalizeOverview(null)).toBeNull()
  })

  it('passes through valid overview with all fields', () => {
    const overview = makeOverview()
    const result = normalizeOverview(overview)
    expect(result).toEqual(overview)
  })

  it('defaults undefined metrics to zero/empty', () => {
    const partial = {
      authenticatedAs: 'user1',
      isUserNamespace: false,
      metrics: {
        org: 'test-org',
        lastPushAt: null,
      },
    } as unknown as OrgOverviewResult

    const result = normalizeOverview(partial)!
    expect(result.metrics.repoCount).toBe(0)
    expect(result.metrics.privateRepoCount).toBe(0)
    expect(result.metrics.archivedRepoCount).toBe(0)
    expect(result.metrics.openIssueCount).toBe(0)
    expect(result.metrics.openPullRequestCount).toBe(0)
    expect(result.metrics.totalStars).toBe(0)
    expect(result.metrics.totalForks).toBe(0)
    expect(result.metrics.activeReposToday).toBe(0)
    expect(result.metrics.commitsToday).toBe(0)
    expect(result.metrics.topContributorsToday).toEqual([])
  })

  it('preserves existing metrics values', () => {
    const overview = makeOverview({ repoCount: 42, totalStars: 999 })
    const result = normalizeOverview(overview)!
    expect(result.metrics.repoCount).toBe(42)
    expect(result.metrics.totalStars).toBe(999)
  })
})

/* ── resolveRefreshPhase ───────────────────────────────────────── */
describe('resolveRefreshPhase', () => {
  it('returns phase when not refreshing', () => {
    expect(resolveRefreshPhase('loading', false, 'ready')).toBe('loading')
    expect(resolveRefreshPhase('ready', false, 'loading')).toBe('ready')
    expect(resolveRefreshPhase('error', true, 'ready')).toBe('error')
    expect(resolveRefreshPhase('idle', false, 'ready')).toBe('idle')
  })

  it('returns phase when refreshing and task is active', () => {
    expect(resolveRefreshPhase('refreshing', true, 'ready')).toBe('refreshing')
  })

  it('settles to given phase when refreshing and task is not active', () => {
    expect(resolveRefreshPhase('refreshing', false, 'ready')).toBe('ready')
    expect(resolveRefreshPhase('refreshing', false, 'loading')).toBe('loading')
    expect(resolveRefreshPhase('refreshing', false, 'error')).toBe('error')
  })
})

/* ── resolvePersonalCopilotPhase ───────────────────────────────── */
describe('resolvePersonalCopilotPhase', () => {
  const summary: PersonalQuotaSummary = {
    used: 10,
    remaining: 90,
    entitlement: 100,
    overageCost: 0,
    fetchedAt: Date.now(),
  }

  it('returns ready when quota summary exists', () => {
    expect(resolvePersonalCopilotPhase(summary, false)).toBe('ready')
    expect(resolvePersonalCopilotPhase(summary, true)).toBe('ready')
  })

  it('returns loading when loading and no summary', () => {
    expect(resolvePersonalCopilotPhase(null, true)).toBe('loading')
  })

  it('returns error when not loading and no summary', () => {
    expect(resolvePersonalCopilotPhase(null, false)).toBe('error')
  })
})
