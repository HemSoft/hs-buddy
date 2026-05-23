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

type WorkerType = Job['workerType']
type JobsByType = Record<WorkerType, Job[]>

interface BadgeProgress {
  progress: number
  color: string
  tooltip: string
}

interface AutomationSidebarSectionProps {
  jobs: Job[] | null | undefined
  schedules: Schedule[] | null | undefined
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  counts?: Record<string, number>
  badgeProgress?: Record<string, BadgeProgress>
}

const workerTypeInfo: Record<WorkerType, { label: string; icon: React.ReactNode }> = {
  exec: { label: 'Shell Commands', icon: <Terminal size={14} /> },
  ai: { label: 'AI Prompts', icon: <Brain size={14} /> },
  skill: { label: 'Claude Skills', icon: <Zap size={14} /> },
}

const AUTOMATION_JOBS_ITEM_ID = 'automation-jobs'
const AUTOMATION_SCHEDULES_ITEM_ID = 'automation-schedules'
const AUTOMATION_ITEMS = [
  { id: AUTOMATION_JOBS_ITEM_ID, label: 'Jobs' },
  { id: AUTOMATION_SCHEDULES_ITEM_ID, label: 'Schedules' },
  { id: 'automation-runs', label: 'Runs' },
] as const

const EMPTY_COUNTS: Record<string, number> = {}
const EMPTY_BADGE_PROGRESS: Record<string, BadgeProgress> = {}

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

function getScheduleItemIcon(isScheduleExpanded: boolean): React.ReactNode {
  return isScheduleExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
}

function getItemIcon(
  itemId: string,
  hasJobs: boolean,
  hasSchedules: boolean,
  isScheduleExpanded: boolean
): React.ReactNode {
  if (itemId === AUTOMATION_JOBS_ITEM_ID && hasJobs) return <FolderOpen size={14} />
  if (itemId === AUTOMATION_SCHEDULES_ITEM_ID && hasSchedules) {
    return getScheduleItemIcon(isScheduleExpanded)
  }
  return <FileText size={14} />
}

function getJobsByType(jobs: Job[] | null | undefined): JobsByType | null {
  if (!jobs) return null
  return {
    exec: jobs.filter(job => job.workerType === 'exec'),
    ai: jobs.filter(job => job.workerType === 'ai'),
    skill: jobs.filter(job => job.workerType === 'skill'),
  }
}

function hasItems<T>(items: T[] | null | undefined): boolean {
  return Boolean(items && items.length > 0)
}

function hasItemDisclosure(itemId: string, hasJobs: boolean, hasSchedules: boolean): boolean {
  return (
    (itemId === AUTOMATION_JOBS_ITEM_ID && hasJobs) ||
    (itemId === AUTOMATION_SCHEDULES_ITEM_ID && hasSchedules)
  )
}

function getSidebarItemClassName(isSelected: boolean, hasDisclosure: boolean): string {
  return `sidebar-item ${isSelected ? 'selected' : ''} ${hasDisclosure ? 'sidebar-item-disclosure' : ''}`
}

function handleItemMainClick(
  itemId: string,
  toggleSubSection: (key: string) => void,
  onItemSelect: (id: string) => void
) {
  if (itemId === AUTOMATION_JOBS_ITEM_ID) {
    toggleSubSection(AUTOMATION_JOBS_ITEM_ID)
    return
  }
  if (itemId === AUTOMATION_SCHEDULES_ITEM_ID) {
    toggleSubSection(AUTOMATION_SCHEDULES_ITEM_ID)
    onItemSelect(AUTOMATION_SCHEDULES_ITEM_ID)
    return
  }
  onItemSelect(itemId)
}

function ProgressBadge({ count, progress }: { count: number; progress: BadgeProgress }) {
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

const JOB_SCHEDULE_LISTS: Partial<Record<string, 'jobs' | 'schedules'>> = {
  [AUTOMATION_JOBS_ITEM_ID]: 'jobs',
  [AUTOMATION_SCHEDULES_ITEM_ID]: 'schedules',
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
  const listKey = JOB_SCHEDULE_LISTS[itemId]
  const items = listKey === 'jobs' ? jobs : listKey === 'schedules' ? schedules : null
  if (!items || items.length === 0) return null
  return <span className="sidebar-item-count">{items.length}</span>
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
  badgeProgress: Record<string, BadgeProgress>
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
  jobsByType: JobsByType
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

function getScheduleSubTree(
  itemId: string,
  isExpanded: (key: string) => boolean,
  schedules: Schedule[] | null | undefined,
  selectedItem: string | null,
  onItemSelect: (id: string) => void
): React.ReactNode {
  if (
    itemId !== AUTOMATION_SCHEDULES_ITEM_ID ||
    !isExpanded(AUTOMATION_SCHEDULES_ITEM_ID) ||
    !schedules
  ) {
    return null
  }

  return (
    <ScheduleSubTree
      schedules={schedules}
      selectedItem={selectedItem}
      onItemSelect={onItemSelect}
    />
  )
}

function getJobSubTree(
  itemId: string,
  isExpanded: (key: string) => boolean,
  jobsByType: JobsByType | null,
  selectedItem: string | null,
  onItemSelect: (id: string) => void,
  toggleSubSection: (key: string) => void
): React.ReactNode {
  if (itemId !== AUTOMATION_JOBS_ITEM_ID || !isExpanded(AUTOMATION_JOBS_ITEM_ID) || !jobsByType) {
    return null
  }

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

function renderItemSubTree(
  itemId: string,
  isExpanded: (key: string) => boolean,
  schedules: Schedule[] | null | undefined,
  jobsByType: JobsByType | null,
  selectedItem: string | null,
  onItemSelect: (id: string) => void,
  toggleSubSection: (key: string) => void
): React.ReactNode {
  const scheduleSubTree = getScheduleSubTree(
    itemId,
    isExpanded,
    schedules,
    selectedItem,
    onItemSelect
  )
  if (scheduleSubTree) return scheduleSubTree

  return getJobSubTree(itemId, isExpanded, jobsByType, selectedItem, onItemSelect, toggleSubSection)
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
  jobsByType: JobsByType | null
  schedules: Schedule[] | null | undefined
  counts: Record<string, number>
  badgeProgress: Record<string, BadgeProgress>
  jobs: Job[] | null | undefined
}) {
  const isSelected = selectedItem === item.id
  const hasDisclosure = hasItemDisclosure(item.id, hasJobs, hasSchedules)
  const isScheduleExpanded = isExpanded(AUTOMATION_SCHEDULES_ITEM_ID)

  return (
    <div>
      <div className={getSidebarItemClassName(isSelected, hasDisclosure)}>
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
            {getItemIcon(item.id, hasJobs, hasSchedules, isScheduleExpanded)}
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
  const jobsByType = getJobsByType(jobs)
  const hasJobs = hasItems(jobs)
  const hasSchedules = hasItems(schedules)

  return (
    <>
      {AUTOMATION_ITEMS.map(item => (
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
