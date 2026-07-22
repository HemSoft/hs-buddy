const EXPECTED_ACTOR = 'github-actions[bot]'
const MAX_POLL_ATTEMPTS = 12
const POLL_INTERVAL_MS = 5_000
const EMPTY_POLLS_AFTER_APPROVAL = 2

interface WorkflowActor {
  login?: string
}

interface WorkflowRepository {
  full_name?: string
}

interface WorkflowPullRequest {
  number?: number
}

export interface WorkflowRun {
  id?: number
  name?: string
  path?: string
  event?: string
  status?: string
  conclusion?: string | null
  head_sha?: string
  actor?: WorkflowActor | null
  triggering_actor?: WorkflowActor | null
  repository?: WorkflowRepository
  pull_requests?: WorkflowPullRequest[]
}

export interface ApprovalScope {
  repository: string
  headSha: string
  pullNumber: number
  excludedWorkflowPath: string
}

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[]
}

interface Environment {
  GH_TOKEN?: string
  GITHUB_API_URL?: string
  TARGET_REPOSITORY?: string
  TARGET_SHA?: string
  TARGET_PR_NUMBER?: string
  EXCLUDED_WORKFLOW_PATH?: string
}

function required(environment: Environment, name: keyof Environment): string {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function approvalScopeFromEnvironment(environment: Environment): ApprovalScope {
  const repository = required(environment, 'TARGET_REPOSITORY')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error('TARGET_REPOSITORY must be in owner/repository form')
  }

  const headSha = required(environment, 'TARGET_SHA').toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error('TARGET_SHA must be a full 40-character commit SHA')
  }

  const pullNumber = Number(required(environment, 'TARGET_PR_NUMBER'))
  if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) {
    throw new Error('TARGET_PR_NUMBER must be a positive integer')
  }

  return {
    repository,
    headSha,
    pullNumber,
    excludedWorkflowPath: required(environment, 'EXCLUDED_WORKFLOW_PATH'),
  }
}

function targetsExactPullRequest(run: WorkflowRun, scope: ApprovalScope): boolean {
  return (
    run.repository?.full_name === scope.repository &&
    run.head_sha?.toLowerCase() === scope.headSha &&
    run.pull_requests?.some(pullRequest => pullRequest.number === scope.pullNumber) === true
  )
}

function isPendingApproval(run: WorkflowRun): boolean {
  return (
    run.event === 'pull_request' &&
    run.status === 'completed' &&
    run.conclusion === 'action_required'
  )
}

function wasCreatedByActions(run: WorkflowRun): boolean {
  return run.actor?.login === EXPECTED_ACTOR && run.triggering_actor?.login === EXPECTED_ACTOR
}

export function isApprovalCandidate(run: WorkflowRun, scope: ApprovalScope): boolean {
  return (
    Number.isSafeInteger(run.id) &&
    targetsExactPullRequest(run, scope) &&
    isPendingApproval(run) &&
    wasCreatedByActions(run) &&
    run.path !== scope.excludedWorkflowPath &&
    typeof run.path === 'string'
  )
}

export function approvalCandidates(runs: WorkflowRun[], scope: ApprovalScope): WorkflowRun[] {
  return runs.filter(run => isApprovalCandidate(run, scope))
}

function repositoryPath(repository: string): string {
  return repository.split('/').map(encodeURIComponent).join('/')
}

async function responseError(response: Response): Promise<Error> {
  const body = (await response.text()).slice(0, 1_000)
  return new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${body}`)
}

async function listActionRequiredRuns(
  apiUrl: string,
  token: string,
  scope: ApprovalScope
): Promise<WorkflowRun[]> {
  const url = new URL(`${apiUrl}/repos/${repositoryPath(scope.repository)}/actions/runs`)
  url.searchParams.set('event', 'pull_request')
  url.searchParams.set('status', 'action_required')
  url.searchParams.set('head_sha', scope.headSha)
  url.searchParams.set('per_page', '100')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) throw await responseError(response)

  const payload = (await response.json()) as Partial<WorkflowRunsResponse>
  if (!Array.isArray(payload.workflow_runs)) {
    throw new Error('GitHub API response did not contain workflow_runs')
  }
  return payload.workflow_runs
}

async function approveRun(apiUrl: string, token: string, repository: string, runId: number) {
  const url = `${apiUrl}/repos/${repositoryPath(repository)}/actions/runs/${runId}/approve`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) throw await responseError(response)
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function describeRun(run: WorkflowRun): string {
  return `${run.name ?? 'unnamed'} (${run.path ?? 'unknown path'}, run ${run.id ?? 'unknown'})`
}

async function main(): Promise<void> {
  const environment = process.env as Environment
  const token = required(environment, 'GH_TOKEN')
  const apiUrl = (environment.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '')
  const scope = approvalScopeFromEnvironment(environment)
  const approvedRunIds = new Set<number>()
  let emptyPollsAfterApproval = 0

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const runs = await listActionRequiredRuns(apiUrl, token, scope)
    const candidates = approvalCandidates(runs, scope).filter(
      run => !approvedRunIds.has(run.id as number)
    )

    if (candidates.length === 0) {
      if (approvedRunIds.size > 0) {
        emptyPollsAfterApproval += 1
        if (emptyPollsAfterApproval >= EMPTY_POLLS_AFTER_APPROVAL) break
      }
    } else {
      emptyPollsAfterApproval = 0
      for (const run of candidates) {
        const runId = run.id as number
        console.log(`Approving ${describeRun(run)} for ${scope.headSha}`)
        await approveRun(apiUrl, token, scope.repository, runId)
        approvedRunIds.add(runId)
      }
    }

    if (attempt < MAX_POLL_ATTEMPTS) await sleep(POLL_INTERVAL_MS)
  }

  const remainingRuns = await listActionRequiredRuns(apiUrl, token, scope)
  const remainingRelevant = remainingRuns.filter(
    run =>
      run.path !== scope.excludedWorkflowPath &&
      run.repository?.full_name === scope.repository &&
      run.head_sha?.toLowerCase() === scope.headSha &&
      run.event === 'pull_request' &&
      run.pull_requests?.some(pullRequest => pullRequest.number === scope.pullNumber) === true
  )
  if (remainingRelevant.length > 0) {
    throw new Error(
      `Refusing to leave non-excluded action_required runs: ${remainingRelevant.map(describeRun).join(', ')}`
    )
  }

  console.log(
    approvedRunIds.size === 0
      ? `No non-excluded action_required follow-up runs appeared for ${scope.headSha}`
      : `Approved ${approvedRunIds.size} validated follow-up run(s) for ${scope.headSha}`
  )
}

if (import.meta.main) {
  await main()
}
