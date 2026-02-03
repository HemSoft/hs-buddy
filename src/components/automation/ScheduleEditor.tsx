import { useState, useEffect } from 'react'
import { X, Save, Calendar, AlertCircle } from 'lucide-react'
import { CronBuilder } from './CronBuilder'
import { useJobs, useScheduleMutations, useSchedule, JobId } from '../../hooks/useConvex'
import { Id } from '../../../convex/_generated/dataModel'
import './ScheduleEditor.css'

interface ScheduleEditorProps {
  scheduleId?: string // If provided, editing; otherwise creating
  onClose: () => void
  onSaved?: () => void
}

export function ScheduleEditor({ scheduleId, onClose, onSaved }: ScheduleEditorProps) {
  const jobs = useJobs()
  const existingSchedule = useSchedule(scheduleId as Id<"schedules"> | undefined)
  const { create, update } = useScheduleMutations()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [jobId, setJobId] = useState<string>('')
  const [cron, setCron] = useState('0 9 * * *') // Default: daily at 9 AM
  const [enabled, setEnabled] = useState(true)
  const [missedPolicy, setMissedPolicy] = useState<'skip' | 'catchup' | 'last'>('skip')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!scheduleId

  // Populate form when editing
  useEffect(() => {
    if (existingSchedule) {
      setName(existingSchedule.name)
      setDescription(existingSchedule.description || '')
      setJobId(existingSchedule.jobId)
      setCron(existingSchedule.cron)
      setEnabled(existingSchedule.enabled)
      // missedPolicy may not exist on old schedules
      if ('missedPolicy' in existingSchedule) {
        setMissedPolicy(existingSchedule.missedPolicy as 'skip' | 'catchup' | 'last')
      }
    }
  }, [existingSchedule])

  // Set default job when loaded
  useEffect(() => {
    if (!jobId && jobs && jobs.length > 0) {
      setJobId(jobs[0]._id)
    }
  }, [jobs, jobId])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      setError('Schedule name is required')
      return
    }
    if (!jobId) {
      setError('Please select a job')
      return
    }

    setError(null)
    setSaving(true)

    try {
      if (isEditing && scheduleId) {
        await update({
          id: scheduleId as Id<"schedules">,
          name: name.trim(),
          description: description.trim() || undefined,
          cron,
          enabled,
          missedPolicy,
        })
      } else {
        await create({
          name: name.trim(),
          description: description.trim() || undefined,
          jobId: jobId as JobId,
          cron,
          enabled,
          missedPolicy,
        })
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  const selectedJob = jobs?.find(j => j._id === jobId)

  return (
    <div className="schedule-editor-overlay" onClick={handleOverlayClick}>
      <div className="schedule-editor">
        <div className="schedule-editor-header">
          <div className="schedule-editor-title">
            <Calendar size={20} />
            <h2>{isEditing ? 'Edit Schedule' : 'Create Schedule'}</h2>
          </div>
          <button className="btn-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="schedule-editor-content">
          {error && (
            <div className="schedule-editor-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="schedule-name">Name</label>
            <input
              id="schedule-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Daily PR Check"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="schedule-description">Description</label>
            <textarea
              id="schedule-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description of what this schedule does"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="schedule-job">Job</label>
            {jobs === undefined ? (
              <div className="form-loading">Loading jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="form-empty">
                No jobs available. Create a job first.
              </div>
            ) : (
              <select
                id="schedule-job"
                value={jobId}
                onChange={e => setJobId(e.target.value)}
                disabled={isEditing} // Can't change job when editing
              >
                {jobs.map(j => (
                  <option key={j._id} value={j._id}>
                    [{j.workerType}] {j.name}
                  </option>
                ))}
              </select>
            )}
            {selectedJob?.description && (
              <div className="form-hint">{selectedJob.description}</div>
            )}
          </div>

          <div className="form-group">
            <label>Schedule</label>
            <CronBuilder value={cron} onChange={setCron} />
          </div>

          <div className="form-group">
            <label htmlFor="missed-policy">When Missed</label>
            <select
              id="missed-policy"
              value={missedPolicy}
              onChange={e => setMissedPolicy(e.target.value as 'skip' | 'catchup' | 'last')}
            >
              <option value="skip">Skip missed runs</option>
              <option value="catchup">Catch up all missed runs</option>
              <option value="last">Run once for all missed</option>
            </select>
            <div className="form-hint">
              {missedPolicy === 'skip' && 'If the app was closed, missed runs are ignored.'}
              {missedPolicy === 'catchup' && 'All missed runs execute when the app restarts.'}
              {missedPolicy === 'last' && 'One run executes to cover all missed intervals.'}
            </div>
          </div>

          <div className="form-group form-row">
            <label htmlFor="schedule-enabled" className="checkbox-label">
              <input
                id="schedule-enabled"
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
              />
              <span>Enabled</span>
            </label>
          </div>
        </div>

        <div className="schedule-editor-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : isEditing ? 'Update Schedule' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
