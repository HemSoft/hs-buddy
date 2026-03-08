/** SFL Loop monitoring types for sidebar tree integration. */

/** Core SFL workflow name fragments used for detection. */
export const SFL_CORE_WORKFLOW_FRAGMENTS = [
  'issue processor',
  'analyzer a',
  'analyzer b',
  'analyzer c',
  'pr router',
  'pr label actions',
  'auditor',
] as const

/** High-level SFL pipeline health states. */
export type SFLOverallStatus =
  | 'healthy'
  | 'active-work'
  | 'blocked'
  | 'ready-for-review'
  | 'recent-failure'
  | 'unknown'

/** Status of a single SFL workflow with its latest run. */
export interface SFLWorkflowInfo {
  id: number
  name: string
  state: string
  latestRun: {
    status: string
    conclusion: string | null
    createdAt: string
    url: string
  } | null
}

/** Aggregate SFL status for a single repository. */
export interface SFLRepoStatus {
  isSFLEnabled: boolean
  overallStatus: SFLOverallStatus
  workflows: SFLWorkflowInfo[]
}

/** Map workflow conclusions to display labels. */
export const SFL_STATUS_LABELS: Record<SFLOverallStatus, string> = {
  'healthy': 'Healthy',
  'active-work': 'Active work',
  'blocked': 'Blocked',
  'ready-for-review': 'Ready for review',
  'recent-failure': 'Recent failure',
  'unknown': 'Unknown',
}

/** Map workflow conclusions to display colors (CSS class suffixes). */
export const SFL_STATUS_COLORS: Record<SFLOverallStatus, string> = {
  'healthy': 'success',
  'active-work': 'info',
  'blocked': 'warning',
  'ready-for-review': 'info',
  'recent-failure': 'error',
  'unknown': 'muted',
}

/**
 * Derive the overall SFL pipeline status from individual workflow states.
 */
export function deriveSFLOverallStatus(workflows: SFLWorkflowInfo[]): SFLOverallStatus {
  if (workflows.length === 0) return 'unknown'

  const hasFailure = workflows.some(
    w => w.latestRun?.conclusion === 'failure' || w.latestRun?.conclusion === 'timed_out'
  )
  if (hasFailure) return 'recent-failure'

  const hasRunning = workflows.some(
    w => w.latestRun?.status === 'in_progress' || w.latestRun?.status === 'queued'
  )
  if (hasRunning) return 'active-work'

  const hasActionRequired = workflows.some(
    w => w.latestRun?.conclusion === 'action_required'
  )
  if (hasActionRequired) return 'ready-for-review'

  const allDisabled = workflows.every(w => w.state !== 'active')
  if (allDisabled) return 'blocked'

  const allSuccess = workflows.every(
    w => !w.latestRun || w.latestRun.conclusion === 'success' || w.latestRun.conclusion === 'skipped'
  )
  if (allSuccess) return 'healthy'

  return 'unknown'
}