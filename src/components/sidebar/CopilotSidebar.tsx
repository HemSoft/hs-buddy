import {
  ChevronDown,
  ChevronRight,
  FileText,
  Sparkles,
  Send,
  Clock,
  Zap,
  Database,
} from 'lucide-react'
import { useState } from 'react'
import { useCopilotResultsRecent, useCopilotActiveCount } from '../../hooks/useConvex'
import { formatDistanceToNow } from '../../utils/dateUtils'
import { getStatusIcon } from '../shared/statusDisplay'

interface CopilotSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

export function CopilotSidebar({ onItemSelect, selectedItem }: CopilotSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['copilot-prompt']))
  const recentResults = useCopilotResultsRecent(15)
  const activeCount = useCopilotActiveCount()

  const totalActive = (activeCount?.pending ?? 0) + (activeCount?.running ?? 0)

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>COPILOT</h2>
        {totalActive > 0 && <span className="sidebar-item-count">{totalActive}</span>}
      </div>
      <div className="sidebar-panel-content">
        {/* Prompt section */}
        <div className="sidebar-section">
          <div
            className="sidebar-section-header"
            role="button"
            tabIndex={0}
            onClick={() => toggleSection('copilot-prompt')}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSection('copilot-prompt')
              }
            }}
          >
            <div className="sidebar-section-title">
              {expandedSections.has('copilot-prompt') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <Send size={16} />
              </span>
              <span>Prompt</span>
            </div>
          </div>
          {expandedSections.has('copilot-prompt') && (
            <div className="sidebar-section-items">
              <div
                className={`sidebar-item ${selectedItem === 'copilot-prompt' ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onItemSelect('copilot-prompt')}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemSelect('copilot-prompt')
                  }
                }}
              >
                <span className="sidebar-item-icon">
                  <Sparkles size={14} />
                </span>
                <span className="sidebar-item-label">New Prompt</span>
              </div>
              <div
                className={`sidebar-item ${selectedItem === 'copilot-all-results' ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onItemSelect('copilot-all-results')}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemSelect('copilot-all-results')
                  }
                }}
              >
                <span className="sidebar-item-icon">
                  <FileText size={14} />
                </span>
                <span className="sidebar-item-label">All Results</span>
                {recentResults && recentResults.length > 0 && (
                  <span className="sidebar-item-count">{recentResults.length}</span>
                )}
              </div>
              <div
                className={`sidebar-item ${selectedItem === 'copilot-usage' ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onItemSelect('copilot-usage')}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemSelect('copilot-usage')
                  }
                }}
              >
                <span className="sidebar-item-icon">
                  <Zap size={14} />
                </span>
                <span className="sidebar-item-label">Copilot Usage</span>
              </div>
              <div
                className={`sidebar-item ${selectedItem === 'copilot-sessions' ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onItemSelect('copilot-sessions')}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemSelect('copilot-sessions')
                  }
                }}
              >
                <span className="sidebar-item-icon">
                  <Database size={14} />
                </span>
                <span className="sidebar-item-label">Session Explorer</span>
              </div>
            </div>
          )}
        </div>

        {/* Recent results section */}
        <div className="sidebar-section">
          <div
            className="sidebar-section-header"
            role="button"
            tabIndex={0}
            onClick={() => toggleSection('copilot-results')}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSection('copilot-results')
              }
            }}
          >
            <div className="sidebar-section-title">
              {expandedSections.has('copilot-results') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <Clock size={16} />
              </span>
              <span>Recent Results</span>
            </div>
          </div>
          {expandedSections.has('copilot-results') && (
            <div className="sidebar-section-items">
              {!recentResults || recentResults.length === 0 ? (
                <div className="sidebar-item sidebar-item-empty">
                  <span className="sidebar-item-label">No results yet</span>
                </div>
              ) : (
                recentResults.map(r => {
                  const viewId = `copilot-result:${r._id}`
                  const label =
                    r.category === 'pr-review'
                      ? `PR Review: ${((r.metadata as Record<string, unknown> | null)?.prTitle as string) || 'Untitled'}`
                      : r.prompt.length > 40
                        ? r.prompt.slice(0, 40) + '...'
                        : r.prompt
                  return (
                    <div
                      key={r._id}
                      className={`sidebar-item ${selectedItem === viewId ? 'selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onItemSelect(viewId)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onItemSelect(viewId)
                        }
                      }}
                      title={r.prompt}
                    >
                      <span className="sidebar-item-icon">{getStatusIcon(r.status, 12)}</span>
                      <span className="sidebar-item-label">{label}</span>
                      <span className="sidebar-repo-lang">{formatDistanceToNow(r.createdAt)}</span>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
