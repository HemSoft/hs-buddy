import { describe, expect, it } from 'vitest'
import {
  extractRepoFromUrl,
  mapSearchItemToUserPR,
  buildEventId,
  mapRawEventToUserEvent,
  countEventCommitsToday,
  resolveStatusFields,
  extractUserBasicInfo,
  extractUserStatusInfo,
  collectDailyCounts,
  buildContributionData,
  mapRawRepoSlim,
  eventSummary,
  assignContributionColor,
  computeQuartiles,
  buildContributionCalendar,
  EVENT_LABELS,
} from './users'

// ── extractRepoFromUrl ──────────────────────────────────────────────

describe('extractRepoFromUrl', () => {
  it('extracts owner/repo from a standard API URL', () => {
    expect(extractRepoFromUrl('https://api.github.com/repos/octocat/hello-world')).toBe(
      'octocat/hello-world'
    )
  })

  it('handles URLs with trailing segments gracefully', () => {
    const url = 'https://api.github.com/repos/org/repo'
    expect(extractRepoFromUrl(url)).toBe('org/repo')
  })
})

// ── mapSearchItemToUserPR ───────────────────────────────────────────

describe('mapSearchItemToUserPR', () => {
  const baseItem = {
    number: 42,
    title: 'Fix bug',
    repository_url: 'https://api.github.com/repos/org/repo',
    state: 'open',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    html_url: 'https://github.com/org/repo/pull/42',
  }

  it('maps an open PR', () => {
    const result = mapSearchItemToUserPR(baseItem)
    expect(result).toEqual({
      number: 42,
      title: 'Fix bug',
      repo: 'org/repo',
      state: 'open',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      url: 'https://github.com/org/repo/pull/42',
    })
  })

  it('maps a merged PR', () => {
    const item = { ...baseItem, pull_request: { merged_at: '2025-01-03T00:00:00Z' } }
    expect(mapSearchItemToUserPR(item).state).toBe('merged')
  })

  it('maps a closed (non-merged) PR', () => {
    const item = {
      ...baseItem,
      state: 'closed',
      pull_request: { merged_at: null },
    }
    expect(mapSearchItemToUserPR(item).state).toBe('closed')
  })

  it('maps closed state when pull_request is absent', () => {
    const item = { ...baseItem, state: 'closed' }
    expect(mapSearchItemToUserPR(item).state).toBe('closed')
  })
})

// ── buildEventId ────────────────────────────────────────────────────

describe('buildEventId', () => {
  it('uses the event id when present', () => {
    expect(buildEventId({ id: '12345', type: 'PushEvent' }, 'org/repo')).toBe('12345')
  })

  it('constructs a fallback id when id is missing', () => {
    const result = buildEventId(
      { type: 'PushEvent', created_at: '2025-01-01T00:00:00Z' },
      'org/repo'
    )
    expect(result).toBe('PushEvent:org/repo:2025-01-01T00:00:00Z')
  })

  it('handles missing type and created_at', () => {
    const result = buildEventId({}, 'org/repo')
    expect(result).toBe('Unknown:org/repo:')
  })
})

// ── mapRawEventToUserEvent ──────────────────────────────────────────

describe('mapRawEventToUserEvent', () => {
  it('maps a valid org event', () => {
    const evt = {
      id: '100',
      type: 'PushEvent',
      repo: { name: 'myorg/repo' },
      payload: { size: 3 },
      created_at: '2025-06-01T12:00:00Z',
    }
    const result = mapRawEventToUserEvent(evt, 'myorg/')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('100')
    expect(result!.type).toBe('PushEvent')
    expect(result!.repo).toBe('myorg/repo')
    expect(result!.createdAt).toBe('2025-06-01T12:00:00Z')
  })

  it('returns null for events outside the org', () => {
    const evt = { id: '101', type: 'PushEvent', repo: { name: 'otherorg/repo' } }
    expect(mapRawEventToUserEvent(evt, 'myorg/')).toBeNull()
  })

  it('returns null when repo object is missing', () => {
    expect(mapRawEventToUserEvent({ id: '102' }, 'myorg/')).toBeNull()
  })

  it('returns null when repo name is missing', () => {
    expect(mapRawEventToUserEvent({ id: '103', repo: {} }, 'myorg/')).toBeNull()
  })

  it('handles event with missing type and created_at', () => {
    const evt = { repo: { name: 'myorg/repo' } }
    const result = mapRawEventToUserEvent(evt, 'myorg/')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('Unknown')
    expect(result!.createdAt).toBe('')
  })
})

