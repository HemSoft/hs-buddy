import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockEnqueue, mockCacheGet, stableAccounts } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
  usePRSettings: () => ({ refreshInterval: 0 }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoDetail: vi.fn(),
  })),
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: () => false,
  throwIfAborted: () => {},
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
}))

vi.mock('./repo-detail/RepoStatsBar', () => ({
  RepoStatsBar: () => <div data-testid="repo-stats-bar" />,
}))

vi.mock('./repo-detail/RepoContentGrid', () => ({
  RepoContentGrid: () => <div data-testid="repo-content-grid" />,
}))

import { RepoDetailPanel } from './RepoDetailPanel'
import * as errorUtils from '../utils/errorUtils'
import * as configHooks from '../hooks/useConfig'

function makeRepoDetail(overrides = {}) {
  return {
    name: 'hs-buddy',
    description: 'A productivity companion',
    url: 'https://github.com/test-org/hs-buddy',
    homepage: 'https://hs-buddy.dev',
    visibility: 'public',
    isArchived: false,
    isFork: false,
    language: 'TypeScript',
    license: 'MIT',
    topics: ['electron', 'typescript'],
    latestWorkflowRun: null,
    ...overrides,
  }
}

describe('RepoDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheGet.mockReturnValue(null)
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('shows loading state initially', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {}))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)
    expect(screen.getByText('Loading repository details...')).toBeInTheDocument()
    expect(screen.getByText('test-org/hs-buddy')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('Not found'))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load repository')).toBeInTheDocument()
    })
    expect(screen.getByText('Not found')).toBeInTheDocument()
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('renders repo detail after loading', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('A productivity companion')).toBeInTheDocument()
    })
  })

  it('displays visibility badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ visibility: 'public' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument()
    })
  })

  it('displays private visibility badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ visibility: 'private' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('private')).toBeInTheDocument()
    })
  })

  it('displays internal visibility badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ visibility: 'internal' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('internal')).toBeInTheDocument()
    })
  })

  it('shows archived badge when repo is archived', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ isArchived: true }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument()
    })
  })

  it('shows fork badge when repo is a fork', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ isFork: true }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Fork')).toBeInTheDocument()
    })
  })

  it('shows language badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ language: 'TypeScript' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('TypeScript')).toBeInTheDocument()
    })
  })

  it('shows license badge', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ license: 'MIT' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('MIT')).toBeInTheDocument()
    })
  })

  it('renders topics', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('electron')).toBeInTheDocument()
      expect(screen.getByText('typescript')).toBeInTheDocument()
    })
  })

  it('opens GitHub URL on button click', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test-org/hs-buddy')
  })

  it('shows homepage button when present', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Homepage')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Homepage'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://hs-buddy.dev')
  })

  it('does not show homepage button when absent', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ homepage: null }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    })
    expect(screen.queryByText('Homepage')).not.toBeInTheDocument()
  })

  it('renders RepoStatsBar and RepoContentGrid', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByTestId('repo-stats-bar')).toBeInTheDocument()
      expect(screen.getByTestId('repo-content-grid')).toBeInTheDocument()
    })
  })

  it('uses cached data when available', async () => {
    const cachedDetail = makeRepoDetail({ description: 'From cache' })
    mockCacheGet.mockReturnValue({ data: cachedDetail })
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('From cache')).toBeInTheDocument()
    })
    // Enqueue should not be called since cache was used
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('retries fetch on retry button click', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('Temp fail'))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load repository')).toBeInTheDocument()
    })

    mockEnqueue.mockResolvedValueOnce(makeRepoDetail({ description: 'After retry' }))
    fireEvent.click(screen.getByText(/Retry/))

    await waitFor(() => {
      expect(screen.getByText('After retry')).toBeInTheDocument()
    })
  })

  it('refreshes on refresh button click', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByTitle('Refresh')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Refresh'))
    expect(mockEnqueue).toHaveBeenCalledTimes(2)
  })

  it('hides description when not provided', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ description: null }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('hs-buddy')).toBeInTheDocument()
    })
    expect(document.querySelector('.repo-detail-description')).toBeNull()
  })

  it('hides language badge when not provided', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ language: null }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('test-org')).toBeInTheDocument()
    })
    expect(document.querySelector('.repo-badge-lang')).toBeNull()
  })

  it('hides license badge when not provided', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ license: null }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('test-org')).toBeInTheDocument()
    })
    expect(document.querySelector('.repo-badge-license')).toBeNull()
  })

  it('hides topics section when topics list is empty', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ topics: [] }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('test-org')).toBeInTheDocument()
    })
    expect(document.querySelector('.repo-detail-topics')).toBeNull()
  })

  it('shows workflow status badge when latestWorkflowRun is present', async () => {
    mockEnqueue.mockResolvedValue(
      makeRepoDetail({
        latestWorkflowRun: {
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          url: 'https://github.com/test-org/hs-buddy/actions/runs/1',
        },
      })
    )
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(document.querySelector('.repo-badge-ci')).toBeInTheDocument()
    })
  })

  it('opens workflow URL when CI badge is clicked', async () => {
    mockEnqueue.mockResolvedValue(
      makeRepoDetail({
        latestWorkflowRun: {
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          url: 'https://github.com/test-org/hs-buddy/actions/runs/1',
        },
      })
    )
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(document.querySelector('.repo-badge-ci')).toBeInTheDocument()
    })

    fireEvent.click(document.querySelector('.repo-badge-ci') as HTMLElement)
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/actions/runs/1'
    )
  })

  it('opens workflow URL on CI badge keyboard Enter', async () => {
    mockEnqueue.mockResolvedValue(
      makeRepoDetail({
        latestWorkflowRun: {
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          url: 'https://github.com/test-org/hs-buddy/actions/runs/1',
        },
      })
    )
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(document.querySelector('.repo-badge-ci')).toBeInTheDocument()
    })

    fireEvent.keyDown(document.querySelector('.repo-badge-ci') as HTMLElement, { key: 'Enter' })
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/actions/runs/1'
    )
  })

  it('shows owner and repo in header', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail())
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('test-org')).toBeInTheDocument()
      expect(screen.getByText('hs-buddy')).toBeInTheDocument()
    })
  })

  it('silently ignores abort errors without showing error state', async () => {
    const abortSpy = vi.spyOn(errorUtils, 'isAbortError').mockReturnValue(true)
    mockEnqueue.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const { container } = render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.queryByText('Loading repository details...')).not.toBeInTheDocument()
    })

    expect(screen.queryByText('Failed to load repository')).not.toBeInTheDocument()
    expect(container.innerHTML).toBe('')

    abortSpy.mockRestore()
  })

  it('sets up auto-refresh interval when refreshInterval is positive', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const prSpy = vi.spyOn(configHooks, 'usePRSettings').mockReturnValue({
      refreshInterval: 5,
    } as ReturnType<typeof configHooks.usePRSettings>)
    mockEnqueue.mockResolvedValue(makeRepoDetail())

    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('A productivity companion')).toBeInTheDocument()
    })

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000)

    setIntervalSpy.mockRestore()
    prSpy.mockRestore()
  })

  it('opens workflow URL on CI badge keyboard Space', async () => {
    mockEnqueue.mockResolvedValue(
      makeRepoDetail({
        latestWorkflowRun: {
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          url: 'https://github.com/test-org/hs-buddy/actions/runs/1',
        },
      })
    )
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(document.querySelector('.repo-badge-ci')).toBeInTheDocument()
    })

    fireEvent.keyDown(document.querySelector('.repo-badge-ci') as HTMLElement, { key: ' ' })
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/actions/runs/1'
    )
  })

  it('renders Building2 icon for internal visibility', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ visibility: 'internal' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('internal')).toBeInTheDocument()
    })

    const badge = screen.getByText('internal').closest('.repo-badge')
    expect(badge).toHaveClass('repo-badge-internal')
  })

  it('shows spinner on refresh button while loading', async () => {
    let resolveSecondFetch!: (value: ReturnType<typeof makeRepoDetail>) => void
    mockEnqueue.mockResolvedValueOnce(makeRepoDetail()).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSecondFetch = resolve
        })
    )

    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByTitle('Refresh')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Refresh'))

    await waitFor(() => {
      const refreshBtn = screen.getByTitle('Refresh')
      expect(refreshBtn).toBeDisabled()
      const svg = refreshBtn.querySelector('svg')
      expect(svg?.classList.contains('spin')).toBe(true)
    })

    resolveSecondFetch(makeRepoDetail())
    await waitFor(() => {
      expect(screen.getByTitle('Refresh')).not.toBeDisabled()
    })
  })

  it('calls openExternal when homepage button is clicked', async () => {
    mockEnqueue.mockResolvedValue(makeRepoDetail({ homepage: 'https://example.com' }))
    render(<RepoDetailPanel owner="test-org" repo="hs-buddy" />)

    await waitFor(() => {
      expect(screen.getByText('Homepage')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Homepage'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://example.com')
  })
})
