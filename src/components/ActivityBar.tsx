import { Github, Zap, CheckSquare, BarChart3, Bot, Sparkles, Settings } from 'lucide-react'
import { useState } from 'react'
import './ActivityBar.css'

interface ActivityBarProps {
  selectedSection: string
  onSectionSelect: (sectionId: string) => void
}

const sections = [
  { id: 'github', label: 'GitHub', icon: Github },
  { id: 'skills', label: 'Skills', icon: Zap },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'automation', label: 'Automation', icon: Bot },
  { id: 'copilot', label: 'Copilot', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function ActivityBar({ selectedSection, onSectionSelect }: ActivityBarProps) {
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
        {sections.map(section => {
          const Icon = section.icon
          const isActive = selectedSection === section.id

          return (
            <button
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
      {hoveredItem && tooltipPosition && (
        <div className="activity-bar-tooltip" style={{ top: tooltipPosition.top }}>
          {sections.find(s => s.id === hoveredItem)?.label}
        </div>
      )}
    </div>
  )
}
