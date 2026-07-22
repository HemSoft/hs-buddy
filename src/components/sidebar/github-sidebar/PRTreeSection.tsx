import { ChevronDown, ChevronRight, FileText, GitPullRequest } from 'lucide-react'
import { Fragment } from 'react'
import type { PullRequest } from '../../../types/pullRequest'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import { prSubNodes, sectionIcons } from './prConstants'
import type { SidebarItem } from './types'
import type { RefreshIndicators } from '../../../hooks/useRefreshIndicators'
import { refreshStateClass } from './repoNodeUtils'

interface PRItemNodeProps {
  item: SidebarItem
  pr: PullRequest
  expandedPRNodes: ReadonlySet<string>
  selectedItem: string | null
  newUrls?: ReadonlySet<string>
  onItemSelect: (itemId: string) => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}

function DisclosureChevron({ isExpanded, size }: { isExpanded: boolean; size: number }) {
  return isExpanded ? <ChevronDown size={size} /> : <ChevronRight size={size} />
}

function buildPRDisclosureLabel(isExpanded: boolean, prId: number): string {
  return isExpanded ? `Collapse pull request #${prId}` : `Expand pull request #${prId}`
}

function hasNewPullRequest(newUrls: ReadonlySet<string> | undefined, url: string): boolean {
  if (!newUrls) return false
  return newUrls.has(url)
}

function NewPRDot({ isNew }: { isNew: boolean }) {
  if (!isNew) return null
  return <span className="sidebar-new-dot" title="New" aria-hidden="true" />
}

