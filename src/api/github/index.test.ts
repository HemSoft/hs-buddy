import { describe, expect, it } from 'vitest'
import {
  clearOrgAvatarCache,
  clearAllCaches,
  getOrgAvatarCacheEntry,
  EVENT_LABELS,
  eventSummary,
  assignContributionColor,
  computeQuartiles,
  buildContributionCalendar,
  GitHubClient,
} from './index'
import {
  clearOrgAvatarCache as sharedClearOrgAvatar,
  clearAllCaches as sharedClearAll,
  getOrgAvatarCacheEntry as sharedGetOrgAvatar,
} from './shared'
import {
  EVENT_LABELS as usersEventLabels,
  eventSummary as usersEventSummary,
  assignContributionColor as usersAssignColor,
  computeQuartiles as usersQuartiles,
  buildContributionCalendar as usersCalendar,
} from './users'
import { GitHubClient as ClientDirect } from './client'

describe('api/github barrel', () => {
  it('re-exports shared utilities with correct identity', () => {
    expect(clearOrgAvatarCache).toBe(sharedClearOrgAvatar)
    expect(clearAllCaches).toBe(sharedClearAll)
    expect(getOrgAvatarCacheEntry).toBe(sharedGetOrgAvatar)
  })

  it('re-exports user utilities with correct identity', () => {
    expect(EVENT_LABELS).toBe(usersEventLabels)
    expect(eventSummary).toBe(usersEventSummary)
    expect(assignContributionColor).toBe(usersAssignColor)
    expect(computeQuartiles).toBe(usersQuartiles)
    expect(buildContributionCalendar).toBe(usersCalendar)
  })

  it('re-exports GitHubClient class with correct identity', () => {
    expect(GitHubClient).toBe(ClientDirect)
  })
})
