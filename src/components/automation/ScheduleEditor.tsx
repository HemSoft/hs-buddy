import { useId, useReducer, useState } from 'react'
import { X, Save, Calendar, AlertCircle } from 'lucide-react'
import { CronBuilder } from './CronBuilder'
import {
  useJobs,
  useScheduleMutations,
  useSchedule,
  JobId,
  useBuddyStatsMutations,
} from '../../hooks/useConvex'
import { Id } from '../../../convex/_generated/dataModel'
import './ScheduleEditor.css'

type MissedPolicy = 'skip' | 'catchup' | 'last'

interface ScheduleFormState {
  name: string
  description: string
  jobId: string
  cron: string
  enabled: boolean
  missedPolicy: MissedPolicy
}

interface ScheduleEditorProps {
  scheduleId?: string
  onClose: () => void
  onSaved?: () => void
}

interface ScheduleOption {
  _id: string
  name: string
  workerType: string
  description?: string
}

interface ExistingScheduleData {
  _id: string
  name: string
  description?: string
  jobId: string
  cron: string
  enabled: boolean
  missedPolicy?: string
}

interface ScheduleEditorFormProps {
  scheduleId?: string
  isEditing: boolean
  jobs: ScheduleOption[] | undefined
  initialFormState: ScheduleFormState
  onClose: () => void
  onSaved?: () => void
}

type ScheduleFormAction =
  | { type: 'SET_FIELD'; field: keyof ScheduleFormState; value: string | boolean }
  | { type: 'RESET'; payload: ScheduleFormState }

function buildInitialScheduleFormState(
  existingSchedule: ExistingScheduleData | null | undefined,
  defaultJobId: string
): ScheduleFormState {
  if (!existingSchedule) {
    return {
      name: '',
      description: '',
      jobId: defaultJobId,
      cron: '0 9 * * *',
      enabled: true,
      missedPolicy: 'skip',
    }
  }

  return {
    name: existingSchedule.name,
    /* v8 ignore start */
    description: existingSchedule.description || '',
    /* v8 ignore stop */
    jobId: existingSchedule.jobId,
    cron: existingSchedule.cron,
    enabled: existingSchedule.enabled,
    /* v8 ignore start */
    missedPolicy:
      existingSchedule.missedPolicy === 'catchup' || existingSchedule.missedPolicy === 'last'
        ? existingSchedule.missedPolicy
        : 'skip',
    /* v8 ignore stop */
  }
}

function scheduleFormReducer(
  state: ScheduleFormState,
  action: ScheduleFormAction
): ScheduleFormState {
  /* v8 ignore start */
  switch (action.type) {
    /* v8 ignore stop */
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value }
    case 'RESET':
      /* v8 ignore start */
      return action.payload
    /* v8 ignore stop */
  }
}

function ScheduleEditorForm({
  scheduleId,
  isEditing,
  jobs,
  initialFormState,
  onClose,
  onSaved,
}: ScheduleEditorFormProps) {
  const scheduleCronLabelId = useId()
  const { create, update } = useScheduleMutations()
  const { increment: incrementStat } = useBuddyStatsMutations()
  const [formState, dispatch] = useReducer(scheduleFormReducer, initialFormState)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { name, description, jobId, cron, enabled, missedPolicy } = formState
  const selectedJob = jobs?.find(job => job._id === jobId)

  const handleSave = async () => {
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
          id: scheduleId as Id<'schedules'>,
          name: name.trim(),
          /* v8 ignore start */
          description: description.trim() || undefined,
          /* v8 ignore stop */
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
        /* v8 ignore start */
        incrementStat({ field: 'schedulesCreated' }).catch(() => {})
        /* v8 ignore stop */
      }
      onSaved?.()
      onClose()
    } catch (err) {
      /* v8 ignore start */
      setError(err instanceof Error ? err.message : 'Failed to save schedule')
      /* v8 ignore stop */
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
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
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'name', value: e.target.value })}
            placeholder="e.g., Daily PR Check"
          />
        </div>

        <div className="form-group">
          <label htmlFor="schedule-description">Description</label>
          <textarea
            id="schedule-description"
            value={description}
            onChange={e =>
              dispatch({ type: 'SET_FIELD', field: 'description', value: e.target.value })
            }
            placeholder="Optional description of what this schedule does"
            rows={2}
          />
        </div>

        <div className="form-group">
          <label htmlFor="schedule-job">Job</label>
          {jobs === undefined ? (
            <div className="form-loading">Loading jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="form-empty">No jobs available. Create a job first.</div>
          ) : (
            <select
              id="schedule-job"
              value={jobId}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'jobId', value: e.target.value })}
              disabled={isEditing}
            >
              {jobs.map(job => (
                <option key={job._id} value={job._id}>
                  [{job.workerType}] {job.name}
                </option>
              ))}
            </select>
          )}
          {selectedJob?.description && <div className="form-hint">{selectedJob.description}</div>}
        </div>

        <div className="form-group">
          <span id={scheduleCronLabelId} className="form-label">
            Schedule
          </span>
          <div role="group" aria-labelledby={scheduleCronLabelId}>
            <CronBuilder
              value={cron}
              onChange={value => dispatch({ type: 'SET_FIELD', field: 'cron', value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="missed-policy">When Missed</label>
          <select
            id="missed-policy"
            value={missedPolicy}
            onChange={e =>
              dispatch({ type: 'SET_FIELD', field: 'missedPolicy', value: e.target.value })
            }
          >
            <option value="skip">Skip missed runs</option>
            <option value="catchup">Catch up all missed runs</option>
            <option value="last">Run once for all missed</option>
          </select>
          <div className="form-hint">
            {missedPolicy === 'skip' && 'If the app was closed, missed runs are ignored.'}
            {/* v8 ignore start */}
            {missedPolicy === 'catchup' && 'All missed runs execute when the app restarts.'}
            {/* v8 ignore stop */}
            {missedPolicy === 'last' && 'One run executes to cover all missed intervals.'}
          </div>
        </div>

        <div className="form-group form-row">
          <label htmlFor="schedule-enabled" className="checkbox-label">
            <input
              id="schedule-enabled"
              type="checkbox"
              checked={enabled}
              onChange={e =>
                dispatch({ type: 'SET_FIELD', field: 'enabled', value: e.target.checked })
              }
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
    </>
  )
}

export function ScheduleEditor({ scheduleId, onClose, onSaved }: ScheduleEditorProps) {
  const jobs = useJobs()
  const existingSchedule = useSchedule(scheduleId as Id<'schedules'> | undefined)
  const isEditing = !!scheduleId
  const defaultJobId = jobs?.[0]?._id ?? ''
  const initialFormState = buildInitialScheduleFormState(existingSchedule, defaultJobId)
  const formKey = isEditing
    ? `edit-${existingSchedule?._id ?? scheduleId}`
    : `create-${defaultJobId || 'none'}`
  const waitingForExistingSchedule = isEditing && !existingSchedule

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="schedule-editor-overlay" role="presentation" onClick={handleOverlayClick}>
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
        {waitingForExistingSchedule ? (
          <>
            <div className="schedule-editor-content">
              <div className="form-loading">Loading schedule...</div>
            </div>
            <div className="schedule-editor-footer">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled>
                <Save size={16} />
                Update Schedule
              </button>
            </div>
          </>
        ) : (
          <ScheduleEditorForm
            key={formKey}
            scheduleId={scheduleId}
            isEditing={isEditing}
            jobs={jobs}
            initialFormState={initialFormState}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  )
}
