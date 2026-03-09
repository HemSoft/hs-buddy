import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Terminal,
  Brain,
  Zap,
} from 'lucide-react'

interface Job {
  _id: string
  name: string
  description?: string
  workerType: 'exec' | 'ai' | 'skill'
}

interface Schedule {
  _id: string
  name: string
  description?: string
  enabled: boolean
}

interface AutomationSidebarSectionProps {
  jobs: Job[] | null | undefined
  schedules: Schedule[] | null | undefined
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  counts?: Record<string, number>
  badgeProgress?: Record<string, { progress: number; color: string; tooltip: string }>
}

const workerTypeInfo: Record<string, { label: string; icon: React.ReactNode }> = {
  exec: { label: 'Shell Commands', icon: <Terminal size={14} /> },
  ai: { label: 'AI Prompts', icon: <Brain size={14} /> },
  skill: { label: 'Claude Skills', icon: <Zap size={14} /> },
}

export function AutomationSidebarSection({
  jobs,
  schedules,
  selectedItem,
  onItemSelect,
  counts = {},
  badgeProgress = {},
}: AutomationSidebarSectionProps) {
  const [expandedSubSections, setExpandedSubSections] = useState<Set<string>>(new Set())

  const jobsByType = jobs
    ? {
        exec: jobs.filter(j => j.workerType === 'exec'),
        ai: jobs.filter(j => j.workerType === 'ai'),
        skill: jobs.filter(j => j.workerType === 'skill'),
      }
    : null

  const toggleSubSection = (key: string) => {
    setExpandedSubSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const items = [
    { id: 'automation-jobs', label: 'Jobs' },
    { id: 'automation-schedules', label: 'Schedules' },
    { id: 'automation-runs', label: 'Runs' },
  ]

  return (
    <>
      {items.map(item => (
        <div key={item.id}>
          <div
            className={`sidebar-item ${item.id === 'automation-schedules' && selectedItem === 'automation-schedules' ? 'selected' : ''} ${item.id !== 'automation-jobs' && item.id !== 'automation-schedules' && selectedItem === item.id ? 'selected' : ''} ${(item.id === 'automation-jobs' && jobsByType && jobs && jobs.length > 0) || (item.id === 'automation-schedules' && schedules && schedules.length > 0) ? 'sidebar-item-disclosure' : ''}`}
            onClick={() => {
              if (item.id === 'automation-jobs') {
                toggleSubSection('automation-jobs')
                return
              }
              if (item.id === 'automation-schedules') {
                toggleSubSection('automation-schedules')
                onItemSelect('automation-schedules')
                return
              }
              onItemSelect(item.id)
            }}
          >
            {item.id === 'automation-jobs' && jobsByType && jobs && jobs.length > 0 ? (
              <span
                className="sidebar-item-chevron"
                onClick={e => {
                  e.stopPropagation()
                  toggleSubSection('automation-jobs')
                }}
              >
                {expandedSubSections.has('automation-jobs') ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </span>
            ) : item.id === 'automation-schedules' && schedules && schedules.length > 0 ? (
              <span
                className="sidebar-item-chevron"
                onClick={e => {
                  e.stopPropagation()
                  toggleSubSection('automation-schedules')
                }}
              >
                {expandedSubSections.has('automation-schedules') ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </span>
            ) : null}

            {item.id === 'automation-jobs' && jobsByType && jobs && jobs.length > 0 ? (
              <span className="sidebar-item-icon">
                <FolderOpen size={14} />
              </span>
            ) : item.id === 'automation-schedules' && schedules && schedules.length > 0 ? (
              <span className="sidebar-item-icon">
                {expandedSubSections.has('automation-schedules') ? (
                  <FolderOpen size={14} />
                ) : (
                  <Folder size={14} />
                )}
              </span>
            ) : (
              <span className="sidebar-item-icon">
                <FileText size={14} />
              </span>
            )}

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

            {item.id === 'automation-jobs' && jobs && jobs.length > 0 && (
              <span className="sidebar-item-count">{jobs.length}</span>
            )}
            {item.id === 'automation-schedules' && schedules && schedules.length > 0 && (
              <span className="sidebar-item-count">{schedules.length}</span>
            )}
          </div>

          {/* Schedule sub-tree */}
          {item.id === 'automation-schedules' &&
            expandedSubSections.has('automation-schedules') &&
            schedules && (
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
                      {!schedule.enabled && <span className="sidebar-schedule-disabled">off</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Job sub-tree */}
          {item.id === 'automation-jobs' &&
            expandedSubSections.has('automation-jobs') &&
            jobsByType && (
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
                        <span className="sidebar-item-chevron">
                          {isTypeExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="sidebar-item-icon">{info.icon}</span>
                        <span className="sidebar-item-label">{info.label}</span>
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
    </>
  )
}
