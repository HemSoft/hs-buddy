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
import { useCopilotResultsRecent, useCopilotActiveCount } from '../../hooks/useConvex'
import { useToggleSet } from '../../hooks/useToggleSet'
import { formatDistanceToNow } from '../../utils/dateUtils'
import { onKeyboardActivate } from '../../utils/keyboard'
import { getStatusIcon } from '../shared/statusDisplay'

interface CopilotSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

function SidebarNavItem({
  id,
  icon,
  label,
  selectedItem,
  onItemSelect,
  count,
}: {
  id: string
  icon: React.ReactNode
  label: string
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  count?: number
}) {
  return (
    <div
      className={`sidebar-item ${selectedItem === id ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onItemSelect(id)}
      onKeyDown={onKeyboardActivate(() => onItemSelect(id))}
    >
      <span className="sidebar-item-icon">{icon}</span>
      <span className="sidebar-item-label">{label}</span>
      {count != null && count > 0 && <span className="sidebar-item-count">{count}</span>}
    </div>
  )
}

function RecentResultItem({
  result,
  selectedItem,
  onItemSelect,
}: {
  result: NonNullable<ReturnType<typeof useCopilotResultsRecent>>[number]
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  const viewId = `copilot-result:${result._id}`
  const label =
    result.category === 'pr-review'
      ? `PR Review: ${((result.metadata as Record<string, unknown> | null)?.prTitle as string) || 'Untitled'}`
      : result.prompt.length > 40
        ? result.prompt.slice(0, 40) + '...'
        : result.prompt

  return (
    <div
      className={`sidebar-item ${selectedItem === viewId ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onItemSelect(viewId)}
      onKeyDown={onKeyboardActivate(() => onItemSelect(viewId))}
      title={result.prompt}
    >
      <span className="sidebar-item-icon">{getStatusIcon(result.status, 12)}</span>
      <span className="sidebar-item-label">{label}</span>
      <span className="sidebar-repo-lang">{formatDistanceToNow(result.createdAt)}</span>
    </div>
  )
}

function PromptSection({
  isExpanded,
  toggleSection,
  selectedItem,
  onItemSelect,
  recentResultsCount,
}: {
  isExpanded: boolean
  toggleSection: (key: string) => void
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  recentResultsCount: number | undefined
}) {
  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header"
        role="button"
        tabIndex={0}
        onClick={() => toggleSection('copilot-prompt')}
        onKeyDown={onKeyboardActivate(() => toggleSection('copilot-prompt'))}
      >
        <div className="sidebar-section-title">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="sidebar-section-icon">
            <Send size={16} />
          </span>
          <span>Prompt</span>
        </div>
      </div>
      {isExpanded && (
        <div className="sidebar-section-items">
          <SidebarNavItem
            id="copilot-prompt"
            icon={<Sparkles size={14} />}
            label="New Prompt"
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
          />
          <SidebarNavItem
            id="copilot-all-results"
            icon={<FileText size={14} />}
            label="All Results"
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            count={recentResultsCount}
          />
          <SidebarNavItem
            id="copilot-usage"
            icon={<Zap size={14} />}
            label="Copilot Usage"
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
          />
          <SidebarNavItem
            id="copilot-sessions"
            icon={<Database size={14} />}
            label="Session Explorer"
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
          />
        </div>
      )}
    </div>
  )
}

function RecentResultsSection({
  isExpanded,
  toggleSection,
  recentResults,
  selectedItem,
  onItemSelect,
}: {
  isExpanded: boolean
  toggleSection: (key: string) => void
  recentResults: ReturnType<typeof useCopilotResultsRecent>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header"
        role="button"
        tabIndex={0}
        onClick={() => toggleSection('copilot-results')}
        onKeyDown={onKeyboardActivate(() => toggleSection('copilot-results'))}
      >
        <div className="sidebar-section-title">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="sidebar-section-icon">
            <Clock size={16} />
          </span>
          <span>Recent Results</span>
        </div>
      </div>
      {isExpanded && (
        <div className="sidebar-section-items">
          {!recentResults || recentResults.length === 0 ? (
            <div className="sidebar-item sidebar-item-empty">
              <span className="sidebar-item-label">No results yet</span>
            </div>
          ) : (
            recentResults.map(r => (
              <RecentResultItem
                key={r._id}
                result={r}
                selectedItem={selectedItem}
                onItemSelect={onItemSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function CopilotSidebar({ onItemSelect, selectedItem }: CopilotSidebarProps) {
  const { has: isExpanded, toggle: toggleSection } = useToggleSet(['copilot-prompt'])
  const recentResults = useCopilotResultsRecent(15)
  const activeCount = useCopilotActiveCount()

  const totalActive = (activeCount?.pending ?? 0) + (activeCount?.running ?? 0)

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>COPILOT</h2>
        {totalActive > 0 && <span className="sidebar-item-count">{totalActive}</span>}
      </div>
      <div className="sidebar-panel-content">
        <PromptSection
          isExpanded={isExpanded('copilot-prompt')}
          toggleSection={toggleSection}
          selectedItem={selectedItem}
          onItemSelect={onItemSelect}
          recentResultsCount={recentResults?.length}
        />
        <RecentResultsSection
          isExpanded={isExpanded('copilot-results')}
          toggleSection={toggleSection}
          recentResults={recentResults}
          selectedItem={selectedItem}
          onItemSelect={onItemSelect}
        />
      </div>
    </div>
  )
}
