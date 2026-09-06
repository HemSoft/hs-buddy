import { allPages, evidenceFingerprint, readSnapshot, type GitHubApi } from './ai-review-github'
import {
  eligibleForAutoMerge,
  evaluateReview,
  MERGE_APP_ID,
  REVIEW_CHECK,
  type Pull,
  type ReviewSnapshot,
} from './ai-review-policy'

interface Rule {
  type: string
  parameters?: {
    required_status_checks?: Array<{ context: string; integration_id: number }>
    required_review_thread_resolution?: boolean
    strict_required_status_checks_policy?: boolean
  }
}

export async function hasRequiredGate(api: GitHubApi, repository: string): Promise<boolean> {
  const rules = await allPages<Rule>(api, `/repos/${repository}/rules/branches/main`)
  const check = rules.some(
    rule =>
      rule.parameters?.strict_required_status_checks_policy &&
      rule.parameters.required_status_checks?.some(
        required => required.context === REVIEW_CHECK && required.integration_id === MERGE_APP_ID
      )
  )
  const threads = rules.some(rule => rule.parameters?.required_review_thread_resolution === true)
  return check && threads
}

async function autoMerge(api: GitHubApi, pull: Pull, enable: boolean): Promise<void> {
  const operation = enable ? 'enablePullRequestAutoMerge' : 'disablePullRequestAutoMerge'
  const input = enable
    ? { pullRequestId: pull.node_id, expectedHeadOid: pull.head.sha, mergeMethod: 'SQUASH' }
    : { pullRequestId: pull.node_id }
  const type = enable ? 'EnablePullRequestAutoMergeInput!' : 'DisablePullRequestAutoMergeInput!'
  const result = await api.request<{
    errors?: unknown[]
    data?: Record<string, { pullRequest: { id: string } }>
  }>('/graphql', 'POST', {
    query: `mutation($input:${type}){${operation}(input:$input){pullRequest{id}}}`,
    variables: { input },
  })
  if (result.errors?.length || result.data?.[operation]?.pullRequest.id !== pull.node_id) {
    throw new Error(`GitHub refused ${operation}`)
  }
}

interface CheckRun {
  id: number
  app: { id: number }
}

async function pendingCheck(api: GitHubApi, repository: string, pull: Pull): Promise<CheckRun> {
  const check = await api.request<CheckRun>(`/repos/${repository}/check-runs`, 'POST', {
    name: REVIEW_CHECK,
    head_sha: pull.head.sha,
    status: 'in_progress',
    external_id: `ai-review:${pull.number}:${pull.head.sha}`,
    output: {
      title: 'Revalidating current-head AI review',
      summary: 'Reading live review evidence before publishing acceptance.',
    },
  })
  return check
}

async function finishCheck(
  api: GitHubApi,
  repository: string,
  check: CheckRun,
  accepted: boolean,
  reason: string
) {
  await api.request(`/repos/${repository}/check-runs/${check.id}`, 'PATCH', {
    status: 'completed',
    conclusion: accepted ? 'success' : 'failure',
    output: {
      title: accepted ? 'Current-head AI review accepted' : 'AI acceptance withheld',
      summary: reason,
    },
  })
}

async function rereadEvidence(
  api: GitHubApi,
  repository: string,
  previous: ReviewSnapshot,
  phase: string
) {
  const fresh = await readSnapshot(api, repository, previous.pull.number)
  if (evidenceFingerprint(fresh) !== evidenceFingerprint(previous)) {
    throw new Error(`Review evidence changed ${phase}`)
  }
  return fresh
}

async function updateEnrollment(
  api: GitHubApi,
  repository: string,
  snapshot: ReviewSnapshot,
  enabled: boolean,
  enrollment: { armed: boolean }
) {
  const canArm =
    enabled &&
    eligibleForAutoMerge(snapshot, repository) &&
    (await hasRequiredGate(api, repository))
  if (enrollment.armed && (!canArm || snapshot.pull.auto_merge?.merge_method !== 'squash')) {
    await autoMerge(api, snapshot.pull, false)
    enrollment.armed = false
  }
  if (canArm && !enrollment.armed) {
    // A lost response can hide a successful server-side mutation.
    enrollment.armed = true
    await autoMerge(api, snapshot.pull, true)
  }
}

export async function reconcilePull(
  api: GitHubApi,
  repository: string,
  number: number,
  options: { apply: boolean; enabled: boolean }
): Promise<string> {
  const pull = await api.request<Pull>(`/repos/${repository}/pulls/${number}`)
  if (pull.state !== 'open') return `PR #${number}: closed; no action`
  if (!options.apply) {
    const snapshot = await readSnapshot(api, repository, number)
    return `PR #${number} ${pull.head.sha}: ${evaluateReview(snapshot).reason}; eligible=${eligibleForAutoMerge(snapshot, repository)}`
  }
  const enrollment = { armed: pull.auto_merge !== null }
  let check: CheckRun | undefined
  try {
    check = await pendingCheck(api, repository, pull)
    if (check.app.id !== MERGE_APP_ID)
      throw new Error('Review check was not created by the configured GitHub App')
    const snapshot = await readSnapshot(api, repository, number)
    if (snapshot.pull.head.sha !== pull.head.sha)
      throw new Error('Head changed after pending check')
    const decision = evaluateReview(snapshot)
    const fresh = await rereadEvidence(api, repository, snapshot, 'during evaluation')
    enrollment.armed = fresh.pull.auto_merge !== null
    await updateEnrollment(api, repository, fresh, options.enabled, enrollment)
    await rereadEvidence(api, repository, fresh, 'before acceptance')
    await finishCheck(api, repository, check, decision.accepted, decision.reason)
    return `PR #${number} ${fresh.pull.head.sha}: ${decision.reason}; native auto-merge=${enrollment.armed}`
  } catch (error: unknown) {
    try {
      if (enrollment.armed) await autoMerge(api, pull, false)
    } finally {
      if (check) {
        await finishCheck(
          api,
          repository,
          check,
          false,
          'Evaluation failed or evidence changed; inspect the workflow run.'
        )
      }
    }
    throw error
  }
}

export async function openPullNumbers(api: GitHubApi, repository: string): Promise<number[]> {
  return (await allPages<Pull>(api, `/repos/${repository}/pulls?state=open&base=main`)).map(
    pull => pull.number
  )
}
