import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import './SidebarPanel.css'

interface SidebarPanelProps {
  section: string
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

interface SidebarItem {
  id: string
  label: string
}

const sectionData: Record<string, { title: string; items: SidebarItem[] }> = {
  'pull-requests': {
    title: 'Pull Requests',
    items: [
      { id: 'pr-my-prs', label: 'My PRs' },
      { id: 'pr-needs-review', label: 'Needs Review' },
      { id: 'pr-recently-merged', label: 'Recently Merged' },
    ]
  },
  'skills': {
    title: 'Skills',
    items: [
      { id: 'skills-browser', label: 'Browse Skills' },
      { id: 'skills-recent', label: 'Recently Used' },
      { id: 'skills-favorites', label: 'Favorites' },
    ]
  },
  'tasks': {
    title: 'Tasks',
    items: [
      { id: 'tasks-today', label: 'Today' },
      { id: 'tasks-upcoming', label: 'Upcoming' },
      { id: 'tasks-projects', label: 'Projects' },
    ]
  },
  'insights': {
    title: 'Insights',
    items: [
      { id: 'insights-productivity', label: 'Productivity' },
      { id: 'insights-activity', label: 'Activity' },
    ]
  },
  'settings': {
    title: 'Settings',
    items: []
  }
}

export function SidebarPanel({ section, onItemSelect, selectedItem }: SidebarPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([section]))
  const data = sectionData[section]

  if (!data) {
    return null
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const isExpanded = expandedSections.has(section)

  // If settings, just render the settings view directly
  if (section === 'settings') {
    onItemSelect('settings')
    return null
  }

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>{data.title.toUpperCase()}</h2>
      </div>
      <div className="sidebar-panel-content">
        <div className="sidebar-section">
          <div 
            className="sidebar-section-header"
            onClick={() => toggleSection(section)}
          >
            <div className="sidebar-section-title">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{data.title}</span>
            </div>
          </div>
          {isExpanded && data.items.length > 0 && (
            <div className="sidebar-section-items">
              {data.items.map(item => (
                <div
                  key={item.id}
                  className={`sidebar-item ${selectedItem === item.id ? 'selected' : ''}`}
                  onClick={() => onItemSelect(item.id)}
                >
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
