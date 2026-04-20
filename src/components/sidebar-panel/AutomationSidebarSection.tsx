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
import { useToggleSet } from '../../hooks/useToggleSet'

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

const EMPTY_COUNTS: Record<string, number> = {}
const EMPTY_BADGE_PROGRESS: Record<string, { progress: number; color: string; tooltip: string }> =
  {}

export function AutomationSidebarSection({
  jobs,
  schedules,
  selectedItem,
  onItemSelect,
  counts = EMPTY_COUNTS,
  badgeProgress = EMPTY_BADGE_PROGRESS,
}: AutomationSidebarSectionProps) {
  const { has: isExpanded, toggle: toggleSubSection } = useToggleSet()

  const jobsByType = jobs
    ? {
        exec: jobs.filter(j => j.workerType === 'exec'),
        ai: jobs.filter(j => j.workerType === 'ai'),
        skill: jobs.filter(j => j.workerType === 'skill'),
      }
    : null

  const items = [
    { id: 'automation-jobs', label: 'Jobs' },
    { id: 'automation-schedules', label: 'Schedules' },
    { id: 'automation-runs', label: 'Runs' },
  ]

  return (
    <>
      {items.map(item => {
        const isSelected = selectedItem === item.id
        const hasDisclosure =
          (item.id === 'automation-jobs' && jobsByType && jobs && jobs.length > 0) ||
          (item.id === 'automation-schedules' && schedules && schedules.length > 0)

        return (
          <div key={item.id}>
            <div
              className={`sidebar-item ${isSelected ? 'selected' : ''} ${hasDisclosure ? 'sidebar-item-disclosure' : ''}`}
            >
              {item.id === 'automation-jobs' && jobsByType && jobs && jobs.length > 0 ? (
                <button
                  type="button"
                  className="sidebar-item-chevron"
                  onClick={e => {
                    e.stopPropagation()
                    toggleSubSection('automation-jobs')
                  }}
                  aria-label={isExpanded('automation-jobs') ? 'Collapse Jobs' : 'Expand Jobs'}
                >
                  {isExpanded('automation-jobs') ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                </button>
              ) : item.id === 'automation-schedules' && schedules && schedules.length > 0 ? (
                <button
                  type="button"
                  className="sidebar-item-chevron"
                  onClick={e => {
                    e.stopPropagation()
                    toggleSubSection('automation-schedules')
                  }}
                  aria-label={
                    isExpanded('automation-schedules') ? 'Collapse Schedules' : 'Expand Schedules'
                  }
                >
                  {isExpanded('automation-schedules') ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="sidebar-item-main"
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
                  <span className="sidebar-item-icon">
                    <FolderOpen size={14} />
                  </span>
                ) : item.id === 'automation-schedules' && schedules && schedules.length > 0 ? (
                  <span className="sidebar-item-icon">
                    {isExpanded('automation-schedules') ? (
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
              </button>
            </div>

            {/* Schedule sub-tree */}
            {item.id === 'automation-schedules' &&
              isExpanded('automation-schedules') &&
              schedules && (
                <div className="sidebar-job-tree">
                  <div className="sidebar-job-items">
                    {schedules.map(schedule => (
                      <button
                        key={schedule._id}
                        type="button"
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
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/* Job sub-tree */}
            {item.id === 'automation-jobs' && isExpanded('automation-jobs') && jobsByType && (
              <div className="sidebar-job-tree">
                {(['exec', 'ai', 'skill'] as const).map(type => {
                  const typeJobs = jobsByType[type]
                  if (typeJobs.length === 0) return null
                  const info = workerTypeInfo[type]
                  const typeKey = `jobs-${type}`
                  const isTypeExpanded = isExpanded(typeKey)
                  return (
                    <div key={type} className="sidebar-job-category">
                      <button
                        type="button"
                        className="sidebar-job-category-header"
                        onClick={() => toggleSubSection(typeKey)}
                      >
                        <span className="sidebar-item-chevron">
                          {isTypeExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <span className="sidebar-item-icon">{info.icon}</span>
                        <span className="sidebar-item-label">{info.label}</span>
                        <span className="sidebar-item-count">{typeJobs.length}</span>
                      </button>
                      {isTypeExpanded && (
                        <div className="sidebar-job-items">
                          {typeJobs.map(job => (
                            <button
                              key={job._id}
                              type="button"
                              className={`sidebar-item sidebar-job-item ${selectedItem === `job-detail:${job._id}` ? 'selected' : ''}`}
                              onClick={() => onItemSelect(`job-detail:${job._id}`)}
                              title={job.description || job.name}
                            >
                              <span className="sidebar-item-icon">
                                <FileText size={12} />
                              </span>
                              <span className="sidebar-item-label">{job.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
