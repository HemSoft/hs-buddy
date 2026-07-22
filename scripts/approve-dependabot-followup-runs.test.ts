import { describe, expect, it } from 'vitest'
import {
  approvalCandidates,
  approvalScopeFromEnvironment,
  isApprovalCandidate,
  type ApprovalScope,
  type WorkflowRun,
} from './approve-dependabot-followup-runs'

const scope: ApprovalScope = {
  repository: 'HemSoft/hs-buddy',
  headSha: '7301537c00000000000000000000000000000000',
  pullNumber: 267,
  excludedWorkflowPath: '.github/workflows/dependabot-lockfile.yml',
}

function candidate(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 28_761_315_228,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'action_required',
    head_sha: scope.headSha,
    actor: { login: 'github-actions[bot]' },
    triggering_actor: { login: 'github-actions[bot]' },
    repository: { full_name: scope.repository },
    pull_requests: [{ number: scope.pullNumber }],
    ...overrides,
  }
}

describe('isApprovalCandidate', () => {
  it('accepts the exact validated follow-up run shape', () => {
    expect(isApprovalCandidate(candidate(), scope)).toBe(true)
  })

  it.each([
    ['repository', { repository: { full_name: 'HemSoft/other' } }],
    ['head SHA', { head_sha: 'a'.repeat(40) }],
    ['event', { event: 'push' }],
    ['status', { status: 'queued' }],
    ['conclusion', { conclusion: 'success' }],
    ['actor', { actor: { login: 'dependabot[bot]' } }],
    ['triggering actor', { triggering_actor: { login: 'dependabot[bot]' } }],
    ['pull request', { pull_requests: [{ number: 268 }] }],
  ])('rejects a run with the wrong %s', (_field, overrides) => {
    expect(isApprovalCandidate(candidate(overrides), scope)).toBe(false)
  })

  it('rejects the recursive Dependabot Lockfile Fix run', () => {
    for (const path of [
      '.github/workflows/dependabot-lockfile.yml',
      '.github/workflows/dependabot-lockfile.yml@refs/pull/267/merge',
    ]) {
      expect(
        isApprovalCandidate(
          candidate({
            name: 'Dependabot Lockfile Fix',
            path,
          }),
          scope
        )
      ).toBe(false)
    }
  })
})

describe('approvalCandidates', () => {
  it('returns only tightly scoped non-recursive runs', () => {
    const runs = [
      candidate(),
      candidate({ id: 2, path: '.github/workflows/security.yml', name: 'Security Scanning' }),
      candidate({ id: 3, head_sha: 'b'.repeat(40) }),
      candidate({ id: 4, path: scope.excludedWorkflowPath }),
    ]

    expect(approvalCandidates(runs, scope).map(run => run.id)).toEqual([28_761_315_228, 2])
  })
})

describe('approvalScopeFromEnvironment', () => {
  it('parses and normalizes a complete scope', () => {
    expect(
      approvalScopeFromEnvironment({
        TARGET_REPOSITORY: 'HemSoft/hs-buddy',
        TARGET_SHA: 'A'.repeat(40),
        TARGET_PR_NUMBER: '267',
        EXCLUDED_WORKFLOW_PATH: '.github/workflows/dependabot-lockfile.yml',
      })
    ).toEqual({ ...scope, headSha: 'a'.repeat(40) })
  })

  it.each([
    ['repository', { TARGET_REPOSITORY: 'hs-buddy' }],
    ['SHA', { TARGET_SHA: 'short' }],
    ['PR number', { TARGET_PR_NUMBER: '0' }],
  ])('rejects an invalid %s', (_field, override) => {
    expect(() =>
      approvalScopeFromEnvironment({
        TARGET_REPOSITORY: scope.repository,
        TARGET_SHA: scope.headSha,
        TARGET_PR_NUMBER: String(scope.pullNumber),
        EXCLUDED_WORKFLOW_PATH: scope.excludedWorkflowPath,
        ...override,
      })
    ).toThrow()
  })
})
