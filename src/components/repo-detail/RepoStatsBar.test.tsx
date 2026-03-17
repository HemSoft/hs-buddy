import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RepoDetail } from '../../api/github'
import { RepoStatsBar } from './RepoStatsBar'

function makeDetail(overrides: Partial<RepoDetail> = {}): RepoDetail {
  return {
    name: 'test-repo',
    fullName: 'org/test-repo',
    description: 'A test repo',
    url: 'https://github.com/org/test-repo',
    homepage: null,
    language: 'TypeScript',
    defaultBranch: 'main',
    visibility: 'public',
    isArchived: false,
    isFork: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    pushedAt: '2024-06-01T00:00:00Z',
    sizeKB: 512,
    stargazersCount: 42,
    forksCount: 7,
    watchersCount: 15,
    openIssuesCount: 3,
    topics: [],
    license: 'MIT',
    languages: { TypeScript: 80, CSS: 20 },
    recentCommits: [],
    topContributors: [],
    openPRCount: 0,
    latestWorkflowRun: null,
    ...overrides,
  }
}

describe('RepoStatsBar', () => {
  it('renders stars, forks, watching, and issues labels', () => {
    render(<RepoStatsBar detail={makeDetail()} />)

    expect(screen.getByText('stars')).toBeInTheDocument()
    expect(screen.getByText('forks')).toBeInTheDocument()
    expect(screen.getByText('watching')).toBeInTheDocument()
    expect(screen.getByText('issues')).toBeInTheDocument()
  })

  it('renders the numeric stat values', () => {
    render(
      <RepoStatsBar
        detail={makeDetail({
          stargazersCount: 42,
          forksCount: 7,
          watchersCount: 15,
          openIssuesCount: 3,
        })}
      />
    )

    expect(screen.getByTitle('Stars')).toHaveTextContent('42')
    expect(screen.getByTitle('Forks')).toHaveTextContent('7')
    expect(screen.getByTitle('Watchers')).toHaveTextContent('15')
    expect(screen.getByTitle('Open Issues')).toHaveTextContent('3')
  })

  it('formats large numbers with locale string', () => {
    render(<RepoStatsBar detail={makeDetail({ stargazersCount: 12345 })} />)

    expect(screen.getByTitle('Stars')).toHaveTextContent('12,345')
  })

  it('shows the PR stat when openPRCount is greater than zero', () => {
    render(<RepoStatsBar detail={makeDetail({ openPRCount: 5 })} />)

    expect(screen.getByTitle('Open Pull Requests')).toBeInTheDocument()
    expect(screen.getByText('PRs')).toBeInTheDocument()
    expect(screen.getByTitle('Open Pull Requests')).toHaveTextContent('5')
  })

  it('hides the PR stat when openPRCount is zero', () => {
    render(<RepoStatsBar detail={makeDetail({ openPRCount: 0 })} />)

    expect(screen.queryByTitle('Open Pull Requests')).not.toBeInTheDocument()
    expect(screen.queryByText('PRs')).not.toBeInTheDocument()
  })

  it('renders the formatted repository size', () => {
    render(<RepoStatsBar detail={makeDetail({ sizeKB: 512 })} />)

    expect(screen.getByTitle('Repository Size')).toHaveTextContent('512 KB')
  })

  it('renders size in MB for repos over 1024 KB', () => {
    render(<RepoStatsBar detail={makeDetail({ sizeKB: 2048 })} />)

    expect(screen.getByTitle('Repository Size')).toHaveTextContent('2.0 MB')
  })

  it('renders the default branch name', () => {
    render(<RepoStatsBar detail={makeDetail({ defaultBranch: 'develop' })} />)

    expect(screen.getByTitle('Default Branch')).toHaveTextContent('develop')
  })

  it('has correct title attributes for accessibility', () => {
    render(<RepoStatsBar detail={makeDetail({ openPRCount: 1 })} />)

    expect(screen.getByTitle('Stars')).toBeInTheDocument()
    expect(screen.getByTitle('Forks')).toBeInTheDocument()
    expect(screen.getByTitle('Watchers')).toBeInTheDocument()
    expect(screen.getByTitle('Open Issues')).toBeInTheDocument()
    expect(screen.getByTitle('Open Pull Requests')).toBeInTheDocument()
    expect(screen.getByTitle('Repository Size')).toBeInTheDocument()
    expect(screen.getByTitle('Default Branch')).toBeInTheDocument()
  })

  it('renders zero values correctly', () => {
    render(
      <RepoStatsBar
        detail={makeDetail({
          stargazersCount: 0,
          forksCount: 0,
          watchersCount: 0,
          openIssuesCount: 0,
        })}
      />
    )

    expect(screen.getByTitle('Stars')).toHaveTextContent('0')
    expect(screen.getByTitle('Forks')).toHaveTextContent('0')
    expect(screen.getByTitle('Watchers')).toHaveTextContent('0')
    expect(screen.getByTitle('Open Issues')).toHaveTextContent('0')
  })
})
