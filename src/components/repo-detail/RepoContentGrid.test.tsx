import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RepoContentGrid } from './RepoContentGrid'
import type { RepoDetail } from '../../api/github'

// Mock window.shell for contributor link clicks
beforeEach(() => {
  window.shell = { openExternal: vi.fn() } as never
})

function makeDetail(overrides: Partial<RepoDetail> = {}): RepoDetail {
  return {
    name: 'test-repo',
    fullName: 'org/test-repo',
    description: 'A test repository',
    url: 'https://github.com/org/test-repo',
    homepage: null,
    language: 'TypeScript',
    defaultBranch: 'main',
    visibility: 'private',
    isArchived: false,
    isFork: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-06-20T14:30:00Z',
    pushedAt: '2024-06-19T09:00:00Z',
    sizeKB: 2048,
    stargazersCount: 42,
    forksCount: 5,
    watchersCount: 10,
    openIssuesCount: 3,
    topics: ['react', 'typescript'],
    license: 'MIT',
    languages: { TypeScript: 50000, JavaScript: 30000, CSS: 20000 },
    recentCommits: [],
    topContributors: [
      {
        login: 'alice',
        name: 'Alice Smith',
        avatarUrl: 'https://avatars.example.com/alice.png',
        contributions: 150,
        url: 'https://github.com/alice',
      },
      {
        login: 'bob',
        name: null,
        avatarUrl: 'https://avatars.example.com/bob.png',
        contributions: 80,
        url: 'https://github.com/bob',
      },
    ],
    openPRCount: 2,
    latestWorkflowRun: null,
    ...overrides,
  }
}

describe('RepoContentGrid', () => {
  it('renders language bar with correct percentages', () => {
    const detail = makeDetail()
    render(<RepoContentGrid detail={detail} />)

    expect(screen.getByText('Languages')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText('JavaScript')).toBeInTheDocument()
    expect(screen.getByText('30.0%')).toBeInTheDocument()
    expect(screen.getByText('CSS')).toBeInTheDocument()
    expect(screen.getByText('20.0%')).toBeInTheDocument()
  })

  it('hides language card when no languages', () => {
    const detail = makeDetail({ languages: {} })
    render(<RepoContentGrid detail={detail} />)

    expect(screen.queryByText('Languages')).not.toBeInTheDocument()
  })

  it('shows "+N more" when more than 8 languages', () => {
    const languages: Record<string, number> = {}
    for (let i = 0; i < 12; i++) {
      languages[`Lang${i}`] = 1000 - i * 10
    }
    const detail = makeDetail({ languages })
    render(<RepoContentGrid detail={detail} />)

    expect(screen.getByText('+4 more')).toBeInTheDocument()
  })

  it('renders contributors with name and login', () => {
    render(<RepoContentGrid detail={makeDetail()} />)

    expect(screen.getByText('Top Contributors')).toBeInTheDocument()
    expect(screen.getByText('Alice Smith (alice)')).toBeInTheDocument()
    // Bob has no name, shows login only
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('150 commits')).toBeInTheDocument()
    expect(screen.getByText('80 commits')).toBeInTheDocument()
  })

  it('opens contributor URL on click', () => {
    render(<RepoContentGrid detail={makeDetail()} />)

    fireEvent.click(screen.getByTitle('alice: 150 commits'))
    expect(window.shell?.openExternal).toHaveBeenCalledWith('https://github.com/alice')
  })

  it('hides contributors card when empty', () => {
    const detail = makeDetail({ topContributors: [] })
    render(<RepoContentGrid detail={detail} />)

    expect(screen.queryByText('Top Contributors')).not.toBeInTheDocument()
  })

  it('renders repository info card', () => {
    render(<RepoContentGrid detail={makeDetail()} />)

    expect(screen.getByText('Repository Info')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('MIT')).toBeInTheDocument()
  })

  it('shows last push date when present', () => {
    render(<RepoContentGrid detail={makeDetail()} />)
    expect(screen.getByText('Last Push')).toBeInTheDocument()
  })

  it('hides last push when null', () => {
    const detail = makeDetail({ pushedAt: null })
    render(<RepoContentGrid detail={detail} />)
    expect(screen.queryByText('Last Push')).not.toBeInTheDocument()
  })

  it('hides license when null', () => {
    const detail = makeDetail({ license: null })
    render(<RepoContentGrid detail={detail} />)
    expect(screen.queryByText('License')).not.toBeInTheDocument()
  })
})
