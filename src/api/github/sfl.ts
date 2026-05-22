import type { PRConfig } from '../../types/pullRequest'
import {
  type SFLRepoStatus,
  type SFLWorkflowInfo,
  SFL_CORE_WORKFLOW_FRAGMENTS,
  deriveSFLOverallStatus,
} from '../../types/sflStatus'
import { type Octokit, getOctokitForOwner } from './shared'

function mapLatestWorkflowRun(
  latestRun:
    | {
        status?: string | null
        conclusion?: string | null
        created_at: string
        html_url: string
      }
    | null
): SFLWorkflowInfo['latestRun'] {
  if (!latestRun) return null
  return {
    status: latestRun.status ?? 'unknown',
    conclusion: latestRun.conclusion ?? null,
    createdAt: latestRun.created_at,
    url: latestRun.html_url,
  }
}

async function fetchWorkflowInfo(
  octokit: Octokit,
  owner: string,
  repo: string,
  workflow: { id: number; name: string; state: string }
): Promise<SFLWorkflowInfo> {
  try {
    const runsResponse = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflow.id,
      per_page: 1,
    })
    const latestRun = runsResponse.data.workflow_runs[0] ?? null
    return {
      id: workflow.id,
      name: workflow.name,
      state: workflow.state,
      latestRun: mapLatestWorkflowRun(latestRun),
    }
  } catch (_: unknown) {
    return { id: workflow.id, name: workflow.name, state: workflow.state, latestRun: null }
  }
}

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
    sflWorkflows.map(workflow => fetchWorkflowInfo(octokit, owner, repo, workflow))
  )

  return {
    isSFLEnabled: true,
    overallStatus: deriveSFLOverallStatus(workflowInfos),
    workflows: workflowInfos,
  }
}
