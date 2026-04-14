import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoCommitDetailPanel } from './RepoCommitDetailPanel'
import type { RepoCommitDetail } from '../api/github'

/* ── mocks ── */
const mockEnqueue = vi.fn()
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockAccounts = [{ username: 'user', token: 'tok', org: 'org' }]

vi.mock('../services/dataCache', () => ({
  dataCache: {
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
  },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    fetchRepoCommitDetail: vi.fn().mockResolvedValue(null),
  })),
}))

vi.mock('../hooks/useConfig', () => ({
  useGitHubAccounts: () => ({ accounts: mockAccounts }),
}))

vi.mock('../hooks/useTaskQueue', () => ({
  useTaskQueue: () => ({ enqueue: mockEnqueue }),
}))

vi.mock('../utils/dateUtils', () => ({
  formatDistanceToNow: () => '3 hours ago',
}))

vi.mock('../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
  isAbortError: () => false,
  throwIfAborted: vi.fn(),
}))

vi.mock('../utils/diffUtils', () => ({
  getDiffLineClass: (line: string) => {
    if (line.startsWith('@@')) return 'hunk'
    if (line.startsWith('+')) return 'added'
    if (line.startsWith('-')) return 'removed'
    return 'context'
  },
}))

vi.mock('../utils/githubUrl', () => ({
  formatFileStatus: (s: string) => s.toUpperCase(),
}))

vi.mock('./RepoDetailPanel.css', () => ({}))
vi.mock('./RepoCommitPanels.css', () => ({}))

/* ── test data ── */
const mockDetail: RepoCommitDetail = {
  sha: 'abc1234567890def',
  message: 'fix: resolve login issue\n\nExtended body description',
  messageHeadline: 'fix: resolve login issue',
  author: 'alice',
  authorAvatarUrl: 'https://avatar.test/alice',
  authoredDate: '2024-01-15T10:00:00Z',
  committedDate: '2024-01-15T10:05:00Z',
  url: 'https://github.com/org/repo/commit/abc1234567890def',
  parents: [{ sha: 'parent123', url: 'https://github.com/org/repo/commit/parent123' }],
  stats: { additions: 10, deletions: 3, total: 13 },
  files: [
    {
      filename: 'src/app.ts',
      previousFilename: null,
      status: 'modified',
      additions: 7,
      deletions: 2,
      changes: 9,
      patch: '@@ -1,5 +1,10 @@\n context\n-old line\n+new line',
      blobUrl: 'https://github.com/org/repo/blob/abc123/src/app.ts',
    },
    {
      filename: 'src/utils.ts',
      previousFilename: null,
      status: 'added',
      additions: 3,
      deletions: 1,
      changes: 4,
      patch: null,
      blobUrl: null,
    },
  ],
}

const mockDetailNoFiles: RepoCommitDetail = {
  ...mockDetail,
  files: [],
  stats: { additions: 0, deletions: 0, total: 0 },
}

describe('RepoCommitDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
    mockEnqueue.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) =>
      fn(new AbortController().signal)
    )
  })

  it('shows loading state with SHA reference', () => {
    mockEnqueue.mockReturnValue(new Promise(() => {})) // never resolves
    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    expect(screen.getByText('Loading commit...')).toBeInTheDocument()
    expect(screen.getByText('org/repo@abc1234')).toBeInTheDocument()
  })

  it('renders commit detail after fetch', async () => {
    mockEnqueue.mockImplementation(async () => mockDetail)

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login issue')).toBeInTheDocument()
    })
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('abc1234567890def')).toBeInTheDocument()
    expect(screen.getAllByText('3 hours ago').length).toBeGreaterThanOrEqual(1)
  })

  it('uses cached data when available', () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    expect(screen.getByText('fix: resolve login issue')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('shows error state on fetch failure with retry button', async () => {
    mockEnqueue.mockReset()
    mockEnqueue.mockRejectedValue(new Error('Network error'))

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load commit')).toBeInTheDocument()
    })
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('shows file stats (additions, deletions, file count)', async () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    expect(screen.getByText('+10')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
    // file count in the stats grid
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('toggles file expansion when file header is clicked', async () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    const fileHeader = screen.getByText('src/app.ts').closest('[role="button"]')!
    expect(fileHeader).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(fileHeader)
    expect(fileHeader).toHaveAttribute('aria-expanded', 'true')

    // diff content should be visible
    expect(screen.getByText('+new line')).toBeInTheDocument()

    // click again to collapse
    fireEvent.click(fileHeader)
    expect(fileHeader).toHaveAttribute('aria-expanded', 'false')
  })

  it('resets expanded files when SHA changes', async () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    const { rerender } = render(
      <RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />
    )

    // expand a file
    const fileHeader = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.click(fileHeader)
    expect(fileHeader).toHaveAttribute('aria-expanded', 'true')

    // re-render with a different SHA
    rerender(<RepoCommitDetailPanel owner="org" repo="repo" sha="newsha999" />)

    await waitFor(() => {
      const updatedHeader = screen.queryByText('src/app.ts')?.closest('[role="button"]')
      if (updatedHeader) {
        expect(updatedHeader).toHaveAttribute('aria-expanded', 'false')
      }
    })
  })

  it('shows empty file list when commit has no files', () => {
    mockGet.mockReturnValue({ data: mockDetailNoFiles, fetchedAt: Date.now() })

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    expect(screen.getByText('fix: resolve login issue')).toBeInTheDocument()
    // Stats should show zeros
    expect(screen.getByText('+0')).toBeInTheDocument()
    expect(screen.getByText('-0')).toBeInTheDocument()
    // No file headers rendered
    expect(screen.queryByRole('button', { name: /src\// })).not.toBeInTheDocument()
  })

  it('shows message body when it differs from headline', () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    const preBlock = document.querySelector('.repo-commit-message-body')
    expect(preBlock).toBeInTheDocument()
    expect(preBlock!.textContent).toBe('fix: resolve login issue\n\nExtended body description')
  })

  it('shows "no patch" message for file without patch when expanded', () => {
    mockGet.mockReturnValue({ data: mockDetail, fetchedAt: Date.now() })

    render(<RepoCommitDetailPanel owner="org" repo="repo" sha="abc1234567890def" />)

    const fileHeader = screen.getByText('src/utils.ts').closest('[role="button"]')!
    fireEvent.click(fileHeader)

    expect(screen.getByText(/GitHub did not provide a patch preview/)).toBeInTheDocument()
  })
})
