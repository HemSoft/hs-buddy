import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockEnqueue = vi.fn()
const mockAccounts = [{ username: 'alice', org: 'acme' }]
const mockIsFresh = vi.fn().mockReturnValue(false)
const mockCacheGet = vi.fn().mockReturnValue(null)
const mockCacheSet = vi.fn()
const mockFetchPRFilesChanged = vi.fn()

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts, loading: false }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../services/dataCache', () => ({
  dataCache: {
    isFresh: (...args: unknown[]) => mockIsFresh(...args),
    get: (...args: unknown[]) => mockCacheGet(...args),
    set: (...args: unknown[]) => mockCacheSet(...args),
  },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return {
      fetchPRFilesChanged: (...args: unknown[]) => mockFetchPRFilesChanged(...args),
    }
  }),
}))

import { PRFilesChangedPanel } from './PRFilesChangedPanel'
import type { PRDetailInfo } from '../utils/prDetailView'

const makePR = (overrides: Partial<PRDetailInfo> = {}): PRDetailInfo => ({
  source: 'GitHub',
  repository: 'repo',
  id: 1,
  title: 'Fix',
  author: 'alice',
  url: 'https://github.com/acme/repo/pull/1',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: '2026-01-01',
  date: '2026-01-01',
  org: 'acme',
  ...overrides,
})

describe('PRFilesChangedPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheGet.mockReturnValue(null)
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController()
      return fn(controller.signal)
    })
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('renders loading state initially', () => {
    mockEnqueue.mockImplementation(() => new Promise(() => {}))

    render(<PRFilesChangedPanel pr={makePR()} />)
    expect(screen.getByText('Loading changed files...')).toBeInTheDocument()
  })

  it('renders error state with retry', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('fetch failed'))

    render(<PRFilesChangedPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load changed files')).toBeInTheDocument()
    })
    expect(screen.getByText('fetch failed')).toBeInTheDocument()
  })

  it('renders files changed data', async () => {
    const filesData = {
      additions: 50,
      deletions: 10,
      changes: 60,
      files: [
        {
          filename: 'src/app.ts',
          status: 'modified',
          additions: 30,
          deletions: 5,
          changes: 35,
          patch: '+added line\n-removed line',
          blobUrl: 'https://github.com/acme/repo/blob/main/src/app.ts',
          previousFilename: null,
        },
        {
          filename: 'src/new.ts',
          status: 'added',
          additions: 20,
          deletions: 5,
          changes: 25,
          patch: '+new file content',
          blobUrl: null,
          previousFilename: null,
        },
      ],
    }

    mockFetchPRFilesChanged.mockResolvedValue(filesData)

    render(<PRFilesChangedPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    })

    expect(screen.getByText('src/new.ts')).toBeInTheDocument()
    expect(screen.getByText('+50')).toBeInTheDocument()
    expect(screen.getByText('-10')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('toggles file expansion to show diff', async () => {
    const filesData = {
      additions: 1,
      deletions: 0,
      changes: 1,
      files: [
        {
          filename: 'src/test.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: '+new line added',
          blobUrl: null,
          previousFilename: null,
        },
      ],
    }

    mockFetchPRFilesChanged.mockResolvedValue(filesData)

    render(<PRFilesChangedPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('src/test.ts')).toBeInTheDocument()
    })

    // Diff is collapsed initially
    expect(screen.queryByText('+new line added')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(screen.getByText('src/test.ts'))

    await waitFor(() => {
      expect(screen.getByText('+new line added')).toBeInTheDocument()
    })

    // Click again to collapse
    fireEvent.click(screen.getByText('src/test.ts'))

    await waitFor(() => {
      expect(screen.queryByText('+new line added')).not.toBeInTheDocument()
    })
  })

  it('renders empty state when no files changed', async () => {
    const filesData = {
      additions: 0,
      deletions: 0,
      changes: 0,
      files: [],
    }

    mockFetchPRFilesChanged.mockResolvedValue(filesData)

    render(<PRFilesChangedPanel pr={makePR()} />)

    await waitFor(() => {
      expect(
        screen.getByText('No changed files were reported for this pull request.')
      ).toBeInTheDocument()
    })
  })

  it('uses cached data when available', () => {
    const cachedData = {
      data: {
        additions: 5,
        deletions: 2,
        changes: 7,
        files: [
          {
            filename: 'cached.ts',
            status: 'modified',
            additions: 5,
            deletions: 2,
            changes: 7,
            patch: null,
            blobUrl: null,
            previousFilename: null,
          },
        ],
      },
    }

    mockCacheGet.mockReturnValue(cachedData)

    render(<PRFilesChangedPanel pr={makePR()} />)

    expect(screen.getByText('cached.ts')).toBeInTheDocument()
  })

  it('renders no-patch message when patch is null', async () => {
    const filesData = {
      additions: 0,
      deletions: 0,
      changes: 0,
      files: [
        {
          filename: 'binary.png',
          status: 'modified',
          additions: 0,
          deletions: 0,
          changes: 0,
          patch: null,
          blobUrl: null,
          previousFilename: null,
        },
      ],
    }

    mockFetchPRFilesChanged.mockResolvedValue(filesData)

    render(<PRFilesChangedPanel pr={makePR()} />)

    await waitFor(() => {
      expect(screen.getByText('binary.png')).toBeInTheDocument()
    })

    // Expand the file
    fireEvent.click(screen.getByText('binary.png'))

    await waitFor(() => {
      expect(screen.getByText(/GitHub did not provide a patch preview/)).toBeInTheDocument()
    })
  })
})
