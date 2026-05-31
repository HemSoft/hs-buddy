import {
  CheckSquare,
  BarChart3,
  Bot,
  Sparkles,
  Settings,
  Users,
  Clock,
  Bookmark,
  Home,
  RefreshCw,
  TerminalSquare,
} from 'lucide-react'
import { GithubIcon } from './icons/GithubIcon'
import { useState } from 'react'
import './ActivityBar.css'

function getTooltipLabel(hoveredItem: string): string {
  if (hoveredItem === 'home') return 'Dashboard'
  /* v8 ignore next -- fallback for sections lookup */
  return sections.find(s => s.id === hoveredItem)?.label ?? ''
}

function ActivityBarTooltip({
  hoveredItem,
  tooltipPosition,
}: {
  hoveredItem: string | null
  tooltipPosition: { top: number } | null
}) {
  if (!hoveredItem || !tooltipPosition) return null
  return (
    <div className="activity-bar-tooltip" style={{ top: tooltipPosition.top }}>
      {getTooltipLabel(hoveredItem)}
    </div>
  )
}

interface ActivityBarProps {
  selectedSection: string
  onSectionSelect: (sectionId: string) => void
  isDashboardActive?: boolean
  onHomeClick?: () => void
}

const sections = [
  { id: 'github', label: 'GitHub', icon: GithubIcon },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'automation', label: 'Automation', icon: Bot },
  { id: 'ralph', label: 'Ralph Loops', icon: RefreshCw },
  { id: 'crew', label: 'The Crew', icon: Users },
  { id: 'tempo', label: 'Tempo', icon: Clock },
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'copilot', label: 'Copilot', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function ActivityBar({
  selectedSection,
  onSectionSelect,
  isDashboardActive,
  onHomeClick,
}: ActivityBarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number } | null>(null)

  const handleMouseEnter = (sectionId: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setHoveredItem(sectionId)
    setTooltipPosition({ top: rect.top + rect.height / 2 })
  }

  const handleMouseLeave = () => {
    setHoveredItem(null)
    setTooltipPosition(null)
  }

  return (
    <div className="activity-bar">
      <div className="activity-bar-items">
        <button
          type="button"
          className={`activity-bar-item ${isDashboardActive ? 'active' : ''}`}
          onClick={onHomeClick}
          onMouseEnter={e => handleMouseEnter('home', e)}
          onMouseLeave={handleMouseLeave}
          aria-label="Dashboard"
        >
          <Home size={24} />
        </button>
        <div className="activity-bar-separator" />
        {sections.map(section => {
          const Icon = section.icon
          const isActive = selectedSection === section.id

          return (
            <button
              type="button"
              key={section.id}
              className={`activity-bar-item ${isActive ? 'active' : ''}`}
              onClick={() => onSectionSelect(section.id)}
              onMouseEnter={e => handleMouseEnter(section.id, e)}
              onMouseLeave={handleMouseLeave}
              aria-label={section.label}
            >
              <Icon size={24} />
            </button>
          )
        })}
      </div>

      {/* Custom Tooltip */}
      <ActivityBarTooltip hoveredItem={hoveredItem} tooltipPosition={tooltipPosition} />
    </div>
  )
}
