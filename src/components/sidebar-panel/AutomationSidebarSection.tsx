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

function DisclosureChevron({
  sectionKey,
  label,
  expanded,
  onToggle,
}: {
  sectionKey: string
  label: string
  expanded: boolean
  onToggle: (key: string) => void
}) {
  return (
    <button
      type="button"
      className="sidebar-item-chevron"
      onClick={e => {
        e.stopPropagation()
        onToggle(sectionKey)
      }}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </button>
  )
}

function getItemIcon(
  itemId: string,
  hasJobs: boolean,
  hasSchedules: boolean,
  isScheduleExpanded: boolean
): React.ReactNode {
  if (itemId === 'automation-jobs' && hasJobs) return <FolderOpen size={14} />
  if (itemId === 'automation-schedules' && hasSchedules) {
    return isScheduleExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
  }
  return <FileText size={14} />
}

function handleItemMainClick(
  itemId: string,
  toggleSubSection: (key: string) => void,
  onItemSelect: (id: string) => void
) {
  if (itemId === 'automation-jobs') {
    toggleSubSection('automation-jobs')
    return
  }
  if (itemId === 'automation-schedules') {
    toggleSubSection('automation-schedules')
    onItemSelect('automation-schedules')
    return
  }
  onItemSelect(itemId)
}

function ProgressBadge({
  count,
  progress,
}: {
  count: number
  progress: { progress: number; color: string; tooltip: string }
}) {
  return (
    <span
      className="sidebar-item-count-ring"
      style={
        {
          '--ring-progress': `${progress.progress}%`,
          '--ring-color': progress.color,
        } as React.CSSProperties
      }
      title={progress.tooltip}
    >
      <span className="sidebar-item-count">{count}</span>
    </span>
  )
}

function JobScheduleCountBadge({
  itemId,
  jobs,
  schedules,
}: {
  itemId: string
  jobs: Job[] | null | undefined
  schedules: Schedule[] | null | undefined
}) {
  if (itemId === 'automation-jobs' && jobs && jobs.length > 0) {
    return <span className="sidebar-item-count">{jobs.length}</span>
  }
  if (itemId === 'automation-schedules' && schedules && schedules.length > 0) {
    return <span className="sidebar-item-count">{schedules.length}</span>
  }
  return null
}

function ItemCountBadge({
  itemId,
  counts,
  badgeProgress,
  jobs,
  schedules,
}: {
  itemId: string
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
  jobs: Job[] | null | undefined
  schedules: Schedule[] | null | undefined
}) {
  const count = counts[itemId]
  const progress = badgeProgress[itemId]
  return (
    <>
      {count !== undefined &&
        (progress ? (
          <ProgressBadge count={count} progress={progress} />
        ) : (
          <span className="sidebar-item-count">{count}</span>
        ))}
      <JobScheduleCountBadge itemId={itemId} jobs={jobs} schedules={schedules} />
    </>
  )
}

function ScheduleSubTree({
  schedules,
  selectedItem,
  onItemSelect,
}: {
  schedules: Schedule[]
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
}) {
  return (
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
            {!schedule.enabled && <span className="sidebar-schedule-disabled">off</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function JobSubTree({
  jobsByType,
  selectedItem,
  onItemSelect,
  isExpanded,
  toggleSubSection,
}: {
  jobsByType: Record<'exec' | 'ai' | 'skill', Job[]>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  isExpanded: (key: string) => boolean
  toggleSubSection: (key: string) => void
}) {
  return (
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
  )
}

function renderItemSubTree(
  itemId: string,
  isExpanded: (key: string) => boolean,
  schedules: Schedule[] | null | undefined,
  jobsByType: Record<'exec' | 'ai' | 'skill', Job[]> | null,
  selectedItem: string | null,
  onItemSelect: (id: string) => void,
  toggleSubSection: (key: string) => void
): React.ReactNode {
  if (itemId === 'automation-schedules' && isExpanded('automation-schedules') && schedules) {
    return (
      <ScheduleSubTree
        schedules={schedules}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
      />
    )
  }
  if (itemId === 'automation-jobs' && isExpanded('automation-jobs') && jobsByType) {
    return (
      <JobSubTree
        jobsByType={jobsByType}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
        isExpanded={isExpanded}
        toggleSubSection={toggleSubSection}
      />
    )
  }
  return null
}

function AutomationSidebarItem({
  item,
  selectedItem,
  isExpanded,
  toggleSubSection,
  onItemSelect,
  hasJobs,
  hasSchedules,
  jobsByType,
  schedules,
  counts,
  badgeProgress,
  jobs,
}: {
  item: { id: string; label: string }
  selectedItem: string | null
  isExpanded: (key: string) => boolean
  toggleSubSection: (key: string) => void
  onItemSelect: (id: string) => void
  hasJobs: boolean
  hasSchedules: boolean
  jobsByType: Record<'exec' | 'ai' | 'skill', Job[]> | null
  schedules: Schedule[] | null | undefined
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
  jobs: Job[] | null | undefined
}) {
  const isSelected = selectedItem === item.id
  const hasDisclosure =
    (item.id === 'automation-jobs' && hasJobs) ||
    (item.id === 'automation-schedules' && hasSchedules)

  return (
    <div>
      <div
        className={`sidebar-item ${isSelected ? 'selected' : ''} ${hasDisclosure ? 'sidebar-item-disclosure' : ''}`}
      >
        {hasDisclosure && (
          <DisclosureChevron
            sectionKey={item.id}
            label={item.label}
            expanded={isExpanded(item.id)}
            onToggle={toggleSubSection}
          />
        )}
        <button
          type="button"
          className="sidebar-item-main"
          onClick={() => handleItemMainClick(item.id, toggleSubSection, onItemSelect)}
        >
          <span className="sidebar-item-icon">
            {getItemIcon(item.id, hasJobs, hasSchedules, isExpanded('automation-schedules'))}
          </span>
          <span className="sidebar-item-label">{item.label}</span>
          <ItemCountBadge
            itemId={item.id}
            counts={counts}
            badgeProgress={badgeProgress}
            jobs={jobs}
            schedules={schedules}
          />
        </button>
      </div>
      {renderItemSubTree(
        item.id,
        isExpanded,
        schedules,
        jobsByType,
        selectedItem,
        onItemSelect,
        toggleSubSection
      )}
    </div>
  )
}

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

  const hasJobs = Boolean(jobsByType && jobs && jobs.length > 0)
  const hasSchedules = Boolean(schedules && schedules.length > 0)

  const items = [
    { id: 'automation-jobs', label: 'Jobs' },
    { id: 'automation-schedules', label: 'Schedules' },
    { id: 'automation-runs', label: 'Runs' },
  ]

  return (
    <>
      {items.map(item => (
        <AutomationSidebarItem
          key={item.id}
          item={item}
          selectedItem={selectedItem}
          isExpanded={isExpanded}
          toggleSubSection={toggleSubSection}
          onItemSelect={onItemSelect}
          hasJobs={hasJobs}
          hasSchedules={hasSchedules}
          jobsByType={jobsByType}
          schedules={schedules}
          counts={counts}
          badgeProgress={badgeProgress}
          jobs={jobs}
        />
      ))}
    </>
  )
}
