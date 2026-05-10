import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./shared', () => ({
  getOctokitForOwner: vi.fn(),
}))

import { fetchSFLStatus } from './sfl'
import { getOctokitForOwner } from './shared'

const mockGetOctokitForOwner = vi.mocked(getOctokitForOwner)

const config = { accounts: [{ username: 'user', org: 'org' }] }

function makeOctokit(
  workflows: Array<{ id: number; name: string; state: string }>,
  runsByWorkflow: Record<number, Array<Record<string, unknown>>> = {}
) {
  return {
    actions: {
      listRepoWorkflows: vi.fn().mockResolvedValue({ data: { workflows } }),
      listWorkflowRuns: vi.fn().mockImplementation(({ workflow_id }: { workflow_id: number }) => {
        const runs = runsByWorkflow[workflow_id] ?? []
        return Promise.resolve({ data: { workflow_runs: runs } })
      }),
    },
  }
}

describe('fetchSFLStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns isSFLEnabled false when no SFL workflows found', async () => {
    const octokit = makeOctokit([
      { id: 1, name: 'CI Build', state: 'active' },
      { id: 2, name: 'Deploy', state: 'active' },
    ])
    mockGetOctokitForOwner.mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(config, 'owner', 'repo')

    expect(result).toEqual({ isSFLEnabled: false, overallStatus: 'unknown', workflows: [] })
  })

  it('returns workflow info with latest run data', async () => {
    const octokit = makeOctokit([{ id: 10, name: 'SFL Issue Processor', state: 'active' }], {
      10: [
        {
          status: 'completed',
          conclusion: 'success',
          created_at: '2026-01-01T00:00:00Z',
          html_url: 'https://github.com/org/repo/actions/runs/123',
        },
      ],
    })
    mockGetOctokitForOwner.mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(config, 'owner', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.workflows).toHaveLength(1)
    expect(result.workflows[0]).toEqual({
      id: 10,
      name: 'SFL Issue Processor',
      state: 'active',
      latestRun: {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/org/repo/actions/runs/123',
      },
    })
  })

  it('handles workflow with no runs', async () => {
    const octokit = makeOctokit([{ id: 20, name: 'SFL Auditor', state: 'active' }], { 20: [] })
    mockGetOctokitForOwner.mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(config, 'owner', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.workflows[0].latestRun).toBeNull()
  })

  it('handles run fetch failure gracefully', async () => {
    const octokit = makeOctokit([{ id: 30, name: 'SFL PR Router', state: 'active' }])
    octokit.actions.listWorkflowRuns.mockRejectedValue(new Error('API error'))
    mockGetOctokitForOwner.mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(config, 'owner', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.workflows[0]).toEqual({
      id: 30,
      name: 'SFL PR Router',
      state: 'active',
      latestRun: null,
    })
  })

  it('detects multiple SFL workflows by name fragments', async () => {
    const octokit = makeOctokit(
      [
        { id: 1, name: 'CI Build', state: 'active' },
        { id: 2, name: 'SFL Issue Processor', state: 'active' },
        { id: 3, name: 'SFL Analyzer A', state: 'active' },
        { id: 4, name: 'SFL PR Label Actions', state: 'active' },
      ],
      {
        2: [
          { status: 'completed', conclusion: 'success', created_at: '2026-01-01', html_url: 'u1' },
        ],
        3: [
          { status: 'completed', conclusion: 'success', created_at: '2026-01-02', html_url: 'u2' },
        ],
        4: [
          { status: 'completed', conclusion: 'success', created_at: '2026-01-03', html_url: 'u3' },
        ],
      }
    )
    mockGetOctokitForOwner.mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(config, 'owner', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.workflows).toHaveLength(3)
    // CI Build should NOT be included
    expect(result.workflows.every(w => w.name !== 'CI Build')).toBe(true)
  })

  it('defaults status to unknown and conclusion to null when missing', async () => {
    const octokit = makeOctokit([{ id: 40, name: 'SFL Auditor', state: 'active' }], {
      40: [
        {
          status: null,
          conclusion: null,
          created_at: '2026-01-01T00:00:00Z',
          html_url: 'https://example.com',
        },
      ],
    })
    mockGetOctokitForOwner.mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(config, 'owner', 'repo')

    expect(result.workflows[0].latestRun).toEqual({
      status: 'unknown',
      conclusion: null,
      createdAt: '2026-01-01T00:00:00Z',
      url: 'https://example.com',
    })
  })

  it('derives overall status from workflow infos', async () => {
    const octokit = makeOctokit([{ id: 50, name: 'SFL Issue Processor', state: 'active' }], {
      50: [
        {
          status: 'completed',
          conclusion: 'failure',
          created_at: '2026-01-01',
          html_url: 'https://example.com',
        },
      ],
    })
    mockGetOctokitForOwner.mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(config, 'owner', 'repo')

    expect(result.overallStatus).toBe('recent-failure')
  })
})
