import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PRTreeSection } from './PRTreeSection'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import type { PullRequest } from '../../../types/pullRequest'
import type { SidebarItem } from './useGitHubSidebarData'
import type { RefreshIndicators } from '../../../hooks/useRefreshIndicators'

const baseItem: SidebarItem = {
  id: 'pr-my-prs',
  label: 'My PRs',
}

const basePr: PullRequest = {
  source: 'GitHub',
  repository: 'hs-buddy',
  id: 423,
  title: 'Add sidebar tree coverage',
  author: 'alice',
  url: 'https://github.com/relias-engineering/hs-buddy/pull/423',
  state: 'OPEN',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: new Date('2026-03-31T12:00:00Z'),
  date: '2026-03-31T12:00:00Z',
  org: 'relias-engineering',
}

function renderSection(options?: {
  expandedPrGroups?: Set<string>
  expandedPRNodes?: Set<string>
  counts?: Record<string, number>
  badgeProgress?: Record<string, { progress: number; color: string; tooltip: string }>
  newCounts?: Record<string, number>
  newUrls?: Set<string>
  refreshIndicators?: RefreshIndicators
  selectedItem?: string | null
  prTreeData?: Record<string, PullRequest[]>
}) {
  const onItemSelect = vi.fn()
  const onTogglePRGroup = vi.fn()
  const onTogglePRNode = vi.fn()
  const onContextMenu = vi.fn()

  render(
    <PRTreeSection
      prItems={[baseItem]}
      prTreeData={options?.prTreeData ?? { [baseItem.id]: [basePr] }}
      expandedPrGroups={options?.expandedPrGroups ?? new Set()}
      expandedPRNodes={options?.expandedPRNodes ?? new Set()}
      counts={options?.counts ?? { [baseItem.id]: 2 }}
      badgeProgress={options?.badgeProgress ?? {}}
      newCounts={options?.newCounts}
      newUrls={options?.newUrls}
      refreshIndicators={options?.refreshIndicators}
      selectedItem={options?.selectedItem ?? null}
      onItemSelect={onItemSelect}
      onTogglePRGroup={onTogglePRGroup}
      onTogglePRNode={onTogglePRNode}
      onContextMenu={onContextMenu}
    />
  )

  return { onItemSelect, onTogglePRGroup, onTogglePRNode, onContextMenu }
}

describe('PRTreeSection', () => {
  it('renders a collapsed PR group with pending refresh state and forwards group actions', () => {
    const { onItemSelect, onTogglePRGroup } = renderSection({
      refreshIndicators: { 'my-prs': 'pending' } as RefreshIndicators,
      selectedItem: baseItem.id,
      prTreeData: { [baseItem.id]: [] },
    })

    const expandButton = screen.getByRole('button', { name: /expand my prs/i })
    const itemContainer = expandButton.closest('.sidebar-item')

    fireEvent.click(expandButton)
    fireEvent.click(screen.getByRole('button', { name: /^my prs 2$/i }))

    expect(itemContainer).toHaveClass('selected', 'refresh-pending')
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.queryByTitle(basePr.title)).toBeNull()
    expect(onTogglePRGroup).toHaveBeenCalledWith(baseItem.id)
    expect(onItemSelect).toHaveBeenCalledWith(baseItem.id)
  })

  it('renders badge progress and active refresh state when progress metadata is present', () => {
    renderSection({
      badgeProgress: {
        [baseItem.id]: { progress: 75, color: '#22c55e', tooltip: '3 of 4 reviewed' },
      },
      counts: { [baseItem.id]: 4 },
      refreshIndicators: { 'my-prs': 'active' } as RefreshIndicators,
    })

    const expandButton = screen.getByRole('button', { name: /expand my prs/i })
    const itemContainer = expandButton.closest('.sidebar-item')
    const countRing = document.querySelector('.sidebar-item-count-ring')

    expect(itemContainer).toHaveClass('refresh-active')
    expect(countRing).toHaveAttribute('title', '3 of 4 reviewed')
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('renders expanded PR nodes, nested sections, and forwards PR interactions', () => {
    const prViewId = createPRDetailViewId(basePr)
    const conversationViewId = createPRDetailViewId(basePr, 'conversation')
    const { onItemSelect, onTogglePRNode, onContextMenu } = renderSection({
      expandedPrGroups: new Set([baseItem.id]),
      expandedPRNodes: new Set([prViewId]),
      selectedItem: conversationViewId,
    })

    fireEvent.contextMenu(screen.getByTitle(basePr.title))
    fireEvent.click(screen.getByRole('button', { name: /collapse pull request #423/i }))
    fireEvent.click(
      screen.getByText('#423 Add sidebar tree coverage').closest('button') as HTMLElement
    )
    fireEvent.click(screen.getByRole('button', { name: /conversation/i }))
    fireEvent.keyDown(screen.getByRole('button', { name: /commits/i }), { key: 'Enter' })

    expect(screen.getByText('hs-buddy')).toBeTruthy()
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByRole('button', { name: /ai reviews/i })).toBeTruthy()
    expect(onContextMenu).toHaveBeenCalledWith(expect.any(Object), basePr)
    expect(onTogglePRNode).toHaveBeenCalledWith(prViewId)
    expect(onItemSelect).toHaveBeenCalledWith(prViewId)
    expect(onItemSelect).toHaveBeenCalledWith(conversationViewId)
    expect(onItemSelect).toHaveBeenCalledWith(createPRDetailViewId(basePr, 'commits'))
  })

  it('renders numeric new-PR badge with accessible label when newCounts > 0', () => {
    renderSection({
      newCounts: { [baseItem.id]: 3 },
    })

    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('3')
    expect(badge).toHaveAttribute('aria-label', '3 new pull requests')
    expect(badge).toHaveAttribute('title', '3 new PRs')
  })

  it('renders new-PR dot on individual PR items when newUrls contains the PR url', () => {
    renderSection({
      expandedPrGroups: new Set([baseItem.id]),
      newUrls: new Set([basePr.url]),
    })

    const dot = screen.getByRole('img', { name: /new pull request/i })
    expect(dot).toHaveClass('sidebar-new-dot')
  })
})
