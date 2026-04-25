import { ChevronDown, ChevronRight, FileText, GitPullRequest } from 'lucide-react'
import type { PullRequest } from '../../../types/pullRequest'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import { prSubNodes, sectionIcons } from './prConstants'
import type { SidebarItem } from './useGitHubSidebarData'
import type { RefreshIndicators } from '../../../hooks/useRefreshIndicators'

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
          aria-label={
            expandedPRNodes.has(prViewId)
              ? `Collapse pull request #${pr.id}`
              : `Expand pull request #${pr.id}`
          }
        >
          {expandedPRNodes.has(prViewId) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button type="button" className="sidebar-item-main" onClick={() => onItemSelect(prViewId)}>
          <span className="sidebar-item-icon">
            <GitPullRequest size={12} />
          </span>
          <span className="sidebar-item-label">
            #{pr.id} {pr.title}
          </span>
          {newUrls?.has(pr.url) && (
            <span
              className="sidebar-new-dot"
              title="New"
              role="img"
              aria-label="New pull request"
            />
          )}
          <span className="sidebar-pr-meta">
            <span className="sidebar-pr-meta-repo">{pr.repository}</span>
            <span className="sidebar-pr-meta-author">{pr.author}</span>
          </span>
        </button>
      </div>

      {expandedPRNodes.has(prViewId) && (
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
      )}
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
  if (!indicators) return ''
  const key = itemId.replace(/^pr-/, '')
  const state = indicators[key]
  if (state === 'active') return 'refresh-active'
  if (state === 'pending') return 'refresh-pending'
  return ''
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

function NewCountBadge({
  itemId,
  newCounts,
}: {
  itemId: string
  newCounts?: Record<string, number>
}) {
  if (!newCounts || (newCounts[itemId] ?? 0) <= 0) return null
  return (
    <span
      className="sidebar-new-badge"
      title={`${newCounts[itemId]} new PR${newCounts[itemId] !== 1 ? 's' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`${newCounts[itemId]} new pull request${newCounts[itemId] !== 1 ? 's' : ''}`}
    >
      {newCounts[itemId]}
    </span>
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
        <div key={item.id}>
          <div
            className={`sidebar-item sidebar-item-disclosure ${selectedItem === item.id ? 'selected' : ''} ${refreshClass(item.id, refreshIndicators)}`}
          >
            <button
              type="button"
              className="sidebar-item-chevron"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation()
                onTogglePRGroup(item.id)
              }}
              aria-label={
                expandedPrGroups.has(item.id) ? `Collapse ${item.label}` : `Expand ${item.label}`
              }
            >
              {expandedPrGroups.has(item.id) ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
            <button
              type="button"
              className="sidebar-item-main"
              onClick={() => onItemSelect(item.id)}
            >
              <span className="sidebar-item-icon">
                <FileText size={14} />
              </span>
              <span className="sidebar-item-label">{item.label}</span>
              <NewCountBadge itemId={item.id} newCounts={newCounts} />
              <CountBadge itemId={item.id} counts={counts} badgeProgress={badgeProgress} />
            </button>
          </div>

          {expandedPrGroups.has(item.id) && getPRsForItem(prTreeData, item.id).length > 0 && (
            <div className="sidebar-job-tree sidebar-pr-tree">
              <div className="sidebar-job-items">
                {/* v8 ignore start */}
                {getPRsForItem(prTreeData, item.id).map(pr => (
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
                {/* v8 ignore stop */}
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
