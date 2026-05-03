import type { PRConfig } from '../../types/pullRequest'
import {
  type SFLRepoStatus,
  type SFLWorkflowInfo,
  SFL_CORE_WORKFLOW_FRAGMENTS,
  deriveSFLOverallStatus,
} from '../../types/sflStatus'
import { getOctokitForOwner } from './shared'

/* v8 ignore start -- SFL status fetch; requires real API */
export async function fetchSFLStatus(
  config: PRConfig['github'],
  owner: string,
  repo: string
): Promise<SFLRepoStatus> {
  const octokit = await getOctokitForOwner(config, owner)

  const workflowsResponse = await octokit.actions.listRepoWorkflows({
    owner,
    repo,
    per_page: 100,
  })

  const allWorkflows = workflowsResponse.data.workflows
  const sflWorkflows = allWorkflows.filter(w =>
    SFL_CORE_WORKFLOW_FRAGMENTS.some(fragment => w.name.toLowerCase().includes(fragment))
  )

  if (sflWorkflows.length === 0) {
    return { isSFLEnabled: false, overallStatus: 'unknown', workflows: [] }
  }

  // Fetch latest run for each SFL workflow in parallel
  const workflowInfos: SFLWorkflowInfo[] = await Promise.all(
    sflWorkflows.map(async (w): Promise<SFLWorkflowInfo> => {
      try {
        const runsResponse = await octokit.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id: w.id,
          per_page: 1,
        })
        const latestRun = runsResponse.data.workflow_runs[0] ?? null
        return {
          id: w.id,
          name: w.name,
          state: w.state,
          latestRun: latestRun
            ? {
                status: latestRun.status ?? 'unknown',
                conclusion: latestRun.conclusion ?? null,
                createdAt: latestRun.created_at,
                url: latestRun.html_url,
              }
            : null,
        }
      } catch (_: unknown) {
        return { id: w.id, name: w.name, state: w.state, latestRun: null }
      }
    })
  )

  return {
    isSFLEnabled: true,
    overallStatus: deriveSFLOverallStatus(workflowInfos),
    workflows: workflowInfos,
  }
}
/* v8 ignore stop */
