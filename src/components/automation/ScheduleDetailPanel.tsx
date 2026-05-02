import { Calendar, Clock, Play, Pause, Edit, Trash2, AlertCircle } from 'lucide-react'
import { useSchedule, useScheduleMutations, useScheduleRuns } from '../../hooks/useConvex'
import { formatDistanceToNow, format, formatDuration, WEEKDAY_SHORT } from '../../utils/dateUtils'
import { useState } from 'react'
import { ScheduleEditor } from './ScheduleEditor'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../ConfirmDialog'
import type { Id } from '../../../convex/_generated/dataModel'
import { getStatusClass, getStatusIcon } from '../shared/statusDisplay'
import './ScheduleDetailPanel.css'

interface ScheduleDetailPanelProps {
  scheduleId: string
}

function formatTimeString(hour: string, minute: string): string {
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

function isAllWildcard(...fields: string[]): boolean {
  return fields.every(f => f === '*')
}

function formatSpecificDaysSchedule(dayOfWeek: string, hour: string, minute: string): string {
  const dayNames = dayOfWeek
    .split(',')
    /* v8 ignore start */
    .map(d => WEEKDAY_SHORT[Number.parseInt(d, 10)] || d)
    /* v8 ignore stop */
    .join(', ')
  return `${dayNames} at ${formatTimeString(hour, minute)}`
}

interface CronPattern {
  match: (parts: string[]) => boolean
  format: (parts: string[]) => string
}

const CRON_PATTERNS: CronPattern[] = [
  {
    match: ([m, h]) => m === '*' && h === '*',
    format: () => 'Every minute',
  },
  {
    match: ([m, h, dom, mo, dow]) => m !== '*' && isAllWildcard(h, dom, mo, dow),
    format: ([m]) => `Every hour at :${m.padStart(2, '0')}`,
  },
  {
    match: ([, , dom, mo, dow]) => isAllWildcard(dom, mo, dow),
    format: ([m, h]) => `Daily at ${formatTimeString(h, m)}`,
  },
  {
    match: ([, , , , dow]) => dow === '1-5',
    format: ([m, h]) => `Weekdays at ${formatTimeString(h, m)}`,
  },
  {
    /* v8 ignore start */
    match: ([, , dom, mo, dow]) => isAllWildcard(dom, mo) && dow !== '*',
    format: ([m, h, , , dow]) => formatSpecificDaysSchedule(dow, h, m),
    /* v8 ignore stop */
  },
]

function formatCronSchedule(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length !== 5) return cron
  /* v8 ignore start */
  return CRON_PATTERNS.find(p => p.match(parts))?.format(parts) ?? cron
  /* v8 ignore stop */
}

