import {
  ChevronDown,
  ChevronRight,
  FileText,
  GitPullRequest,
} from 'lucide-react'
import type { PullRequest } from '../../../types/pullRequest'
import { createPRDetailViewId } from '../../../utils/prDetailView'
import type { PRDetailSection } from '../../../utils/prDetailView'

interface SidebarItem {
  id: string
  label: string
}

interface PRTreeSectionProps {
  prItems: SidebarItem[]
  prTreeData: Record<string, PullRequest[]>
  expandedPrGroups: Set<string>
  expandedPRNodes: Set<string>
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onTogglePRGroup: (itemId: string) => void
  onTogglePRNode: (prViewId: string) => void
  onContextMenu: (e: React.MouseEvent, pr: PullRequest) => void
}

const prSubNodes: Array<{ key: PRDetailSection; label: string }> = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'commits', label: 'Commits' },
  { key: 'checks', label: 'Checks' },
  { key: 'files-changed', label: 'Files changed' },
  { key: 'ai-reviews', label: 'AI Reviews' },
]

export function PRTreeSection({
  prItems,
  prTreeData,
  expandedPrGroups,
  expandedPRNodes,
  counts,
  badgeProgress,
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
            className={`sidebar-item sidebar-item-disclosure ${selectedItem === item.id ? 'selected' : ''}`}
            onClick={() => onItemSelect(item.id)}
          >
            <span
              className="sidebar-item-chevron"
              onClick={e => {
                e.stopPropagation()
                onTogglePRGroup(item.id)
              }}
            >
              {expandedPrGroups.has(item.id) ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </span>
            <span className="sidebar-item-icon">
              <FileText size={14} />
            </span>
            <span className="sidebar-item-label">{item.label}</span>
            {counts[item.id] !== undefined &&
              (badgeProgress[item.id] ? (
                <span
                  className="sidebar-item-count-ring"
                  style={
                    {
                      '--ring-progress': `${badgeProgress[item.id].progress}%`,
                      '--ring-color': badgeProgress[item.id].color,
                    } as React.CSSProperties
                  }
                  title={badgeProgress[item.id].tooltip}
                >
                  <span className="sidebar-item-count">{counts[item.id]}</span>
                </span>
              ) : (
                <span className="sidebar-item-count">{counts[item.id]}</span>
              ))}
          </div>

          {expandedPrGroups.has(item.id) && (prTreeData[item.id] || []).length > 0 && (
            <div className="sidebar-job-tree sidebar-pr-tree">
              <div className="sidebar-job-items">
                {(prTreeData[item.id] || []).map(pr => {
                  const prViewId = createPRDetailViewId(pr)
                  const isSelected =
                    selectedItem === prViewId || selectedItem?.startsWith(`${prViewId}?section=`)
                  return (
                    <div
                      key={`${item.id}-${pr.source}-${pr.repository}-${pr.id}`}
                      className="sidebar-pr-group"
                    >
                      <div
                        className={`sidebar-item sidebar-item-disclosure sidebar-pr-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => onItemSelect(prViewId)}
                        onContextMenu={e => onContextMenu(e, pr)}
                        title={pr.title}
                      >
                        <span
                          className="sidebar-item-chevron"
                          onClick={e => {
                            e.stopPropagation()
                            onTogglePRNode(prViewId)
                          }}
                        >
                          {expandedPRNodes.has(prViewId) ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </span>
                        <span className="sidebar-item-icon">
                          <GitPullRequest size={12} />
                        </span>
                        <span className="sidebar-item-label">#{pr.id} {pr.title}</span>
                        <span className="sidebar-pr-meta">
                          <span className="sidebar-pr-meta-repo">{pr.repository}</span>
                          <span className="sidebar-pr-meta-author">{pr.author}</span>
                        </span>
                      </div>

                      {expandedPRNodes.has(prViewId) && (
                        <div className="sidebar-pr-children">
                          {prSubNodes.map(node => {
                            const childViewId = createPRDetailViewId(pr, node.key)
                            return (
                              <div
                                key={childViewId}
                                className={`sidebar-item sidebar-pr-child ${selectedItem === childViewId ? 'selected' : ''}`}
                                onClick={() => onItemSelect(childViewId)}
                              >
                                <span className="sidebar-item-icon">
                                  <FileText size={11} />
                                </span>
                                <span className="sidebar-item-label">{node.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
