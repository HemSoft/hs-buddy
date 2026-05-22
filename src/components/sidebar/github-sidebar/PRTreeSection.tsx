import { ChevronDown, ChevronRight, FileText, GitPullRequest } from 'lucide-react'
import type { PullRequest } from '../../../types/pullRequest'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import { prSubNodes, sectionIcons } from './prConstants'
import type { SidebarItem } from './useGitHubSidebarData'
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

function PRNewDot({ isNew }: { isNew: boolean }) {
  if (!isNew) return null
  return <span className="sidebar-new-dot" title="New" role="img" aria-label="New pull request" />
}

function PRNodeToggleButton({
  expanded,
  prId,
  prViewId,
  onTogglePRNode,
}: {
  expanded: boolean
  prId: number
  prViewId: string
  onTogglePRNode: (prViewId: string) => void
}) {
  return (
    <button
      type="button"
      className="sidebar-item-chevron"
      tabIndex={0}
      onClick={e => {
        e.stopPropagation()
        onTogglePRNode(prViewId)
      }}
      aria-label={expanded ? `Collapse pull request #${prId}` : `Expand pull request #${prId}`}
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </button>
  )
}

function PRItemChildren({
  pr,
  selectedItem,
  onItemSelect,
}: {
  pr: PullRequest
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  return (
    <div className="sidebar-pr-children">
      {prSubNodes.map(node => {
        const childViewId = createPRDetailViewId(pr, node.key)
        const Icon = sectionIcons[node.key]
        return (
          <div
            key={childViewId}
            className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
            role="button"
            tabIndex={0}
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
          </div>
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
        <PRNodeToggleButton
          expanded={isExpanded}
          prId={pr.id}
          prViewId={prViewId}
          onTogglePRNode={onTogglePRNode}
        />
        <button type="button" className="sidebar-item-main" onClick={() => onItemSelect(prViewId)}>
          <span className="sidebar-item-icon">
            <GitPullRequest size={12} />
          </span>
          <span className="sidebar-item-label">
            #{pr.id} {pr.title}
          </span>
          <PRNewDot isNew={newUrls?.has(pr.url) ?? false} />
          <span className="sidebar-pr-meta">
            <span className="sidebar-pr-meta-repo">{pr.repository}</span>
            <span className="sidebar-pr-meta-author">{pr.author}</span>
          </span>
        </button>
      </div>

      {isExpanded && <PRItemChildren pr={pr} selectedItem={selectedItem} onItemSelect={onItemSelect} />}
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

function resolveNewCount(newCounts: Record<string, number> | undefined, itemId: string): number {
  return newCounts?.[itemId] ?? 0
}

function newPullRequestLabel(count: number): string {
  return `${count} new pull request${count === 1 ? '' : 's'}`
}

function NewCountBadge({
  itemId,
  newCounts,
}: {
  itemId: string
  newCounts?: Record<string, number>
}) {
  const count = resolveNewCount(newCounts, itemId)
  if (count <= 0) return null
  return (
    <span
      className="sidebar-new-badge"
      title={`${count} new PR${count === 1 ? '' : 's'}`}
      role="status"
      aria-live="polite"
      aria-label={newPullRequestLabel(count)}
    >
      {count}
    </span>
  )
}

function prGroupClassName(
  itemId: string,
  selectedItem: string | null,
  refreshIndicators?: RefreshIndicators
): string {
  return `sidebar-item sidebar-item-disclosure ${selectedItem === itemId ? 'selected' : ''} ${refreshClass(itemId, refreshIndicators)}`
}

function PRTreeGroupChildren({
  item,
  prs,
  expandedPRNodes,
  selectedItem,
  newUrls,
  onItemSelect,
  onTogglePRNode,
  onContextMenu,
}: {
  item: SidebarItem
  prs: PullRequest[]
  expandedPRNodes: ReadonlySet<string>
  selectedItem: string | null
  newUrls?: ReadonlySet<string>
  onItemSelect: (itemId: string) => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}) {
  if (prs.length === 0) return null
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

function PRTreeGroupSection({
  item,
  prTreeData,
  expandedPrGroups,
  refreshIndicators,
  selectedItem,
  newCounts,
  counts,
  badgeProgress,
  newUrls,
  expandedPRNodes,
  onItemSelect,
  onTogglePRGroup,
  onTogglePRNode,
  onContextMenu,
}: {
  item: SidebarItem
  prTreeData: Record<string, PullRequest[]>
  expandedPrGroups: ReadonlySet<string>
  refreshIndicators?: RefreshIndicators
  selectedItem: string | null
  newCounts?: Record<string, number>
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
  newUrls?: ReadonlySet<string>
  expandedPRNodes: ReadonlySet<string>
  onItemSelect: (itemId: string) => void
  onTogglePRGroup: (itemId: string) => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}) {
  const isExpanded = expandedPrGroups.has(item.id)
  const prs = getPRsForItem(prTreeData, item.id)

  return (
    <div>
      <div className={prGroupClassName(item.id, selectedItem, refreshIndicators)}>
        <button
          type="button"
          className="sidebar-item-chevron"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation()
            onTogglePRGroup(item.id)
          }}
          aria-label={isExpanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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

      {isExpanded && (
        <PRTreeGroupChildren
          item={item}
          prs={prs}
          expandedPRNodes={expandedPRNodes}
          selectedItem={selectedItem}
          newUrls={newUrls}
          onItemSelect={onItemSelect}
          onTogglePRNode={onTogglePRNode}
          onContextMenu={onContextMenu}
        />
      )}
    </div>
  )
}

export function PRTreeSection({
  prItems,
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
}: PRTreeSectionProps) {
  return (
    <>
      {prItems.map(item => (
        <PRTreeGroupSection
          key={item.id}
          item={item}
          prTreeData={prTreeData}
          expandedPrGroups={expandedPrGroups}
          refreshIndicators={refreshIndicators}
          selectedItem={selectedItem}
          newCounts={newCounts}
          counts={counts}
          badgeProgress={badgeProgress}
          newUrls={newUrls}
          expandedPRNodes={expandedPRNodes}
          onItemSelect={onItemSelect}
          onTogglePRGroup={onTogglePRGroup}
          onTogglePRNode={onTogglePRNode}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  )
}
