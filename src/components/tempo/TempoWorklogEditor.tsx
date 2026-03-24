import { useEffect, useId, useReducer } from 'react'
import type { TempoWorklog, CreateWorklogPayload } from '../../types/tempo'
import { nextStartTime } from './tempoUtils'
import { X } from 'lucide-react'

interface TempoWorklogEditorProps {
  worklog: TempoWorklog | null // null = create mode
  defaultDate: string
  existingWorklogs: TempoWorklog[] // worklogs already on the target date
  onSave: (payload: CreateWorklogPayload) => Promise<void>
  onCancel: () => void
}

interface TempoWorklogEditorState {
  issueKey: string
  hours: string
  date: string
  description: string
  saving: boolean
  error: string | null
}

type TempoWorklogEditorAction =
  | { type: 'setIssueKey'; value: string }
  | { type: 'setHours'; value: string }
  | { type: 'setDate'; value: string }
  | { type: 'setDescription'; value: string }
  | { type: 'submit:start' }
  | { type: 'submit:error'; value: string }
  | { type: 'submit:finish' }

function createInitialState(
  worklog: TempoWorklog | null,
  defaultDate: string
): TempoWorklogEditorState {
  return {
    issueKey: worklog?.issueKey || '',
    hours: String(worklog?.hours || 1),
    date: worklog?.date || defaultDate,
    description: worklog?.description || '',
    saving: false,
    error: null,
  }
}

function tempoWorklogEditorReducer(
  state: TempoWorklogEditorState,
  action: TempoWorklogEditorAction
): TempoWorklogEditorState {
  switch (action.type) {
    case 'setIssueKey':
      return { ...state, issueKey: action.value }
    case 'setHours':
      return { ...state, hours: action.value }
    case 'setDate':
      return { ...state, date: action.value }
    case 'setDescription':
      return { ...state, description: action.value }
    case 'submit:start':
      return { ...state, saving: true, error: null }
    case 'submit:error':
      return { ...state, saving: false, error: action.value }
    case 'submit:finish':
      return { ...state, saving: false }
  }
}

export function TempoWorklogEditor({
  worklog,
  defaultDate,
  existingWorklogs,
  onSave,
  onCancel,
}: TempoWorklogEditorProps) {
  const isEdit = Boolean(worklog)
  const [state, dispatch] = useReducer(
    tempoWorklogEditorReducer,
    { worklog, defaultDate },
    ({ worklog, defaultDate }) => createInitialState(worklog, defaultDate)
  )
  const issueKeyId = useId()
  const hoursId = useId()
  const dateId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !state.saving) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, state.saving])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const h = parseFloat(state.hours)
    if (!state.issueKey.trim()) {
      dispatch({ type: 'submit:error', value: 'Issue key is required' })
      return
    }
    if (isNaN(h) || h <= 0 || h > 24) {
      dispatch({ type: 'submit:error', value: 'Hours must be between 0 and 24' })
      return
    }
    if (!state.date) {
      dispatch({ type: 'submit:error', value: 'Date is required' })
      return
    }

    dispatch({ type: 'submit:start' })
    try {
      const startTime = worklog?.startTime || nextStartTime(existingWorklogs)
      await onSave({
        issueKey: state.issueKey.trim().toUpperCase(),
        hours: h,
        date: state.date,
        startTime,
        description: state.description,
      })
    } catch (err) {
      dispatch({ type: 'submit:error', value: String(err) })
      return
    }
    dispatch({ type: 'submit:finish' })
  }

  return (
    <div className="tempo-editor-overlay">
      <button
        type="button"
        className="tempo-editor-backdrop"
        onClick={state.saving ? undefined : onCancel}
        aria-label="Close worklog editor"
      />
      <div
        className="tempo-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tempo-editor-title"
      >
        <div className="tempo-editor-header">
          <h3 id="tempo-editor-title">{isEdit ? 'Edit Worklog' : 'Log Time'}</h3>
          <button
            type="button"
            className="tempo-editor-close"
            onClick={onCancel}
            disabled={state.saving}
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="tempo-editor-form">
          <div className="tempo-editor-row">
            <label htmlFor={issueKeyId}>Issue Key</label>
            <input
              id={issueKeyId}
              type="text"
              value={state.issueKey}
              onChange={e => dispatch({ type: 'setIssueKey', value: e.target.value })}
              placeholder="PE-992"
              disabled={isEdit}
            />
          </div>
          <div className="tempo-editor-row-pair">
            <div className="tempo-editor-row">
              <label htmlFor={hoursId}>Hours</label>
              <input
                id={hoursId}
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={state.hours}
                onChange={e => dispatch({ type: 'setHours', value: e.target.value })}
              />
            </div>
            <div className="tempo-editor-row">
              <label htmlFor={dateId}>Date</label>
              <input
                id={dateId}
                type="date"
                value={state.date}
                onChange={e => dispatch({ type: 'setDate', value: e.target.value })}
              />
            </div>
          </div>
          <div className="tempo-editor-row">
            <label htmlFor={descriptionId}>Description</label>
            <input
              id={descriptionId}
              type="text"
              value={state.description}
              onChange={e => dispatch({ type: 'setDescription', value: e.target.value })}
              placeholder="Working on issue..."
            />
          </div>
          {state.error && <div className="tempo-editor-error">{state.error}</div>}
          <div className="tempo-editor-actions">
            <button type="button" onClick={onCancel} className="tempo-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={state.saving} className="tempo-btn-primary">
              {state.saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
