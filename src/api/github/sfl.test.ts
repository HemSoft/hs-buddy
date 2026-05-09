import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchSFLStatus } from './sfl'
import type { PRConfig } from '../../types/pullRequest'

vi.mock('./shared', () => ({
  getOctokitForOwner: vi.fn(),
}))

import { getOctokitForOwner } from './shared'

const mockConfig = {
  accounts: [{ username: 'user', token: 'tok' }],
} as unknown as PRConfig['github']

function makeMockOctokit(
  workflows: Array<{ id: number; name: string; state: string }>,
  runsMap: Record<
    number,
    Array<{ status: string; conclusion: string | null; created_at: string; html_url: string }>
  > = {}
) {
  return {
    actions: {
      listRepoWorkflows: vi.fn().mockResolvedValue({
        data: { workflows },
      }),
      listWorkflowRuns: vi.fn().mockImplementation(({ workflow_id }: { workflow_id: number }) => {
        const runs = runsMap[workflow_id] ?? []
        return Promise.resolve({ data: { workflow_runs: runs } })
      }),
    },
  }
}

describe('fetchSFLStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns disabled status when no SFL workflows are found', async () => {
    const octokit = makeMockOctokit([
      { id: 1, name: 'CI Build', state: 'active' },
      { id: 2, name: 'Deploy', state: 'active' },
    ])
    vi.mocked(getOctokitForOwner).mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(mockConfig, 'org', 'repo')

    expect(result).toEqual({ isSFLEnabled: false, overallStatus: 'unknown', workflows: [] })
  })

  it('returns enabled status with workflow info when SFL workflows exist', async () => {
    const octokit = makeMockOctokit(
      [
        { id: 10, name: 'SFL Issue Processor', state: 'active' },
        { id: 11, name: 'SFL Auditor', state: 'active' },
        { id: 99, name: 'CI Build', state: 'active' },
      ],
      {
        10: [
          {
            status: 'completed',
            conclusion: 'success',
            created_at: '2024-01-01T00:00:00Z',
            html_url: 'https://github.com/run/10',
          },
        ],
        11: [
          {
            status: 'completed',
            conclusion: 'success',
            created_at: '2024-01-02T00:00:00Z',
            html_url: 'https://github.com/run/11',
          },
        ],
      }
    )
    vi.mocked(getOctokitForOwner).mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(mockConfig, 'org', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.overallStatus).toBe('healthy')
    expect(result.workflows).toHaveLength(2)
    expect(result.workflows[0]).toEqual({
      id: 10,
      name: 'SFL Issue Processor',
      state: 'active',
      latestRun: {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2024-01-01T00:00:00Z',
        url: 'https://github.com/run/10',
      },
    })
  })

  it('handles workflows with no runs', async () => {
    const octokit = makeMockOctokit([{ id: 10, name: 'SFL PR Router', state: 'active' }], {
      10: [],
    })
    vi.mocked(getOctokitForOwner).mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(mockConfig, 'org', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.workflows[0].latestRun).toBeNull()
  })

  it('detects recent failures', async () => {
    const octokit = makeMockOctokit([{ id: 10, name: 'SFL Auditor', state: 'active' }], {
      10: [
        {
          status: 'completed',
          conclusion: 'failure',
          created_at: '2024-01-01T00:00:00Z',
          html_url: 'https://github.com/run/10',
        },
      ],
    })
    vi.mocked(getOctokitForOwner).mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(mockConfig, 'org', 'repo')

    expect(result.overallStatus).toBe('recent-failure')
  })

  it('handles listWorkflowRuns errors gracefully', async () => {
    const octokit = makeMockOctokit([{ id: 10, name: 'SFL Issue Processor', state: 'active' }])
    octokit.actions.listWorkflowRuns.mockRejectedValue(new Error('API error'))
    vi.mocked(getOctokitForOwner).mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(mockConfig, 'org', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.workflows[0].latestRun).toBeNull()
  })

  it('defaults status to "unknown" when API returns null status', async () => {
    const octokit = makeMockOctokit(
      [{ id: 10, name: 'SFL Analyzer A workflow', state: 'active' }],
      {
        10: [
          {
            status: null as unknown as string,
            conclusion: null,
            created_at: '2024-01-01T00:00:00Z',
            html_url: 'https://github.com/run/10',
          },
        ],
      }
    )
    vi.mocked(getOctokitForOwner).mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(mockConfig, 'org', 'repo')

    expect(result.workflows[0].latestRun?.status).toBe('unknown')
  })

  it('matches SFL workflow names case-insensitively', async () => {
    const octokit = makeMockOctokit([{ id: 10, name: 'SFL PR ROUTER', state: 'active' }], {
      10: [],
    })
    vi.mocked(getOctokitForOwner).mockResolvedValue(octokit as never)

    const result = await fetchSFLStatus(mockConfig, 'org', 'repo')

    expect(result.isSFLEnabled).toBe(true)
    expect(result.workflows).toHaveLength(1)
  })
})
