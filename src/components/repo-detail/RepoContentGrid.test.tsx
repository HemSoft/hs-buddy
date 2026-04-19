import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RepoContentGrid } from './RepoContentGrid'
import type { RepoDetail } from '../../api/github'

const mockOpenExternal = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'shell', {
    value: { openExternal: mockOpenExternal },
    writable: true,
    configurable: true,
  })
})

function makeDetail(overrides: Partial<RepoDetail> = {}): RepoDetail {
  return {
    name: 'my-repo',
    fullName: 'org/my-repo',
    description: 'A test repo',
    url: 'https://github.com/org/my-repo',
    homepage: null,
    language: 'TypeScript',
    defaultBranch: 'main',
    visibility: 'public',
    isArchived: false,
    isFork: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    pushedAt: '2025-01-10T00:00:00Z',
    sizeKB: 15000,
    stargazersCount: 42,
    forksCount: 10,
    watchersCount: 5,
    openIssuesCount: 3,
    topics: ['typescript', 'react'],
    license: 'MIT',
    languages: { TypeScript: 80000, JavaScript: 15000, CSS: 5000 },
    recentCommits: [],
    topContributors: [
      {
        login: 'dev1',
        name: 'Developer One',
        avatarUrl: 'https://avatars.example.com/dev1.png',
        contributions: 150,
        url: 'https://github.com/dev1',
      },
    ],
    openPRCount: 2,
    latestWorkflowRun: null,
    ...overrides,
  }
}

describe('RepoContentGrid', () => {
  it('renders language bar with language entries', () => {
    render(<RepoContentGrid detail={makeDetail()} />)
    expect(screen.getByText('Languages')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('JavaScript')).toBeInTheDocument()
    expect(screen.getByText('CSS')).toBeInTheDocument()
  })

  it('renders language percentages', () => {
    render(<RepoContentGrid detail={makeDetail()} />)
    expect(screen.getByText('80.0%')).toBeInTheDocument()
    expect(screen.getByText('15.0%')).toBeInTheDocument()
    expect(screen.getByText('5.0%')).toBeInTheDocument()
  })

  it('renders top contributors section', () => {
    render(<RepoContentGrid detail={makeDetail()} />)
    expect(screen.getByText('Top Contributors')).toBeInTheDocument()
    expect(screen.getByText('Developer One (dev1)')).toBeInTheDocument()
    expect(screen.getByText('150 commits')).toBeInTheDocument()
  })

  it('opens contributor URL on click', () => {
    render(<RepoContentGrid detail={makeDetail()} />)
    fireEvent.click(screen.getByText('Developer One (dev1)').closest('button')!)
    expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com/dev1')
  })

  it('renders repository info section', () => {
    render(<RepoContentGrid detail={makeDetail()} />)
    expect(screen.getByText('Repository Info')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('MIT')).toBeInTheDocument()
  })

  it('renders last push date when pushedAt is present', () => {
    render(<RepoContentGrid detail={makeDetail()} />)
    expect(screen.getByText('Last Push')).toBeInTheDocument()
  })

  it('omits last push section when pushedAt is null', () => {
    render(<RepoContentGrid detail={makeDetail({ pushedAt: null })} />)
    expect(screen.queryByText('Last Push')).not.toBeInTheDocument()
  })

  it('omits license when null', () => {
    render(<RepoContentGrid detail={makeDetail({ license: null })} />)
    expect(screen.queryByText('License')).not.toBeInTheDocument()
  })

  it('omits languages card when no languages', () => {
    render(<RepoContentGrid detail={makeDetail({ languages: {} })} />)
    expect(screen.queryByText('Languages')).not.toBeInTheDocument()
  })

  it('omits contributors card when no contributors', () => {
    render(<RepoContentGrid detail={makeDetail({ topContributors: [] })} />)
    expect(screen.queryByText('Top Contributors')).not.toBeInTheDocument()
  })

  it('shows +N more when there are more than 8 languages', () => {
    const langs: Record<string, number> = {}
    for (let i = 0; i < 10; i++) {
      langs[`Lang${i}`] = 1000 - i * 100
    }

    render(<RepoContentGrid detail={makeDetail({ languages: langs })} />)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('displays contributor login only when name is null', () => {
    render(
      <RepoContentGrid
        detail={makeDetail({
          topContributors: [
            {
              login: 'bot',
              name: null,
              avatarUrl: 'https://avatars.example.com/bot.png',
              contributions: 50,
              url: 'https://github.com/bot',
            },
          ],
        })}
      />
    )
    expect(screen.getByText('bot')).toBeInTheDocument()
  })

  it('sets language percentage to 0 when totalBytes is 0', () => {
    render(<RepoContentGrid detail={makeDetail({ languages: { TypeScript: 0 } })} />)
    expect(screen.getByText('Languages')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })
})
