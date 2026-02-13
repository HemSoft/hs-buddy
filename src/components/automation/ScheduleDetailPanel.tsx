import { Calendar, Clock, Play, Pause, Edit, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useSchedule, useScheduleMutations, useScheduleRuns } from '../../hooks/useConvex'
import { formatDistanceToNow, format } from '../../utils/dateUtils'
import { useState } from 'react'
import { ScheduleEditor } from './ScheduleEditor'
import type { Id } from '../../../convex/_generated/dataModel'
import './ScheduleDetailPanel.css'

interface ScheduleDetailPanelProps {
  scheduleId: string
}

export function ScheduleDetailPanel({ scheduleId }: ScheduleDetailPanelProps) {
  const schedule = useSchedule(scheduleId as Id<"schedules">)
  const runs = useScheduleRuns(scheduleId as Id<"schedules">, 10)
  const { toggle, remove } = useScheduleMutations()
  const [editorOpen, setEditorOpen] = useState(false)

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
    } catch (error) {
      console.error('Failed to toggle schedule:', error)
    }
  }

  const handleDelete = async () => {
    if (confirm(`Delete schedule "${schedule.name}"?`)) {
      try {
        await remove({ id: schedule._id })
      } catch (error) {
        console.error('Failed to delete schedule:', error)
      }
    }
  }

  const getStatusIcon = (status?: 'completed' | 'failed') => {
    if (!status) return <AlertCircle size={14} className="status-icon status-none" />
    if (status === 'completed') return <CheckCircle size={14} className="status-icon status-success" />
    return <XCircle size={14} className="status-icon status-failed" />
  }

  const formatCron = (cron: string): string => {
    const parts = cron.split(' ')
    if (parts.length !== 5) return cron
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
    if (minute === '*' && hour === '*') return 'Every minute'
    if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every hour at :${minute.padStart(2, '0')}`
    }
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }
    if (dayOfWeek === '1-5') {
      return `Weekdays at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dayNames = dayOfWeek.split(',').map(d => days[parseInt(d)] || d).join(', ')
      return `${dayNames} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }
    return cron
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'completed': return 'status-completed'
      case 'failed': return 'status-failed'
      case 'running': return 'status-running'
      case 'pending': return 'status-pending'
      case 'cancelled': return 'status-cancelled'
      default: return ''
    }
  }

  return (
    <div className="schedule-detail">
      {editorOpen && (
        <ScheduleEditor
          scheduleId={scheduleId}
          onClose={() => setEditorOpen(false)}
        />
      )}

      <div className="schedule-detail-header">
        <div className="schedule-detail-title-row">
          <Calendar size={16} className="schedule-icon" />
          <h2>{schedule.name}</h2>
          <span className={`schedule-status-badge ${schedule.enabled ? 'enabled' : 'disabled'}`}>
            {schedule.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="schedule-detail-actions">
          <button className="btn-action" onClick={handleToggle} title={schedule.enabled ? 'Disable' : 'Enable'}>
            {schedule.enabled ? <Pause size={14} /> : <Play size={14} />}
            {schedule.enabled ? 'Disable' : 'Enable'}
          </button>
          <button className="btn-action" onClick={() => setEditorOpen(true)} title="Edit">
            <Edit size={14} />
            Edit
          </button>
          <button className="btn-action btn-danger" onClick={handleDelete} title="Delete">
            <Trash2 size={14} />
          </button>
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
      </div>

      <div className="schedule-detail-section">
        <h3>Linked Job</h3>
        {schedule.job ? (
          <div className="schedule-detail-config">
            <div className="config-field">
              <span className="config-label">Job</span>
              <span className="config-value">{schedule.job.name}</span>
            </div>
            <div className="config-field">
              <span className="config-label">Type</span>
              <span className="config-value">{schedule.job.workerType}</span>
            </div>
          </div>
        ) : (
          <div className="schedule-detail-no-job">Job not found (may have been deleted)</div>
        )}
      </div>

      <div className="schedule-detail-section">
        <h3>Run Status</h3>
        <div className="schedule-detail-config">
          <div className="config-field">
            <span className="config-label">Last Run</span>
            <span className="config-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {schedule.lastRunAt ? (
                <>
                  {getStatusIcon(schedule.lastRunStatus)}
                  {formatDistanceToNow(schedule.lastRunAt)}
                </>
              ) : 'Never'}
            </span>
          </div>
          {schedule.nextRunAt && schedule.enabled && (
            <div className="config-field">
              <span className="config-label">Next Run</span>
              <span className="config-value">{format(schedule.nextRunAt, 'MMM d, h:mm a')}</span>
            </div>
          )}
        </div>
      </div>

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
                  <span className="run-duration">
                    {run.duration < 1000
                      ? `${run.duration}ms`
                      : `${(run.duration / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
