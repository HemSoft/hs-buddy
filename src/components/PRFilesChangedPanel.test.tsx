import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PRDetailInfo } from '../utils/prDetailView'

const { mockEnqueue, mockCacheGet, stableAccounts } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCacheGet: vi.fn(),
  stableAccounts: [{ username: 'alice', org: 'test-org' }],
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: stableAccounts, loading: false }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: { get: mockCacheGet, set: vi.fn(), isFresh: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchPRFilesChanged: vi.fn(),
  })),
}))

vi.mock('../utils/githubUrl', () => ({
  formatFileStatus: (s: string) => s.toUpperCase(),
  parseOwnerRepoFromUrl: (url: string) => {
    if (url === 'invalid://url') return null
    return { owner: 'test-org', repo: 'hs-buddy' }
  },
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  isAbortError: () => false,
  throwIfAborted: () => {},
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
}))

import { PRFilesChangedPanel } from './PRFilesChangedPanel'

const defaultPr: PRDetailInfo = {
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 42,
  title: 'Fix login bug',
  author: 'octocat',
  url: 'https://github.com/test-org/hs-buddy/pull/42',
  state: 'OPEN',
  approvalCount: 1,
  assigneeCount: 0,
  iApproved: false,
  created: '2025-06-01T10:00:00Z',
  date: null,
  org: 'test-org',
}

function makeFilesChangedSummary(overrides = {}) {
  return {
    additions: 10,
    deletions: 5,
    changes: 15,
    files: [
      {
        filename: 'src/app.ts',
        status: 'modified',
        additions: 8,
        deletions: 3,
        changes: 11,
        patch: '@@ -1,3 +1,4 @@\n-old\n+new\n context',
        blobUrl: 'https://github.com/test-org/hs-buddy/blob/abc/src/app.ts',
        previousFilename: null,
      },
      {
        filename: 'src/utils.ts',
        status: 'added',
        additions: 2,
        deletions: 2,
        changes: 4,
        patch: null,
        blobUrl: null,
        previousFilename: null,
      },
    ],
    ...overrides,
  }
}

describe('PRFilesChangedPanel', () => {
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
    render(<PRFilesChangedPanel pr={defaultPr} />)
    expect(screen.getByText('Loading changed files...')).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    mockEnqueue.mockRejectedValue(new Error('API error'))
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load changed files')).toBeInTheDocument()
    })
    expect(screen.getByText('API error')).toBeInTheDocument()
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('renders file summary grid after loading', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument() // Files count
    })
    expect(screen.getByText('+10')).toBeInTheDocument()
    expect(screen.getByText('-5')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('renders file cards with status and name', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
  })

  it('toggles file expansion on click', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    // Click file header to expand
    fireEvent.click(screen.getByText('src/app.ts').closest('[role="button"]')!)
    // Diff content should be visible
    expect(screen.getByText('-old')).toBeInTheDocument()
    expect(screen.getByText('+new')).toBeInTheDocument()

    // Click again to collapse
    fireEvent.click(screen.getByText('src/app.ts').closest('[role="button"]')!)
    expect(screen.queryByText('-old')).not.toBeInTheDocument()
  })

  it('handles keyboard expansion via Enter key', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(screen.getByText('-old')).toBeInTheDocument()
  })

  it('shows no-patch message for binary/large files', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
    })

    // Expand the file without a patch
    fireEvent.click(screen.getByText('src/utils.ts').closest('[role="button"]')!)
    expect(screen.getByText(/GitHub did not provide a patch preview/)).toBeInTheDocument()
  })

  it('shows empty state when no files changed', async () => {
    mockEnqueue.mockResolvedValue({ ...makeFilesChangedSummary(), files: [] })
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText(/No changed files were reported/)).toBeInTheDocument()
    })
  })

  it('opens external file link', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const openBtn = screen.getAllByTitle('Open file on GitHub')[0]
    fireEvent.click(openBtn)
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/test-org/hs-buddy/blob/abc/src/app.ts'
    )
  })

  it('displays per-file stats', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('+8')).toBeInTheDocument()
      expect(screen.getByText('-3')).toBeInTheDocument()
      expect(screen.getByText('11 changes')).toBeInTheDocument()
    })
  })

  it('uses cached data when available', () => {
    mockCacheGet.mockReturnValue({ data: makeFilesChangedSummary() })
    render(<PRFilesChangedPanel pr={defaultPr} />)
    // Should immediately show data without loading
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    expect(screen.queryByText('Loading changed files...')).not.toBeInTheDocument()
  })

  it('shows error when URL cannot be parsed', async () => {
    mockCacheGet.mockReturnValue(null)
    const badPr = { ...defaultPr, url: 'invalid://url' }
    render(<PRFilesChangedPanel pr={badPr} />)

    await waitFor(() => {
      expect(screen.getByText(/Could not parse owner\/repo/)).toBeInTheDocument()
    })
  })

  it('shows refresh indicator when loading with existing data', async () => {
    // First load succeeds
    let resolveSecond: (value: unknown) => void
    mockEnqueue.mockResolvedValueOnce(makeFilesChangedSummary()).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSecond = resolve
        })
    )
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    // Click refresh to trigger loading with existing data
    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(screen.getByText('Refreshing changed files...')).toBeInTheDocument()
    })

    // Resolve second request
    resolveSecond!(makeFilesChangedSummary())
  })

  it('shows previousFilename when file was renamed', async () => {
    mockEnqueue.mockResolvedValue(
      makeFilesChangedSummary({
        files: [
          {
            filename: 'src/newName.ts',
            status: 'renamed',
            additions: 0,
            deletions: 0,
            changes: 0,
            patch: null,
            blobUrl: null,
            previousFilename: 'src/oldName.ts',
          },
        ],
      })
    )
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('from src/oldName.ts')).toBeInTheDocument()
    })
  })

  it('handles Space key for file expansion', async () => {
    mockEnqueue.mockResolvedValue(makeFilesChangedSummary())
    render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: ' ' })
    expect(screen.getByText('-old')).toBeInTheDocument()
  })

  it('returns null when detail is null and not loading/error', async () => {
    // This tests the null detail guard at line 131
    mockCacheGet.mockReturnValue(null)
    mockEnqueue.mockResolvedValue(null)
    const { container } = render(<PRFilesChangedPanel pr={defaultPr} />)

    await waitFor(() => {
      expect(screen.queryByText('Loading changed files...')).not.toBeInTheDocument()
    })
    // Container should be empty since detail is null with no error
    expect(container.querySelector('.pr-files-container')).not.toBeInTheDocument()
  })
})