// ── countEventCommitsToday ──────────────────────────────────────────

describe('countEventCommitsToday', () => {
  const startOfDay = '2025-06-01T00:00:00Z'

  it('counts commit sizes from PushEvents today', () => {
    const events = [
      {
        type: 'PushEvent',
        repo: { name: 'org/repo1' },
        created_at: '2025-06-01T10:00:00Z',
        payload: { size: 3 },
      },
      {
        type: 'PushEvent',
        repo: { name: 'org/repo2' },
        created_at: '2025-06-01T15:00:00Z',
        payload: { size: 2 },
      },
    ]
    expect(countEventCommitsToday(events, 'org/', startOfDay)).toBe(5)
  })

  it('excludes events before today', () => {
    const events = [
      {
        type: 'PushEvent',
        repo: { name: 'org/repo' },
        created_at: '2025-05-31T23:59:59Z',
        payload: { size: 5 },
      },
    ]
    expect(countEventCommitsToday(events, 'org/', startOfDay)).toBe(0)
  })

  it('excludes non-PushEvents', () => {
    const events = [
      {
        type: 'WatchEvent',
        repo: { name: 'org/repo' },
        created_at: '2025-06-01T10:00:00Z',
        payload: {},
      },
    ]
    expect(countEventCommitsToday(events, 'org/', startOfDay)).toBe(0)
  })

  it('excludes events from other orgs', () => {
    const events = [
      {
        type: 'PushEvent',
        repo: { name: 'other/repo' },
        created_at: '2025-06-01T10:00:00Z',
        payload: { size: 5 },
      },
    ]
    expect(countEventCommitsToday(events, 'org/', startOfDay)).toBe(0)
  })

  it('defaults to 1 when payload size is missing', () => {
    const events = [
      {
        type: 'PushEvent',
        repo: { name: 'org/repo' },
        created_at: '2025-06-01T10:00:00Z',
        payload: {},
      },
    ]
    expect(countEventCommitsToday(events, 'org/', startOfDay)).toBe(1)
  })

  it('returns 0 for empty events', () => {
    expect(countEventCommitsToday([], 'org/', startOfDay)).toBe(0)
  })
})

// ── resolveStatusFields ─────────────────────────────────────────────

describe('resolveStatusFields', () => {
  it('returns nulls for null status', () => {
    expect(resolveStatusFields(null)).toEqual({ statusMessage: null, statusEmoji: null })
  })

  it('returns nulls for undefined status', () => {
    expect(resolveStatusFields(undefined)).toEqual({ statusMessage: null, statusEmoji: null })
  })

  it('extracts message and emoji', () => {
    expect(resolveStatusFields({ message: 'Working', emoji: ':rocket:' })).toEqual({
      statusMessage: 'Working',
      statusEmoji: ':rocket:',
    })
  })

  it('handles null message and emoji', () => {
    expect(resolveStatusFields({ message: null, emoji: null })).toEqual({
      statusMessage: null,
      statusEmoji: null,
    })
  })

  it('handles missing fields', () => {
    expect(resolveStatusFields({})).toEqual({ statusMessage: null, statusEmoji: null })
  })
})

// ── extractUserBasicInfo ────────────────────────────────────────────

