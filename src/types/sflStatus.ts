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

/** Priority-ordered rules for SFL status derivation. First match wins. */
const SFL_STATUS_RULES: ReadonlyArray<{
  status: SFLOverallStatus
  match: (ws: SFLWorkflowInfo[]) => boolean
}> = [
  {
    status: 'recent-failure',
    match: ws =>
      ws.some(
        w => w.latestRun?.conclusion === 'failure' || w.latestRun?.conclusion === 'timed_out'
      ),
  },
  {
    status: 'active-work',
    match: ws =>
      ws.some(w => w.latestRun?.status === 'in_progress' || w.latestRun?.status === 'queued'),
  },
  {
    status: 'ready-for-review',
    match: ws => ws.some(w => w.latestRun?.conclusion === 'action_required'),
  },
  {
    status: 'blocked',
    match: ws => ws.every(w => w.state !== 'active'),
  },
  {
    status: 'healthy',
    match: ws =>
      ws.every(
        w =>
          !w.latestRun ||
          w.latestRun.conclusion === 'success' ||
          w.latestRun.conclusion === 'skipped'
      ),
  },
]

/**
 * Derive the overall SFL pipeline status from individual workflow states.
 */
export function deriveSFLOverallStatus(workflows: SFLWorkflowInfo[]): SFLOverallStatus {
  if (workflows.length === 0) return 'unknown'
  return SFL_STATUS_RULES.find(rule => rule.match(workflows))?.status ?? 'unknown'
}
