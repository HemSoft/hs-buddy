import type { OrgOverviewResult } from '../api/github'
import type { RefreshableLoadPhase } from '../types/loadPhase'

export type LoadPhase = RefreshableLoadPhase

export interface PersonalQuotaSummary {
  used: number
  remaining: number
  entitlement: number
  overageCost: number
  fetchedAt: number
}

export interface OrgCopilotUsageData {
  org: string
  premiumRequests: number
  grossCost: number
  discount: number
  netCost: number
  businessSeats: number
  fetchedAt: number
}

export interface OrgCopilotState {
  usage: OrgCopilotUsageData | null
  phase: LoadPhase
  error: string | null
}

type OrgCopilotAction =
  | { type: 'reset-for-user-namespace' }
  | { type: 'hydrate-cache'; usage: OrgCopilotUsageData | null }
  | { type: 'start-loading'; hasUsage: boolean }
  | { type: 'success'; usage: OrgCopilotUsageData }
  | { type: 'error'; error: string | null }

export function createOrgCopilotState(cachedCopilot: OrgCopilotUsageData | null): OrgCopilotState {
  return {
    usage: cachedCopilot,
    phase: cachedCopilot ? 'ready' : 'loading',
    error: null,
  }
}

export function orgCopilotReducer(
  state: OrgCopilotState,
  action: OrgCopilotAction
): OrgCopilotState {
  switch (action.type) {
    case 'reset-for-user-namespace':
      return {
        usage: null,
        phase: 'loading',
        error: null,
      }
    case 'hydrate-cache':
      return {
        usage: action.usage,
        phase: 'ready',
        error: null,
      }
    case 'start-loading':
      return {
        ...state,
        phase: action.hasUsage ? 'refreshing' : 'loading',
        error: null,
      }
    case 'success':
      return {
        usage: action.usage,
        phase: 'ready',
        error: null,
      }
    case 'error':
      return {
        ...state,
        phase: 'error',
        error: action.error,
      }
    default:
      return state
  }
}

export function normalizeOverview(result: OrgOverviewResult | null): OrgOverviewResult | null {
  if (!result) {
    return null
  }

  return {
    ...result,
    metrics: {
      ...result.metrics,
      repoCount: result.metrics.repoCount ?? 0,
      privateRepoCount: result.metrics.privateRepoCount ?? 0,
      archivedRepoCount: result.metrics.archivedRepoCount ?? 0,
      openIssueCount: result.metrics.openIssueCount ?? 0,
      openPullRequestCount: result.metrics.openPullRequestCount ?? 0,
      totalStars: result.metrics.totalStars ?? 0,
      totalForks: result.metrics.totalForks ?? 0,
      activeReposToday: result.metrics.activeReposToday ?? 0,
      commitsToday: result.metrics.commitsToday ?? 0,
      topContributorsToday: result.metrics.topContributorsToday ?? [],
    },
  }
}

export function resolveRefreshPhase(
  phase: LoadPhase,
  isTaskActive: boolean,
  settledPhase: Exclude<LoadPhase, 'refreshing'>
): LoadPhase {
  if (phase !== 'refreshing' || isTaskActive) {
    return phase
  }

  return settledPhase
}

export function resolvePersonalCopilotPhase(
  personalQuotaSummary: PersonalQuotaSummary | null,
  personalQuotaLoading: boolean
): LoadPhase {
  if (personalQuotaSummary) return 'ready'
  if (personalQuotaLoading) return 'loading'
  return 'error'
}