describe('extractUserBasicInfo', () => {
  it('returns nulls for null user', () => {
    expect(extractUserBasicInfo(null)).toEqual({
      name: null,
      bio: null,
      company: null,
      location: null,
    })
  })

  it('returns nulls for undefined user', () => {
    expect(extractUserBasicInfo(undefined)).toEqual({
      name: null,
      bio: null,
      company: null,
      location: null,
    })
  })

  it('extracts all fields', () => {
    expect(
      extractUserBasicInfo({
        name: 'John',
        bio: 'Developer',
        company: 'Acme',
        location: 'NYC',
      })
    ).toEqual({ name: 'John', bio: 'Developer', company: 'Acme', location: 'NYC' })
  })

  it('coerces null/undefined fields to null', () => {
    expect(extractUserBasicInfo({ name: null })).toEqual({
      name: null,
      bio: null,
      company: null,
      location: null,
    })
  })
})

// ── extractUserStatusInfo ───────────────────────────────────────────

describe('extractUserStatusInfo', () => {
  it('returns nulls for null user', () => {
    expect(extractUserStatusInfo(null)).toEqual({
      statusMessage: null,
      statusEmoji: null,
      createdAt: null,
    })
  })

  it('returns nulls for undefined user', () => {
    expect(extractUserStatusInfo(undefined)).toEqual({
      statusMessage: null,
      statusEmoji: null,
      createdAt: null,
    })
  })

  it('extracts status and createdAt', () => {
    expect(
      extractUserStatusInfo({
        status: { message: 'Busy', emoji: ':no_entry:' },
        createdAt: '2020-01-01',
      })
    ).toEqual({ statusMessage: 'Busy', statusEmoji: ':no_entry:', createdAt: '2020-01-01' })
  })

  it('handles missing status', () => {
    expect(extractUserStatusInfo({ createdAt: '2020-01-01' })).toEqual({
      statusMessage: null,
      statusEmoji: null,
      createdAt: '2020-01-01',
    })
  })
})

// ── collectDailyCounts ──────────────────────────────────────────────

describe('collectDailyCounts', () => {
  it('counts commits per day', () => {
    const dates = ['2025-01-01T10:00:00Z', '2025-01-01T15:00:00Z', '2025-01-02T08:00:00Z']
    const result = collectDailyCounts(dates)
    expect(result.get('2025-01-01')).toBe(2)
    expect(result.get('2025-01-02')).toBe(1)
  })

  it('returns empty map for empty input', () => {
    expect(collectDailyCounts([]).size).toBe(0)
  })
})

// ── buildContributionData ───────────────────────────────────────────

describe('buildContributionData', () => {
  it('prefers org-activity when dates outnumber graphql total', () => {
    const dates = ['2025-01-01T10:00:00Z', '2025-01-02T08:00:00Z']
    const result = buildContributionData(dates, null)
    expect(result.contributionSource).toBe('org-activity')
    expect(result.totalContributions).toBe(2)
    expect(result.contributionWeeks).not.toBeNull()
  })

  it('uses graphql data when available and larger', () => {
    const profile = {
      user: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: 100,
            weeks: [
              {
                contributionDays: [{ contributionCount: 5, date: '2025-01-01', color: '#216e39' }],
              },
            ],
          },
        },
      },
    }
    const result = buildContributionData(['2025-01-01T10:00:00Z'], profile)
    expect(result.contributionSource).toBe('graphql')
    expect(result.totalContributions).toBe(100)
  })

  it('returns nulls when no data available', () => {
    const result = buildContributionData([], null)
    expect(result.totalContributions).toBeNull()
    expect(result.contributionWeeks).toBeNull()
    expect(result.contributionSource).toBe('org-activity')
  })

  it('returns nulls when graphql profile has no calendar', () => {
    const result = buildContributionData([], { user: {} })
    expect(result.totalContributions).toBeNull()
    expect(result.contributionWeeks).toBeNull()
  })
})

// ── mapRawRepoSlim ──────────────────────────────────────────────────

describe('mapRawRepoSlim', () => {
  it('maps name and pushed_at', () => {
    expect(mapRawRepoSlim({ name: 'repo', pushed_at: '2025-01-01T00:00:00Z' })).toEqual({
      name: 'repo',
      pushedAt: '2025-01-01T00:00:00Z',
    })
  })

  it('defaults pushedAt to null', () => {
    expect(mapRawRepoSlim({ name: 'repo' })).toEqual({ name: 'repo', pushedAt: null })
  })

  it('handles null pushed_at', () => {
    expect(mapRawRepoSlim({ name: 'repo', pushed_at: null })).toEqual({
      name: 'repo',
      pushedAt: null,
    })
  })
})

