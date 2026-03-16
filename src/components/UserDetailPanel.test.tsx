import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { dataCache } from '../services/dataCache'
import type { UserActivitySummary } from '../api/github'

const mockFetchUserActivity = vi.fn()
const mockInvoke = vi.fn().mockResolvedValue(null)
const mockOpenExternal = vi.fn()

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({
    accounts: [],
  }),
}))

vi.mock('../hooks/useCopilotUsage', () => ({
  useCopilotUsage: () => ({
    quotas: {},
  }),
}))

vi.mock('../api/github', async () => {
  const actual = await vi.importActual<typeof import('../api/github')>('../api/github')
  return {
    ...actual,
    GitHubClient: vi.fn().mockImplementation(() => ({
      fetchUserActivity: mockFetchUserActivity,
    })),
  }
})

import { UserDetailPanel } from './UserDetailPanel'

const sampleActivity: UserActivitySummary = {
  recentPRsAuthored: [
    {
      number: 42,
      title: 'Fix login race',
      repo: 'acme/widgets',
      state: 'open',
      createdAt: '2026-03-10T12:00:00Z',
      updatedAt: '2026-03-11T12:00:00Z',
      url: 'https://github.com/acme/widgets/pull/42',
    },
  ],
  recentPRsReviewed: [
    {
      number: 7,
      title: 'Tighten panel layout',
      repo: 'acme/widgets',
      state: 'merged',
      createdAt: '2026-03-09T12:00:00Z',
      updatedAt: '2026-03-10T12:00:00Z',
      url: 'https://github.com/acme/widgets/pull/7',
    },
  ],
  recentEvents: [
    {
      id: 'evt_123',
      type: 'PushEvent',
      repo: 'acme/widgets',
      createdAt: '2026-03-12T12:00:00Z',
      summary: 'Pushed 3 commits',
    },
  ],
  openPRCount: 1,
  mergedPRCount: 4,
  activeRepos: ['acme/widgets'],
}

describe('UserDetailPanel', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    Object.assign(window, {
      ipcRenderer: { invoke: mockInvoke },
      shell: { openExternal: mockOpenExternal },
    })
    await dataCache.clear()
  })

  it('renders cached activity immediately without refetching', () => {
    dataCache.set('user-activity:acme/octocat', sampleActivity, Date.now())

    render(<UserDetailPanel org="acme" memberLogin="octocat" />)

    expect(screen.getByText('Fix login race')).toBeInTheDocument()
    expect(screen.getByText('Pushed 3 commits')).toBeInTheDocument()
    expect(mockFetchUserActivity).not.toHaveBeenCalled()
  })

  it('loads activity on cache miss and renders fetched results', async () => {
    mockFetchUserActivity.mockResolvedValueOnce(sampleActivity)

    render(<UserDetailPanel org="acme" memberLogin="octocat" />)

    expect(screen.getByText(/Loading activity/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Fix login race')).toBeInTheDocument()
    })

    expect(mockFetchUserActivity).toHaveBeenCalledWith('acme', 'octocat')
    expect(screen.getByText('Pushed 3 commits')).toBeInTheDocument()
  })

  it('surfaces fetch failures in the error banner', async () => {
    mockFetchUserActivity.mockRejectedValueOnce(new Error('boom'))

    render(<UserDetailPanel org="acme" memberLogin="octocat" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load activity: boom')).toBeInTheDocument()
    })
  })
})
