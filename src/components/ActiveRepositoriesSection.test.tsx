import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RepositoryActivitySummary } from '../api/github'
import { ActiveRepositoriesSection } from './ActiveRepositoriesSection'

function makeActivity(
  overrides: Partial<RepositoryActivitySummary> = {}
): RepositoryActivitySummary {
  return {
    repositories: [
      {
        name: 'hs-buddy',
        fullName: 'HemSoft/hs-buddy',
        url: 'https://github.com/HemSoft/hs-buddy',
        updatedAt: '2030-01-02T12:00:00Z',
        issues: [
          {
            number: 604,
            title: 'Add an Active repositories workbench',
            url: 'https://github.com/HemSoft/hs-buddy/issues/604',
            state: 'open',
            updatedAt: '2030-01-02T11:00:00Z',
          },
        ],
        pullRequests: [
          {
            number: 605,
            title: 'Build the repository workbench',
            url: 'https://github.com/HemSoft/hs-buddy/pull/605',
            state: 'draft',
            updatedAt: '2030-01-02T12:00:00Z',
          },
        ],
      },
      {
        name: 'codexbar-ios',
        fullName: 'HemSoft/codexbar-ios',
        url: 'https://github.com/HemSoft/codexbar-ios',
        updatedAt: '2030-01-01T12:00:00Z',
        issues: [],
        pullRequests: [
          {
            number: 90,
            title: 'Ship weekly usage',
            url: 'https://github.com/HemSoft/codexbar-ios/pull/90',
            state: 'merged',
            updatedAt: '2030-01-01T12:00:00Z',
          },
        ],
      },
    ],
    issuesAvailable: true,
    pullRequestsAvailable: true,
    hasMore: false,
    fetchedAt: '2030-01-02T12:00:00Z',
    ...overrides,
  }
}

const openExternal = vi.fn()
const onRefresh = vi.fn()

function renderSection(
  activity: RepositoryActivitySummary | null = makeActivity(),
  phase: 'loading' | 'refreshing' | 'ready' | 'error' = 'ready'
) {
  return render(
    <ActiveRepositoriesSection
      org="HemSoft"
      activity={activity}
      phase={phase}
      onRefresh={onRefresh}
    />
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-01-02T13:00:00Z'))
  window.shell = { openExternal } as unknown as typeof window.shell
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('renders repositories in supplied activity order with issues left and pull requests right', () => {
  const { container } = renderSection()

  const cards = container.querySelectorAll('.active-repos-card')
  expect(cards).toHaveLength(2)
  expect(cards[0]).toHaveClass('active-repos-card')
  expect(cards[1]).toHaveClass('active-repos-card')
  expect(container.querySelector('.active-repos-card-featured')).not.toBeInTheDocument()
  expect(within(cards[0] as HTMLElement).getByText('hs-buddy')).toBeInTheDocument()
  expect(within(cards[1] as HTMLElement).getByText('codexbar-ios')).toBeInTheDocument()
  expect(screen.getByText('2 repositories')).toBeInTheDocument()

  cards.forEach(card => {
    const lanes = card.querySelectorAll('.active-repos-lane')
    expect(lanes[0]).toHaveClass('active-repos-lane-issues')
    expect(lanes[1]).toHaveClass('active-repos-lane-pull-requests')
  })
  expect(within(cards[0] as HTMLElement).getByText('#604')).toBeInTheDocument()
  expect(within(cards[0] as HTMLElement).getByText('#605')).toBeInTheDocument()
})

it('shows issue and pull-request states and handles an empty side', () => {
  renderSection()

  expect(screen.getByText('draft')).toBeInTheDocument()
  expect(screen.getByText('merged')).toBeInTheDocument()
  expect(screen.getByText('Nothing recent')).toBeInTheDocument()
})

it('opens repository and activity links through the system browser', () => {
  renderSection()

  fireEvent.click(screen.getByTitle('Open HemSoft/hs-buddy on GitHub'))
  expect(openExternal).toHaveBeenCalledWith('https://github.com/HemSoft/hs-buddy')

  fireEvent.click(screen.getByTitle('Open #604 on GitHub'))
  expect(openExternal).toHaveBeenCalledWith('https://github.com/HemSoft/hs-buddy/issues/604')
})

it('offers the combined GitHub activity search when more results exist', () => {
  renderSection(makeActivity({ hasMore: true }))

  fireEvent.click(screen.getByRole('button', { name: /All activity/ }))
  expect(openExternal).toHaveBeenCalledWith(
    'https://github.com/search?q=user%3AHemSoft%20sort%3Aupdated-desc&type=issues'
  )
})

it('keeps available pull requests visible after a partial issue-search failure', () => {
  renderSection(makeActivity({ issuesAvailable: false }))

  expect(
    screen.getByText('Showing the activity GitHub returned. One side could not be refreshed.')
  ).toBeInTheDocument()
  expect(screen.getAllByText('Activity unavailable')).toHaveLength(2)
  expect(screen.getByText('#605')).toBeInTheDocument()
})

it('renders loading, empty, and unavailable states without affecting surrounding content', () => {
  const { rerender } = renderSection(null, 'loading')
  expect(screen.getByLabelText('Loading active repositories')).toBeInTheDocument()

  rerender(
    <ActiveRepositoriesSection
      org="HemSoft"
      activity={makeActivity({ repositories: [] })}
      phase="ready"
      onRefresh={onRefresh}
    />
  )
  expect(screen.getByText('No recent issue or pull-request activity found.')).toBeInTheDocument()

  rerender(
    <ActiveRepositoriesSection org="HemSoft" activity={null} phase="error" onRefresh={onRefresh} />
  )
  expect(
    screen.getByText(
      'Repository activity is unavailable. The rest of the overview is still current.'
    )
  ).toBeInTheDocument()
})

it('refreshes repository activity and disables the control while refreshing', () => {
  const { rerender } = renderSection()

  fireEvent.click(screen.getByRole('button', { name: 'Refresh active repositories' }))
  expect(onRefresh).toHaveBeenCalledOnce()

  rerender(
    <ActiveRepositoriesSection
      org="HemSoft"
      activity={makeActivity()}
      phase="refreshing"
      onRefresh={onRefresh}
    />
  )

  const refreshButton = screen.getByRole('button', { name: 'Refreshing active repositories' })
  expect(refreshButton).toBeDisabled()
  expect(refreshButton).toHaveAttribute('aria-busy', 'true')
  expect(refreshButton.querySelector('svg')).toHaveClass('spin')
})
