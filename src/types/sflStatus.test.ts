import { describe, expect, it } from 'vitest'
import {
  SFL_CORE_WORKFLOW_FRAGMENTS,
  deriveSFLOverallStatus,
  type SFLWorkflowInfo,
} from './sflStatus'

function makeWorkflow(overrides: Partial<SFLWorkflowInfo> = {}): SFLWorkflowInfo {
  return {
    id: 1,
    name: 'test workflow',
    state: 'active',
    latestRun: {
      status: 'completed',
      conclusion: 'success',
      createdAt: '2024-01-01T00:00:00Z',
      url: 'https://github.com/test',
    },
    ...overrides,
  }
}

describe('SFL_CORE_WORKFLOW_FRAGMENTS', () => {
  it('contains the expected workflow fragments', () => {
    expect(SFL_CORE_WORKFLOW_FRAGMENTS).toContain('issue processor')
    expect(SFL_CORE_WORKFLOW_FRAGMENTS).toContain('pr router')
    expect(SFL_CORE_WORKFLOW_FRAGMENTS).toContain('auditor')
    expect(SFL_CORE_WORKFLOW_FRAGMENTS.length).toBeGreaterThanOrEqual(7)
  })
})

describe('deriveSFLOverallStatus', () => {
  it('returns "unknown" for empty workflows', () => {
    expect(deriveSFLOverallStatus([])).toBe('unknown')
  })

  it('returns "healthy" when all workflows succeed', () => {
    const workflows = [
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'success', createdAt: '', url: '' },
      }),
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'success', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('healthy')
  })

  it('returns "healthy" when workflows have skipped or no runs', () => {
    const workflows = [
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'skipped', createdAt: '', url: '' },
      }),
      makeWorkflow({ latestRun: null }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('healthy')
  })

  it('returns "recent-failure" when any workflow failed', () => {
    const workflows = [
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'success', createdAt: '', url: '' },
      }),
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'failure', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('recent-failure')
  })

  it('returns "recent-failure" for timed_out conclusion', () => {
    const workflows = [
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'timed_out', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('recent-failure')
  })

  it('returns "active-work" when any workflow is in progress', () => {
    const workflows = [
      makeWorkflow({
        latestRun: { status: 'in_progress', conclusion: null, createdAt: '', url: '' },
      }),
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'success', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('active-work')
  })

  it('returns "active-work" when any workflow is queued', () => {
    const workflows = [
      makeWorkflow({ latestRun: { status: 'queued', conclusion: null, createdAt: '', url: '' } }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('active-work')
  })

  it('returns "ready-for-review" for action_required', () => {
    const workflows = [
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'action_required', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('ready-for-review')
  })

  it('returns "blocked" when all workflows are disabled', () => {
    const workflows = [
      makeWorkflow({
        state: 'disabled_manually',
        latestRun: { status: 'completed', conclusion: 'success', createdAt: '', url: '' },
      }),
      makeWorkflow({
        state: 'disabled_inactivity',
        latestRun: { status: 'completed', conclusion: 'success', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('blocked')
  })

  it('failure takes priority over active-work', () => {
    const workflows = [
      makeWorkflow({
        latestRun: { status: 'in_progress', conclusion: null, createdAt: '', url: '' },
      }),
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'failure', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('recent-failure')
  })

  it('active-work takes priority over action_required', () => {
    const workflows = [
      makeWorkflow({ latestRun: { status: 'queued', conclusion: null, createdAt: '', url: '' } }),
      makeWorkflow({
        latestRun: { status: 'completed', conclusion: 'action_required', createdAt: '', url: '' },
      }),
    ]
    expect(deriveSFLOverallStatus(workflows)).toBe('active-work')
  })
})