// ── eventSummary (already exported, but testing coverage completeness) ──

describe('eventSummary', () => {
  it('summarizes a PushEvent with commit count', () => {
    const result = eventSummary({ type: 'PushEvent', payload: { size: 3 } })
    expect(result).toBe('Pushed 3 commits')
  })

  it('handles singular commit', () => {
    expect(eventSummary({ type: 'PushEvent', payload: { size: 1 } })).toBe('Pushed 1 commit')
  })

  it('returns label for known event types', () => {
    expect(eventSummary({ type: 'WatchEvent' })).toBe(EVENT_LABELS.WatchEvent)
  })

  it('formats CreateEvent with ref_type', () => {
    expect(eventSummary({ type: 'CreateEvent', payload: { ref_type: 'branch' } })).toBe(
      'Created a branch'
    )
  })

  it('formats PullRequestEvent with action', () => {
    expect(eventSummary({ type: 'PullRequestEvent', payload: { action: 'opened' } })).toBe(
      'Opened pull request'
    )
  })

  it('strips Event suffix for unknown events', () => {
    expect(eventSummary({ type: 'CustomEvent' })).toBe('Custom')
  })

  it('returns Activity for missing type', () => {
    expect(eventSummary({})).toBe('Activity')
  })
})

// ── assignContributionColor ─────────────────────────────────────────

describe('assignContributionColor', () => {
  it('assigns level 0 color for zero contributions', () => {
    expect(assignContributionColor(0, [1, 2, 3])).toBe('#ebedf0')
  })

  it('assigns level 1 color for counts ≤ q1', () => {
    expect(assignContributionColor(1, [1, 3, 5])).toBe('#9be9a8')
  })

  it('assigns level 2 color for counts ≤ q2', () => {
    expect(assignContributionColor(2, [1, 3, 5])).toBe('#40c463')
  })

  it('assigns level 3 color for counts ≤ q3', () => {
    expect(assignContributionColor(4, [1, 3, 5])).toBe('#30a14e')
  })

  it('assigns level 4 color for counts above q3', () => {
    expect(assignContributionColor(6, [1, 3, 5])).toBe('#216e39')
  })
})

// ── computeQuartiles ────────────────────────────────────────────────

describe('computeQuartiles', () => {
  it('computes quartiles from an array of counts', () => {
    const counts = [1, 2, 3, 4]
    const [q1, q2, q3] = computeQuartiles(counts)
    expect(q1).toBeGreaterThan(0)
    expect(q2).toBeGreaterThanOrEqual(q1)
    expect(q3).toBeGreaterThanOrEqual(q2)
  })

  it('returns [1,2,3] for empty array', () => {
    expect(computeQuartiles([])).toEqual([1, 2, 3])
  })

  it('returns [1,2,3] for all-zero array', () => {
    expect(computeQuartiles([0, 0, 0])).toEqual([1, 2, 3])
  })
})

// ── buildContributionCalendar ───────────────────────────────────────

describe('buildContributionCalendar', () => {
  it('builds weeks with contribution data', () => {
    const dates = ['2025-06-01T10:00:00Z', '2025-06-01T15:00:00Z', '2025-06-02T08:00:00Z']
    const result = buildContributionCalendar(dates)
    expect(result.totalContributions).toBe(3)
    expect(result.weeks.length).toBeGreaterThan(0)
    const allDays = result.weeks.flatMap(w => w.contributionDays)
    const totalFromDays = allDays.reduce((sum, d) => sum + d.contributionCount, 0)
    expect(totalFromDays).toBe(3)
  })

  it('handles empty dates', () => {
    const result = buildContributionCalendar([])
    expect(result.totalContributions).toBe(0)
    expect(result.weeks.length).toBeGreaterThan(0)
  })
})
