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
import { getUserFacingErrorMessage } from '../../utils/errorUtils'
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
    default:
      return state
    /* v8 ignore stop */
  }
}

function validateScheduleForm(name: string, jobId: string): string | null {
  if (!name.trim()) return 'Schedule name is required'
  if (!jobId) return 'Please select a job'
  return null
}

function computeFormKey(
  isEditing: boolean,
  existingSchedule: ExistingScheduleData | null | undefined,
  scheduleId: string | undefined,
  defaultJobId: string
): string {
  if (isEditing) return `edit-${existingSchedule?._id ?? scheduleId}`
  return `create-${defaultJobId || 'none'}`
}

function JobSelector({
  jobs,
  jobId,
  isEditing,
  selectedJob,
  dispatch,
}: {
  jobs: ScheduleOption[] | undefined
  jobId: string
  isEditing: boolean
  selectedJob: ScheduleOption | undefined
  dispatch: React.Dispatch<ScheduleFormAction>
}) {
  if (jobs === undefined) return <div className="form-loading">Loading jobs...</div>
  if (jobs.length === 0)
    return <div className="form-empty">No jobs available. Create a job first.</div>
  return (
    <>
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
      {selectedJob?.description && <div className="form-hint">{selectedJob.description}</div>}
    </>
  )
}

const MISSED_POLICY_HINTS: Record<string, string> = {
  skip: 'If the app was closed, missed runs are ignored.',
  catchup: 'All missed runs execute when the app restarts.',
  last: 'One run executes to cover all missed intervals.',
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for testing
export function getMissedPolicyHint(policy: string): string {
  return MISSED_POLICY_HINTS[policy] ?? ''
}

interface PerformScheduleSaveOptions {
  isEditing: boolean
  scheduleId?: string
  name: string
  trimmedDesc: string | undefined
  jobId: string
  cron: string
  enabled: boolean
  missedPolicy: MissedPolicy
  update: ReturnType<typeof useScheduleMutations>['update']
  create: ReturnType<typeof useScheduleMutations>['create']
  incrementStat?: ReturnType<typeof useBuddyStatsMutations>['increment']
}

async function performScheduleSave(opts: PerformScheduleSaveOptions): Promise<void> {
  if (opts.isEditing && opts.scheduleId) {
    await opts.update({
      id: opts.scheduleId as Id<'schedules'>,
      name: opts.name.trim(),
      /* v8 ignore start */
      description: opts.trimmedDesc,
      /* v8 ignore stop */
      cron: opts.cron,
      enabled: opts.enabled,
      missedPolicy: opts.missedPolicy,
    })
  } else {
    await opts.create({
      name: opts.name.trim(),
      description: opts.trimmedDesc,
      jobId: opts.jobId as JobId,
      cron: opts.cron,
      enabled: opts.enabled,
      missedPolicy: opts.missedPolicy,
    })
    /* v8 ignore start */
    opts.incrementStat?.({ field: 'schedulesCreated' }).catch(() => {})
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
    const validationError = validateScheduleForm(name, jobId)
    if (validationError) {
      setError(validationError)
      return
    }

    const trimmedDesc = description.trim() || undefined
    setError(null)
    setSaving(true)

    try {
      await performScheduleSave({
        isEditing,
        scheduleId,
        name,
        trimmedDesc,
        jobId,
        cron,
        enabled,
        missedPolicy,
        update,
        create,
        incrementStat,
      })
      onSaved?.()
      onClose()
    } catch (err: unknown) {
      /* v8 ignore start */
      setError(getUserFacingErrorMessage(err, 'Failed to save schedule'))
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
          <JobSelector
            jobs={jobs}
            jobId={jobId}
            isEditing={isEditing}
            selectedJob={selectedJob}
            dispatch={dispatch}
          />
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
          <div className="form-hint">{getMissedPolicyHint(missedPolicy)}</div>
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

function resolveDefaultJobId(jobs: ScheduleOption[] | undefined): string {
  return jobs?.[0]?._id ?? ''
}

export function ScheduleEditor({ scheduleId, onClose, onSaved }: ScheduleEditorProps) {
  const jobs = useJobs()
  const existingSchedule = useSchedule(scheduleId as Id<'schedules'> | undefined)
  const isEditing = !!scheduleId
  const defaultJobId = resolveDefaultJobId(jobs)
  const initialFormState = buildInitialScheduleFormState(existingSchedule, defaultJobId)
  const formKey = computeFormKey(isEditing, existingSchedule, scheduleId, defaultJobId)
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
