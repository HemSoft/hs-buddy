import { useState } from 'react'
import { Calendar, Clock, Play, Pause, Trash2, Edit, Plus, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useSchedules, useScheduleMutations } from '../../hooks/useConvex'
import { formatDistanceToNow, format } from '../../utils/dateUtils'
import { ScheduleEditor } from './ScheduleEditor'
import './ScheduleList.css'

// Schedule type matching Convex schema
interface Schedule {
  _id: string
  _creationTime: number
  name: string
  description?: string
  cron: string
  jobId: string
  enabled: boolean
  lastRunAt?: number
  nextRunAt?: number
  lastRunStatus?: 'completed' | 'failed'
  createdAt: number
  updatedAt: number
  job?: {
    _id: string
    name: string
    workerType: 'exec' | 'ai' | 'skill'
  }
}

interface ScheduleListProps {
  createTrigger?: number // Increment to trigger create dialog
}

export function ScheduleList({ createTrigger }: ScheduleListProps) {
  const schedules = useSchedules()
  const { toggle, remove } = useScheduleMutations()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | undefined>()
  const [lastCreateTrigger, setLastCreateTrigger] = useState(0)

  // Open create dialog when createTrigger changes
  if (createTrigger && createTrigger > lastCreateTrigger) {
    setLastCreateTrigger(createTrigger)
    setEditingScheduleId(undefined)
    setEditorOpen(true)
  }

  const handleCreate = () => {
    setEditingScheduleId(undefined)
    setEditorOpen(true)
  }

  const handleEdit = (scheduleId: string) => {
    setEditingScheduleId(scheduleId)
    setEditorOpen(true)
  }

  const handleEditorClose = () => {
    setEditorOpen(false)
    setEditingScheduleId(undefined)
  }

  if (schedules === undefined) {
    return (
      <div className="schedule-list">
        <div className="schedule-list-loading">
          <div className="loading-spinner" />
          <span>Loading schedules...</span>
        </div>
      </div>
    )
  }

  if (schedules.length === 0) {
    return (
      <div className="schedule-list">
        <div className="schedule-list-empty">
          <Calendar size={48} strokeWidth={1.5} />
          <h3>No Schedules</h3>
          <p>Create your first schedule to automate recurring tasks.</p>
          <button className="btn-primary" onClick={handleCreate}>
            <Plus size={16} />
            Create Schedule
          </button>
          {editorOpen && (
            <ScheduleEditor
              scheduleId={editingScheduleId}
              onClose={handleEditorClose}
            />
          )}
        </div>
      </div>
    )
  }

  const handleToggle = async (scheduleId: string) => {
    try {
      await toggle({ id: scheduleId as any })
    } catch (error) {
      console.error('Failed to toggle schedule:', error)
    }
  }

  const handleDelete = async (scheduleId: string, name: string) => {
    if (confirm(`Delete schedule "${name}"?`)) {
      try {
        await remove({ id: scheduleId as any })
      } catch (error) {
        console.error('Failed to delete schedule:', error)
      }
    }
  }

  const getStatusIcon = (lastRunStatus?: 'completed' | 'failed') => {
    if (!lastRunStatus) return <AlertCircle size={14} className="status-icon status-none" />
    if (lastRunStatus === 'completed') return <CheckCircle size={14} className="status-icon status-success" />
    return <XCircle size={14} className="status-icon status-failed" />
  }

  const formatCron = (cron: string): string => {
    // Simple cron to human readable
    const parts = cron.split(' ')
    if (parts.length !== 5) return cron

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

    // Every minute
    if (minute === '*' && hour === '*') return 'Every minute'
    
    // Hourly
    if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every hour at :${minute.padStart(2, '0')}`
    }

    // Daily
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }

    // Weekdays
    if (dayOfWeek === '1-5') {
      return `Weekdays at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }

    // Weekly
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dayNames = dayOfWeek.split(',').map(d => days[parseInt(d)] || d).join(', ')
      return `${dayNames} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }

    return cron
  }

  return (
    <div className="schedule-list">
      <div className="schedule-list-header">
        <h2>Schedules</h2>
        <button className="btn-icon" onClick={handleCreate} title="Create Schedule">
          <Plus size={18} />
        </button>
      </div>

      {editorOpen && (
        <ScheduleEditor
          scheduleId={editingScheduleId}
          onClose={handleEditorClose}
        />
      )}

      <div className="schedule-list-content">
        {(schedules as Schedule[]).map((schedule: Schedule) => (
          <div 
            key={schedule._id} 
            className={`schedule-card ${schedule.enabled ? '' : 'disabled'}`}
          >
            <div className="schedule-card-header">
              <div className="schedule-card-title">
                <span className="schedule-name">{schedule.name}</span>
                {schedule.job && (
                  <span className="schedule-job">
                    {schedule.job.workerType}: {schedule.job.name}
                  </span>
                )}
              </div>
              <div className="schedule-card-actions">
                <button 
                  className={`btn-toggle ${schedule.enabled ? 'enabled' : ''}`}
                  onClick={() => handleToggle(schedule._id)}
                  title={schedule.enabled ? 'Disable' : 'Enable'}
                >
                  {schedule.enabled ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button 
                  className="btn-icon-sm"
                  onClick={() => handleEdit(schedule._id)}
                  title="Edit"
                >
                  <Edit size={14} />
                </button>
                <button 
                  className="btn-icon-sm btn-danger"
                  onClick={() => handleDelete(schedule._id, schedule.name)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="schedule-card-body">
              <div className="schedule-info">
                <div className="schedule-info-item">
                  <Clock size={14} />
                  <span>{formatCron(schedule.cron)}</span>
                </div>
                {schedule.lastRunAt && (
                  <div className="schedule-info-item">
                    {getStatusIcon(schedule.lastRunStatus)}
                    <span>Last run: {formatDistanceToNow(schedule.lastRunAt)}</span>
                  </div>
                )}
                {schedule.nextRunAt && schedule.enabled && (
                  <div className="schedule-info-item">
                    <Calendar size={14} />
                    <span>Next: {format(schedule.nextRunAt, 'MMM d, h:mm a')}</span>
                  </div>
                )}
              </div>
            </div>

            {schedule.description && (
              <div className="schedule-card-description">
                {schedule.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