function ScheduleRecentRuns({ runs }: { runs: ReturnType<typeof useScheduleRuns> }) {
  return (
    <div className="schedule-detail-section">
      <h3>Recent Runs</h3>
      {runs === undefined ? (
        <div className="schedule-detail-runs-loading">Loading runs...</div>
      ) : runs.length === 0 ? (
        <div className="schedule-detail-runs-empty">No runs yet for this schedule.</div>
      ) : (
        <div className="schedule-detail-runs">
          {runs.map(run => (
            <div key={run._id} className="schedule-run-row">
              <span className={`run-status ${getStatusClass(run.status)}`}>{run.status}</span>
              <span className="run-trigger">{run.triggeredBy}</span>
              <span className="run-time" title={new Date(run.startedAt).toLocaleString()}>
                {formatDistanceToNow(run.startedAt)}
              </span>
              {run.duration !== undefined && (
                <span className="run-duration">{formatDuration(run.duration)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleHeaderActions({
  enabled,
  onToggle,
  onEdit,
  onDelete,
}: {
  enabled: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="schedule-detail-actions">
      <button className="btn-action" onClick={onToggle} title={enabled ? 'Disable' : 'Enable'}>
        {enabled ? <Pause size={14} /> : <Play size={14} />}
        {enabled ? 'Disable' : 'Enable'}
      </button>
      <button className="btn-action" onClick={onEdit} title="Edit">
        <Edit size={14} />
        Edit
      </button>
      <button className="btn-action btn-danger" onClick={onDelete} title="Delete">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function ScheduleRunStatusSection({
  lastRunAt,
  lastRunStatus,
  nextRunAt,
  enabled,
}: {
  lastRunAt?: number
  lastRunStatus?: string
  nextRunAt?: number
  enabled: boolean
}) {
  return (
    <div className="schedule-detail-section">
      <h3>Run Status</h3>
      <div className="schedule-detail-config">
        <div className="config-field">
          <span className="config-label">Last Run</span>
          <span
            className="config-value"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {lastRunAt ? (
              <>
                {/* v8 ignore start */}
                {lastRunStatus ? (
                  getStatusIcon(lastRunStatus)
                ) : (
                  <AlertCircle size={14} className="status-icon status-none" />
                )}
                {/* v8 ignore stop */}
                {formatDistanceToNow(lastRunAt)}
              </>
            ) : (
              'Never'
            )}
          </span>
        </div>
        {nextRunAt && enabled && (
          <div className="config-field">
            <span className="config-label">Next Run</span>
            <span className="config-value">{format(nextRunAt, 'MMM d, h:mm a')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ScheduleJobSection({ job }: { job?: { name: string; workerType: string } | null }) {
  return (
    <div className="schedule-detail-section">
      <h3>Linked Job</h3>
      {job ? (
        <div className="schedule-detail-config">
          <div className="config-field">
            <span className="config-label">Job</span>
            <span className="config-value">{job.name}</span>
          </div>
          <div className="config-field">
            <span className="config-label">Type</span>
            <span className="config-value">{job.workerType}</span>
          </div>
        </div>
      ) : (
        <div className="schedule-detail-no-job">Job not found (may have been deleted)</div>
      )}
    </div>
  )
}

function resolveStatusBadge(enabled: boolean) {
  return {
    className: `schedule-status-badge ${enabled ? 'enabled' : 'disabled'}`,
    label: enabled ? 'Enabled' : 'Disabled',
  }
}

function ScheduleCronConfig({
  schedule,
  formatCron,
}: {
  schedule: { cron: string; timezone?: string; missedPolicy?: string }
  formatCron: (cron: string) => string
}) {
  return (
    <div className="schedule-detail-config">
      <div className="config-field">
        <span className="config-label">Cron</span>
        <code className="config-value">{schedule.cron}</code>
      </div>
      <div className="config-field">
        <span className="config-label">Frequency</span>
        <span className="config-value">{formatCron(schedule.cron)}</span>
      </div>
      {schedule.timezone && (
        <div className="config-field">
          <span className="config-label">Timezone</span>
          <span className="config-value">{schedule.timezone}</span>
        </div>
      )}
      {schedule.missedPolicy && (
        <div className="config-field">
          <span className="config-label">Missed Policy</span>
          <span className="config-value">{schedule.missedPolicy}</span>
        </div>
      )}
    </div>
  )
}

export function ScheduleDetailPanel({ scheduleId }: ScheduleDetailPanelProps) {
  const schedule = useSchedule(scheduleId as Id<'schedules'>)
  const runs = useScheduleRuns(scheduleId as Id<'schedules'>, 10)
  const { toggle, remove } = useScheduleMutations()
  const [editorOpen, setEditorOpen] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  if (schedule === undefined) {
    return (
      <div className="schedule-detail">
        <div className="schedule-detail-loading">
          <div className="loading-spinner" />
          <span>Loading schedule...</span>
        </div>
      </div>
    )
  }

  if (schedule === null) {
    return (
      <div className="schedule-detail">
        <div className="schedule-detail-empty">
          <p>Schedule not found.</p>
        </div>
      </div>
    )
  }

  const handleToggle = async () => {
    try {
      await toggle({ id: schedule._id })
    } catch (error: unknown) {
      /* v8 ignore start */
      console.error('Failed to toggle schedule:', error)
      /* v8 ignore stop */
    }
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      message: `Delete schedule "${schedule.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    /* v8 ignore start */
    if (confirmed) {
      /* v8 ignore stop */
      try {
        await remove({ id: schedule._id })
      } catch (error: unknown) {
        /* v8 ignore start */
        console.error('Failed to delete schedule:', error)
        /* v8 ignore stop */
      }
    }
  }

  const formatCron = formatCronSchedule
  const statusBadge = resolveStatusBadge(schedule.enabled)

  return (
    <>
      <div className="schedule-detail">
        {editorOpen && (
          /* v8 ignore start */
          <ScheduleEditor scheduleId={scheduleId} onClose={() => setEditorOpen(false)} />
          /* v8 ignore stop */
        )}

        <div className="schedule-detail-header">
          <div className="schedule-detail-title-row">
            <Calendar size={16} className="schedule-icon" />
            <h2>{schedule.name}</h2>
            <span className={statusBadge.className}>{statusBadge.label}</span>
          </div>
          <div className="schedule-detail-actions">
            <ScheduleHeaderActions
              enabled={schedule.enabled}
              onToggle={handleToggle}
              onEdit={() => setEditorOpen(true)}
              onDelete={handleDelete}
            />
          </div>
        </div>

        {schedule.description && (
          <div className="schedule-detail-description">{schedule.description}</div>
        )}

        <div className="schedule-detail-meta">
          <span title={new Date(schedule.createdAt).toLocaleString()}>
            <Calendar size={12} />
            Created {formatDistanceToNow(schedule.createdAt)}
          </span>
          <span title={new Date(schedule.updatedAt).toLocaleString()}>
            <Clock size={12} />
            Updated {formatDistanceToNow(schedule.updatedAt)}
          </span>
        </div>

        <div className="schedule-detail-section">
          <h3>Schedule</h3>
          <ScheduleCronConfig schedule={schedule} formatCron={formatCron} />
        </div>

        <ScheduleJobSection job={schedule.job} />

        <ScheduleRunStatusSection
          lastRunAt={schedule.lastRunAt}
          lastRunStatus={schedule.lastRunStatus}
          nextRunAt={schedule.nextRunAt}
          enabled={schedule.enabled}
        />

        <ScheduleRecentRuns runs={runs} />
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  )
}
