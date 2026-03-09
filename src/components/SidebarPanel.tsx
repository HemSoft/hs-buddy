import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Plus } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { CopilotSidebar } from './sidebar/CopilotSidebar'
import { GitHubSidebar } from './sidebar/GitHubSidebar'
import { CrewSidebar } from './crew/CrewSidebar'
import { useJobs, useSchedules } from '../hooks/useConvex'
import { AutomationSidebarSection } from './sidebar-panel/AutomationSidebarSection'
import './SidebarPanel.css'

interface SidebarPanelProps {
  section: string
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
  counts?: Record<string, number>
  badgeProgress?: Record<string, { progress: number; color: string; tooltip: string }>
  onCreateNew?: (type: 'schedule' | 'job') => void
}

interface SidebarItem {
  id: string
  label: string
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
      { id: 'settings-advanced', label: 'Advanced' },
    ],
  },
  crew: { title: 'The Crew', items: [] },
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
  onCreateNew,
}: SidebarPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([section]))
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(
    null
  )
  const data = sectionData[section]
  const jobs = useJobs()
  const schedules = useSchedules()

  useEffect(() => {
    setExpandedSections(prev => {
      if (prev.has(section)) return prev
      return new Set([...prev, section])
    })
  }, [section])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu, closeContextMenu])

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

  if (section === 'copilot') {
    return <CopilotSidebar onItemSelect={onItemSelect} selectedItem={selectedItem} />
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const isExpanded = expandedSections.has(section)

  const handleContextMenu = (e: React.MouseEvent, itemId: string) => {
    if (itemId === 'automation-schedules' || itemId === 'automation-jobs') {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, itemId })
    }
  }

  const handleCreateNew = () => {
    if (contextMenu) {
      if (contextMenu.itemId === 'automation-schedules') onCreateNew?.('schedule')
      else if (contextMenu.itemId === 'automation-jobs') onCreateNew?.('job')
      setContextMenu(null)
    }
  }

  return (
    <div className="sidebar-panel">
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={closeContextMenu} aria-hidden="true" />
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button onClick={handleCreateNew}>
              <Plus size={14} />
              {contextMenu.itemId === 'automation-schedules' ? 'New Schedule' : 'New Job'}
            </button>
          </div>
        </>
      )}
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
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSection(section)
              }
            }}
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
                    onContextMenu={e => handleContextMenu(e, item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(item.id); } }}
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