function PRChildNodes({
  isExpanded,
  pr,
  selectedItem,
  onItemSelect,
}: {
  isExpanded: boolean
  pr: PullRequest
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  if (!isExpanded) return null
  return (
    <div className="sidebar-pr-children">
      {prSubNodes.map(node => {
        const childViewId = createPRDetailViewId(pr, node.key)
        const Icon = sectionIcons[node.key]
        return (
          <button
            type="button"
            key={childViewId}
            className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
            onClick={() => onItemSelect(childViewId)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onItemSelect(childViewId)
              }
            }}
          >
            <span className="sidebar-item-icon">
              <Icon size={12} />
            </span>
            <span className="sidebar-item-label">{node.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function PRItemNode({
  item,
  pr,
  expandedPRNodes,
  selectedItem,
  newUrls,
  onItemSelect,
  onTogglePRNode,
  onContextMenu,
}: PRItemNodeProps) {
  const prViewId = createPRDetailViewId(pr)
  const isSelected = selectedItem === prViewId
  const isExpanded = expandedPRNodes.has(prViewId)
  const isNew = hasNewPullRequest(newUrls, pr.url)

  return (
    <div
      key={`${item.id}-${pr.source}-${pr.repository}-${pr.id}`}
      className="sidebar-pr-group"
      onContextMenu={e => onContextMenu(e, pr)}
      title={pr.title}
    >
      <div
        className={`sidebar-item sidebar-item-disclosure sidebar-pr-item ${isSelected ? 'selected' : ''}`}
      >
        <button
          type="button"
          className="sidebar-item-chevron"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation()
            onTogglePRNode(prViewId)
          }}
          aria-label={buildPRDisclosureLabel(isExpanded, pr.id)}
        >
          <DisclosureChevron isExpanded={isExpanded} size={12} />
        </button>
        <button
          type="button"
          className="sidebar-item-main"
          onClick={() => onItemSelect(prViewId)}
          aria-label={`Pull request #${pr.id}: ${pr.title}${isNew ? ', new pull request' : ''}`}
        >
          <span className="sidebar-item-icon">
            <GitPullRequest size={12} />
          </span>
          <span className="sidebar-item-label">
            #{pr.id} {pr.title}
          </span>
          <NewPRDot isNew={isNew} />
          <span className="sidebar-pr-meta">
            <span className="sidebar-pr-meta-repo">{pr.repository}</span>
            <span className="sidebar-pr-meta-author">{pr.author}</span>
          </span>
        </button>
      </div>

      <PRChildNodes
        isExpanded={isExpanded}
        pr={pr}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
      />
    </div>
  )
}

function getPRsForItem(prTreeData: Record<string, PullRequest[]>, itemId: string): PullRequest[] {
  return prTreeData[itemId] || []
}

interface PRTreeSectionProps {
  prItems: SidebarItem[]
  prTreeData: Record<string, PullRequest[]>
  expandedPrGroups: ReadonlySet<string>
  expandedPRNodes: ReadonlySet<string>
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
  newCounts?: Record<string, number>
  newUrls?: ReadonlySet<string>
  refreshIndicators?: RefreshIndicators
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onTogglePRGroup: (itemId: string) => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}

/** Map sidebar item id (e.g. 'pr-my-prs') to the data-source key used by the task queue ('my-prs'). */
function refreshClass(itemId: string, indicators?: RefreshIndicators): string {
  return indicators ? refreshStateClass(indicators[itemId.replace(/^pr-/, '')]) : ''
}

function CountBadge({
  itemId,
  counts,
  badgeProgress,
}: {
  itemId: string
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
}) {
  if (counts[itemId] === undefined) return null
  const progressInfo = badgeProgress[itemId]
  if (progressInfo) {
    return (
      <span
        className="sidebar-item-count-ring"
        style={
          {
            '--ring-progress': `${progressInfo.progress}%`,
            '--ring-color': progressInfo.color,
          } as React.CSSProperties
        }
        title={progressInfo.tooltip}
      >
        <span className="sidebar-item-count">{counts[itemId]}</span>
      </span>
    )
  }
  return <span className="sidebar-item-count">{counts[itemId]}</span>
}

function getNewCount(newCounts: Record<string, number> | undefined, itemId: string): number {
  if (!newCounts) return 0
  return newCounts[itemId] ?? 0
}

function getNewCountTitle(newCount: number): string {
  return `${newCount} new PR${newCount !== 1 ? 's' : ''}`
}

function getNewCountAriaLabel(newCount: number): string {
  return `${newCount} new pull request${newCount !== 1 ? 's' : ''}`
}

function NewCountBadge({
  itemId,
  newCounts,
}: {
  itemId: string
  newCounts?: Record<string, number>
}) {
  const newCount = getNewCount(newCounts, itemId)
  if (newCount <= 0) return null
  return (
    <output
      className="sidebar-new-badge"
      title={getNewCountTitle(newCount)}
      aria-live="polite"
      aria-label={getNewCountAriaLabel(newCount)}
    >
      {newCount}
    </output>
  )
}

function buildPRGroupClassName(
  itemId: string,
  selectedItem: string | null,
  refreshIndicators?: RefreshIndicators
): string {
  return `sidebar-item sidebar-item-disclosure ${selectedItem === itemId ? 'selected' : ''} ${refreshClass(itemId, refreshIndicators)}`
}

function buildPRGroupDisclosureLabel(isExpanded: boolean, label: string): string {
  return isExpanded ? `Collapse ${label}` : `Expand ${label}`
}

function PRGroupChildren({
  item,
  prs,
  isExpanded,
  expandedPRNodes,
  selectedItem,
  newUrls,
  onItemSelect,
  onTogglePRNode,
  onContextMenu,
}: {
  item: SidebarItem
  prs: PullRequest[]
  isExpanded: boolean
  expandedPRNodes: ReadonlySet<string>
  selectedItem: string | null
  newUrls?: ReadonlySet<string>
  onItemSelect: (itemId: string) => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}) {
  if (!isExpanded || prs.length === 0) return null
  return (
    <div className="sidebar-job-tree sidebar-pr-tree">
      <div className="sidebar-job-items">
        {prs.map(pr => (
          <PRItemNode
            key={`${item.id}-${pr.source}-${pr.repository}-${pr.id}`}
            item={item}
            pr={pr}
            expandedPRNodes={expandedPRNodes}
            selectedItem={selectedItem}
            newUrls={newUrls}
            onItemSelect={onItemSelect}
            onTogglePRNode={onTogglePRNode}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  )
}

function PRGroupNode({
  item,
  prTreeData,
  expandedPrGroups,
  expandedPRNodes,
  counts,
  badgeProgress,
  newCounts,
  newUrls,
  refreshIndicators,
  selectedItem,
  onItemSelect,
  onTogglePRGroup,
  onTogglePRNode,
  onContextMenu,
}: PRTreeSectionProps & { item: SidebarItem }) {
  const isExpanded = expandedPrGroups.has(item.id)
  const prs = getPRsForItem(prTreeData, item.id)

  return (
    <div key={item.id}>
      <div className={buildPRGroupClassName(item.id, selectedItem, refreshIndicators)}>
        <button
          type="button"
          className="sidebar-item-chevron"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation()
            onTogglePRGroup(item.id)
          }}
          aria-label={buildPRGroupDisclosureLabel(isExpanded, item.label)}
        >
          <DisclosureChevron isExpanded={isExpanded} size={12} />
        </button>
        <button type="button" className="sidebar-item-main" onClick={() => onItemSelect(item.id)}>
          <span className="sidebar-item-icon">
            <FileText size={14} />
          </span>
          <span className="sidebar-item-label">{item.label}</span>
          <NewCountBadge itemId={item.id} newCounts={newCounts} />
          <CountBadge itemId={item.id} counts={counts} badgeProgress={badgeProgress} />
        </button>
      </div>

      <PRGroupChildren
        item={item}
        prs={prs}
        isExpanded={isExpanded}
        expandedPRNodes={expandedPRNodes}
        selectedItem={selectedItem}
        newUrls={newUrls}
        onItemSelect={onItemSelect}
        onTogglePRNode={onTogglePRNode}
        onContextMenu={onContextMenu}
      />
    </div>
  )
}

export function PRTreeSection(props: PRTreeSectionProps) {
  return (
    <>
      {props.prItems.map(item => (
        <Fragment key={item.id}>
          <PRGroupNode item={item} {...props} />
        </Fragment>
      ))}
    </>
  )
}
