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

function resolveLoadingPhase(hasUsage: boolean): LoadPhase {
  return hasUsage ? 'refreshing' : 'loading'
}

export function orgCopilotReducer(
  state: OrgCopilotState,
  action: OrgCopilotAction
): OrgCopilotState {
  switch (action.type) {
    case 'reset-for-user-namespace':
      return { usage: null, phase: 'loading', error: null }
    case 'hydrate-cache':
    case 'success':
      return { usage: action.usage, phase: 'ready', error: null }
    case 'start-loading':
      return { ...state, phase: resolveLoadingPhase(action.hasUsage), error: null }
    case 'error':
      return { ...state, phase: 'error', error: action.error }
    default:
      return state
  }
}

const METRIC_DEFAULTS: Partial<OrgOverviewResult['metrics']> = {
  repoCount: 0,
  privateRepoCount: 0,
  archivedRepoCount: 0,
  openIssueCount: 0,
  openPullRequestCount: 0,
  totalStars: 0,
  totalForks: 0,
  activeReposToday: 0,
  commitsToday: 0,
  topContributorsToday: [],
}

function normalizeMetrics(metrics: OrgOverviewResult['metrics']): OrgOverviewResult['metrics'] {
  const result = { ...metrics }
  for (const [key, defaultVal] of Object.entries(METRIC_DEFAULTS)) {
    const k = key as keyof typeof METRIC_DEFAULTS
    if (result[k] == null) (result as Record<string, unknown>)[k] = defaultVal
  }
  return result
}

export function normalizeOverview(result: OrgOverviewResult | null): OrgOverviewResult | null {
  if (!result) {
    return null
  }

  return {
    ...result,
    metrics: normalizeMetrics(result.metrics),
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
