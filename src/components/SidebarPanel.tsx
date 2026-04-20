import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useEffect } from 'react'
import { BookmarksSidebar } from './sidebar/BookmarksSidebar'
import { CopilotSidebar } from './sidebar/CopilotSidebar'
import { GitHubSidebar } from './sidebar/GitHubSidebar'
import { CrewSidebar } from './crew/CrewSidebar'
import { useJobs, useSchedules } from '../hooks/useConvex'
import { useToggleSet } from '../hooks/useToggleSet'
import { onKeyboardActivate } from '../utils/keyboard'
import { AutomationSidebarSection } from './sidebar-panel/AutomationSidebarSection'
import type { SidebarItem } from './sidebar/github-sidebar/useGitHubSidebarData'
import './SidebarPanel.css'

interface SidebarPanelProps {
  section: string
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
  counts?: Record<string, number>
  badgeProgress?: Record<string, { progress: number; color: string; tooltip: string }>
}

const sectionData: Record<string, { title: string; items: SidebarItem[] }> = {
  github: { title: 'GitHub', items: [] },
  skills: {
    title: 'Skills',
    items: [
      { id: 'skills-browser', label: 'Browse Skills' },
      { id: 'skills-recent', label: 'Recently Used' },
      { id: 'skills-favorites', label: 'Favorites' },
    ],
  },
  tasks: {
    title: 'Tasks',
    items: [
      { id: 'tasks-today', label: 'Today' },
      { id: 'tasks-upcoming', label: 'Upcoming' },
      { id: 'tasks-projects', label: 'Projects' },
    ],
  },
  insights: {
    title: 'Insights',
    items: [
      { id: 'insights-productivity', label: 'Productivity' },
      { id: 'insights-activity', label: 'Activity' },
    ],
  },
  automation: {
    title: 'Automation',
    items: [], // rendered via AutomationSidebarSection
  },
  settings: {
    title: 'Settings',
    items: [
      { id: 'settings-accounts', label: 'Accounts' },
      { id: 'settings-appearance', label: 'Appearance' },
      { id: 'settings-pullrequests', label: 'Pull Requests' },
      { id: 'settings-copilot', label: 'Copilot SDK' },
      { id: 'settings-notifications', label: 'Notifications' },
      { id: 'settings-advanced', label: 'Advanced' },
    ],
  },
  crew: { title: 'The Crew', items: [] },
  bookmarks: { title: 'Bookmarks', items: [] },
  tempo: {
    title: 'Tempo',
    items: [{ id: 'tempo-timesheet', label: 'Timesheet' }],
  },
  copilot: { title: 'Copilot', items: [] },
}

const DEFAULT_COUNTS: Record<string, number> = {}
const DEFAULT_BADGE_PROGRESS: Record<string, { progress: number; color: string; tooltip: string }> =
  {}

export function SidebarPanel({
  section,
  onItemSelect,
  selectedItem,
  counts = DEFAULT_COUNTS,
  badgeProgress = DEFAULT_BADGE_PROGRESS,
}: SidebarPanelProps) {
  const {
    has: isSectionExpanded,
    toggle: toggleSection,
    add: expandSection,
  } = useToggleSet([section])
  const data = sectionData[section]
  const jobs = useJobs()
  const schedules = useSchedules()

  useEffect(() => {
    expandSection(section)
    // Auto-select when a section has exactly one item
    const items = sectionData[section]?.items
    if (items?.length === 1) {
      onItemSelect(items[0].id)
    }
  }, [section, onItemSelect, expandSection])

  if (!data) return null

  if (section === 'github') {
    return (
      <GitHubSidebar
        onItemSelect={onItemSelect}
        selectedItem={selectedItem}
        counts={counts}
        badgeProgress={badgeProgress}
      />
    )
  }

  if (section === 'crew') {
    return <CrewSidebar onItemSelect={onItemSelect} selectedItem={selectedItem} />
  }

  if (section === 'bookmarks') {
    return <BookmarksSidebar onItemSelect={onItemSelect} selectedItem={selectedItem} />
  }

  if (section === 'copilot') {
    return <CopilotSidebar onItemSelect={onItemSelect} selectedItem={selectedItem} />
  }

  const isExpanded = isSectionExpanded(section)

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>{data.title.toUpperCase()}</h2>
      </div>
      <div className="sidebar-panel-content">
        <div className="sidebar-section">
          <div
            className="sidebar-section-header"
            role="button"
            tabIndex={0}
            onClick={() => toggleSection(section)}
            onKeyDown={onKeyboardActivate(() => toggleSection(section))}
          >
            <div className="sidebar-section-title">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="sidebar-section-icon">
                {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
              </span>
              <span>{data.title}</span>
            </div>
          </div>
          {isExpanded && (
            <div className="sidebar-section-items">
              {section === 'automation' ? (
                <AutomationSidebarSection
                  jobs={jobs}
                  schedules={schedules}
                  selectedItem={selectedItem}
                  onItemSelect={onItemSelect}
                  counts={counts}
                  badgeProgress={badgeProgress}
                />
              ) : (
                data.items.map(item => (
                  <div
                    key={item.id}
                    className={`sidebar-item ${selectedItem === item.id ? 'selected' : ''}`}
                    onClick={() => onItemSelect(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={onKeyboardActivate(() => onItemSelect(item.id))}
                  >
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
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
