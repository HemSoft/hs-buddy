import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Terminal,
  Brain,
  Zap,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { CopilotSidebar } from './sidebar/CopilotSidebar'
import { GitHubSidebar } from './sidebar/GitHubSidebar'
import { useJobs, useSchedules } from '../hooks/useConvex'
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
  github: {
    title: 'GitHub',
    items: [], // Rendered specially — see GitHubSidebar below
  },
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
    items: [
      { id: 'automation-jobs', label: 'Jobs' },  // dynamic children rendered below
      { id: 'automation-schedules', label: 'Schedules' },
      { id: 'automation-runs', label: 'Runs' },
    ],
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
  copilot: {
    title: 'Copilot',
    items: [], // Rendered specially — see CopilotSidebar below
  },
}

export function SidebarPanel({
  section,
  onItemSelect,
  selectedItem,
  counts = {},
  badgeProgress = {},
  onCreateNew,
}: SidebarPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([section]))
  const [expandedSubSections, setExpandedSubSections] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(
    null
  )
  const data = sectionData[section]
  const jobs = useJobs()
  const schedules = useSchedules()

  // Group jobs by worker type for the sidebar tree
  const jobsByType = jobs
    ? {
        exec: jobs.filter(j => j.workerType === 'exec'),
        ai: jobs.filter(j => j.workerType === 'ai'),
        skill: jobs.filter(j => j.workerType === 'skill'),
      }
    : null

  const workerTypeInfo: Record<string, { label: string; icon: React.ReactNode }> = {
    exec: { label: 'Shell Commands', icon: <Terminal size={14} /> },
    ai: { label: 'AI Prompts', icon: <Brain size={14} /> },
    skill: { label: 'Claude Skills', icon: <Zap size={14} /> },
  }

  const toggleSubSection = (key: string) => {
    setExpandedSubSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Auto-expand section when it changes
  useEffect(() => {
    setExpandedSections(prev => {
      if (prev.has(section)) return prev
      return new Set([...prev, section])
    })
  }, [section])

  if (!data) {
    return null
  }

  // Special rendering for the GitHub section
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

  // Special rendering for the Copilot section
  if (section === 'copilot') {
    return (
      <CopilotSidebar
        onItemSelect={onItemSelect}
        selectedItem={selectedItem}
      />
    )
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

  const handleContextMenu = (e: React.MouseEvent, itemId: string) => {
    // Only show context menu for items that support creation
    if (itemId === 'automation-schedules' || itemId === 'automation-jobs') {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, itemId })
    }
  }

  const handleCreateNew = () => {
    if (contextMenu) {
      if (contextMenu.itemId === 'automation-schedules') {
        onCreateNew?.('schedule')
      } else if (contextMenu.itemId === 'automation-jobs') {
        onCreateNew?.('job')
      }
      setContextMenu(null)
    }
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  return (
    <div className="sidebar-panel">
      {/* Context Menu Overlay */}
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={closeContextMenu} />
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
          <div className="sidebar-section-header" onClick={() => toggleSection(section)}>
            <div className="sidebar-section-title">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="sidebar-section-icon">
                {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
              </span>
              <span>{data.title}</span>
            </div>
          </div>
          {isExpanded && data.items.length > 0 && (
            <div className="sidebar-section-items">
              {data.items.map(item => (
                <div key={item.id}>
                  <div
                    className={`sidebar-item ${item.id === 'automation-schedules' && selectedItem === 'automation-schedules' ? 'selected' : ''} ${item.id !== 'automation-jobs' && item.id !== 'automation-schedules' && selectedItem === item.id ? 'selected' : ''}`}
                    onClick={() => {
                      if (item.id === 'automation-jobs') {
                        toggleSubSection('automation-jobs')
                        return  // folder-only — don't open a tab
                      }
                      if (item.id === 'automation-schedules') {
                        toggleSubSection('automation-schedules')
                        onItemSelect('automation-schedules') // open overview panel
                        return
                      }
                      onItemSelect(item.id)
                    }}
                    onContextMenu={e => handleContextMenu(e, item.id)}
                  >
                    {/* Show chevron for Jobs if we have sub-items */}
                    {item.id === 'automation-jobs' && jobsByType && jobs && jobs.length > 0 ? (
                      <span className="sidebar-item-icon">
                        <FolderOpen size={14} />
                      </span>
                    ) : item.id === 'automation-schedules' && schedules && schedules.length > 0 ? (
                      <span className="sidebar-item-icon">
                        {expandedSubSections.has('automation-schedules') ? <FolderOpen size={14} /> : <Folder size={14} />}
                      </span>
                    ) : (
                      <span className="sidebar-item-icon">
                        <FileText size={14} />
                      </span>
                    )}
                    <span className="sidebar-item-label">{item.label}</span>

                    {item.id === 'automation-jobs' && jobsByType && jobs && jobs.length > 0 ? (
                      <span
                        className="sidebar-item-chevron"
                        onClick={(e) => { e.stopPropagation(); toggleSubSection('automation-jobs') }}
                      >
                        {expandedSubSections.has('automation-jobs')
                          ? <ChevronDown size={12} />
                          : <ChevronRight size={12} />}
                      </span>
                    ) : item.id === 'automation-schedules' && schedules && schedules.length > 0 ? (
                      <span
                        className="sidebar-item-chevron"
                        onClick={(e) => { e.stopPropagation(); toggleSubSection('automation-schedules') }}
                      >
                        {expandedSubSections.has('automation-schedules')
                          ? <ChevronDown size={12} />
                          : <ChevronRight size={12} />}
                      </span>
                    ) : null}
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
                    {/* Show job count badge for Jobs item */}
                    {item.id === 'automation-jobs' && jobs && jobs.length > 0 && (
                      <span className="sidebar-item-count">{jobs.length}</span>
                    )}
                    {/* Show schedule count badge for Schedules item */}
                    {item.id === 'automation-schedules' && schedules && schedules.length > 0 && (
                      <span className="sidebar-item-count">{schedules.length}</span>
                    )}
                  </div>

                  {/* Schedule sub-tree: individual schedule items */}
                  {item.id === 'automation-schedules' && expandedSubSections.has('automation-schedules') && schedules && (
                    <div className="sidebar-job-tree">
                      <div className="sidebar-job-items">
                        {schedules.map(schedule => (
                          <div
                            key={schedule._id}
                            className={`sidebar-item sidebar-job-item ${selectedItem === `schedule-detail:${schedule._id}` ? 'selected' : ''}`}
                            onClick={() => onItemSelect(`schedule-detail:${schedule._id}`)}
                            title={schedule.description || schedule.name}
                          >
                            <span className="sidebar-item-icon">
                              <FileText size={12} />
                            </span>
                            <span className="sidebar-item-label">{schedule.name}</span>
                            {!schedule.enabled && (
                              <span className="sidebar-schedule-disabled">off</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Job sub-tree: grouped by worker type */}
                  {item.id === 'automation-jobs' && expandedSubSections.has('automation-jobs') && jobsByType && (
                    <div className="sidebar-job-tree">
                      {(['exec', 'ai', 'skill'] as const).map(type => {
                        const typeJobs = jobsByType[type]
                        if (typeJobs.length === 0) return null
                        const info = workerTypeInfo[type]
                        const typeKey = `jobs-${type}`
                        const isTypeExpanded = expandedSubSections.has(typeKey)
                        return (
                          <div key={type} className="sidebar-job-category">
                            <div
                              className="sidebar-job-category-header"
                              onClick={() => toggleSubSection(typeKey)}
                            >
                              <span className="sidebar-item-icon">{info.icon}</span>
                              <span className="sidebar-item-label">{info.label}</span>
                              <span className="sidebar-item-chevron">
                                {isTypeExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              </span>
                              <span className="sidebar-item-count">{typeJobs.length}</span>
                            </div>
                            {isTypeExpanded && (
                              <div className="sidebar-job-items">
                                {typeJobs.map(job => (
                                  <div
                                    key={job._id}
                                    className={`sidebar-item sidebar-job-item ${selectedItem === `job-detail:${job._id}` ? 'selected' : ''}`}
                                    onClick={() => onItemSelect(`job-detail:${job._id}`)}
                                    title={job.description || job.name}
                                  >
                                    <span className="sidebar-item-icon">
                                      <FileText size={12} />
                                    </span>
                                    <span className="sidebar-item-label">{job.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
