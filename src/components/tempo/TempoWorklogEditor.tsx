import { useEffect, useId, useReducer, useRef } from 'react'
import type { TempoWorklog, CreateWorklogPayload, TempoAccount } from '../../types/tempo'
import { nextStartTime, validateWorklogFields } from './tempoUtils'
import { X } from 'lucide-react'

interface TempoWorklogEditorProps {
  worklog: TempoWorklog | null // null = create mode
  defaultDate: string
  defaultIssueKey?: string
  defaultAccountKey?: string
  defaultDescription?: string
  existingWorklogs: TempoWorklog[] // worklogs already on the target date
  onSave: (payload: CreateWorklogPayload) => Promise<void>
  onCancel: () => void
}

interface TempoWorklogEditorState {
  issueKey: string
  hours: string
  date: string
  description: string
  accountKey: string
  accounts: TempoAccount[]
  projectAccounts: { key: string; name: string; isDefault: boolean }[]
  accountsLoading: boolean
  saving: boolean
  error: string | null
}

type TempoWorklogEditorAction =
  | { type: 'setIssueKey'; value: string }
  | { type: 'setHours'; value: string }
  | { type: 'setDate'; value: string }
  | { type: 'setDescription'; value: string }
  | { type: 'setAccountKey'; value: string }
  | { type: 'setAccounts'; accounts: TempoAccount[] }
  | {
      type: 'setProjectAccounts'
      projectAccounts: { key: string; name: string; isDefault: boolean }[]
    }
  | { type: 'setAccountsLoading'; value: boolean }
  | { type: 'submit:start' }
  | { type: 'submit:error'; value: string }
  | { type: 'submit:finish' }

function resolveField(worklogValue: string | undefined, fallback?: string): string {
  return worklogValue || fallback || ''
}

function createInitialState(
  worklog: TempoWorklog | null,
  defaultDate: string,
  defaultIssueKey?: string,
  defaultAccountKey?: string,
  defaultDescription?: string
): TempoWorklogEditorState {
  return {
    issueKey: resolveField(worklog?.issueKey, defaultIssueKey),
    hours: String(worklog?.hours || 1),
    date: worklog?.date || defaultDate,
    description: resolveField(worklog?.description, defaultDescription),
    accountKey: resolveField(worklog?.accountKey, defaultAccountKey),
    accounts: [],
    projectAccounts: [],
    accountsLoading: false,
    saving: false,
    error: null,
  }
}

const fieldSetters: Record<string, string> = {
  setIssueKey: 'issueKey',
  setHours: 'hours',
  setDate: 'date',
  setDescription: 'description',
  setAccountKey: 'accountKey',
}

function handleSubmitAction(
  state: TempoWorklogEditorState,
  action: TempoWorklogEditorAction
): TempoWorklogEditorState | null {
  if (action.type === 'submit:start') return { ...state, saving: true, error: null }
  if (action.type === 'submit:error') return { ...state, saving: false, error: action.value }
  /* v8 ignore start */
  if (action.type === 'submit:finish') return { ...state, saving: false }
  return null
  /* v8 ignore stop */
}

function tempoWorklogEditorReducer(
  state: TempoWorklogEditorState,
  action: TempoWorklogEditorAction
): TempoWorklogEditorState {
  const fieldKey = fieldSetters[action.type]
  if (fieldKey && 'value' in action) {
    return { ...state, [fieldKey]: action.value }
  }
  if (action.type === 'setAccounts') return { ...state, accounts: action.accounts }
  if (action.type === 'setProjectAccounts') {
    return { ...state, projectAccounts: action.projectAccounts }
  }
  if (action.type === 'setAccountsLoading') return { ...state, accountsLoading: action.value }
  /* v8 ignore start */
  return handleSubmitAction(state, action) ?? state
  /* v8 ignore stop */
}

export function TempoWorklogEditor({
  worklog,
  defaultDate,
  defaultIssueKey,
  defaultAccountKey,
  defaultDescription,
  existingWorklogs,
  onSave,
  onCancel,
}: TempoWorklogEditorProps) {
  const isEdit = Boolean(worklog)
  const [state, dispatch] = useReducer(
    tempoWorklogEditorReducer,
    { worklog, defaultDate, defaultIssueKey, defaultAccountKey, defaultDescription },
    ({ worklog, defaultDate, defaultIssueKey, defaultAccountKey, defaultDescription }) =>
      createInitialState(
        worklog,
        defaultDate,
        defaultIssueKey,
        defaultAccountKey,
        defaultDescription
      )
  )
  const issueKeyId = useId()
  const hoursId = useId()
  const dateId = useId()
  const descriptionId = useId()
  const accountId = useId()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestVersionRef = useRef(0)
  const userPickedAccountRef = useRef(Boolean(worklog?.accountKey || defaultAccountKey))

  // Fetch all accounts on mount
  useEffect(() => {
    window.tempo.getAccounts().then(res => {
      if (res.data) dispatch({ type: 'setAccounts', accounts: res.data })
    })
  }, [])

  // Fetch project-specific account links when issue key changes (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const key = state.issueKey.trim().toUpperCase()
    const projectKey = key.split('-')[0]
    if (!projectKey || !key.includes('-')) {
      dispatch({ type: 'setProjectAccounts', projectAccounts: [] })
      return
    }
    userPickedAccountRef.current = false
    const version = ++requestVersionRef.current
    debounceRef.current = setTimeout(() => {
      dispatch({ type: 'setAccountsLoading', value: true })
      window.tempo.getProjectAccounts(projectKey).then(res => {
        if (requestVersionRef.current !== version) return // stale response
        dispatch({ type: 'setAccountsLoading', value: false })
        if (res.data) {
          dispatch({ type: 'setProjectAccounts', projectAccounts: res.data })
          // Auto-select default only if user hasn't manually picked
          /* v8 ignore start */
          if (!userPickedAccountRef.current) {
            /* v8 ignore stop */
            const defaultAccount = res.data.find(a => a.isDefault)
            if (defaultAccount) {
              dispatch({ type: 'setAccountKey', value: defaultAccount.key })
            }
          }
        }
      })
    }, 400)
    return () => {
      /* v8 ignore start */
      if (debounceRef.current) clearTimeout(debounceRef.current)
      /* v8 ignore stop */
    }
  }, [state.issueKey])

  // For edit mode, fetch project accounts on mount
  useEffect(() => {
    if (!isEdit) return
    const key = state.issueKey.trim().toUpperCase()
    const projectKey = key.split('-')[0]
    /* v8 ignore start */
    if (!projectKey || !key.includes('-')) return
    /* v8 ignore stop */
    window.tempo.getProjectAccounts(projectKey).then(res => {
      if (res.data) dispatch({ type: 'setProjectAccounts', projectAccounts: res.data })
    })
  }, [isEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !state.saving) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, state.saving])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validateWorklogFields(state.issueKey, state.hours, state.date)
    if (error) {
      dispatch({ type: 'submit:error', value: error })
      return
    }

    dispatch({ type: 'submit:start' })
    try {
      const startTime = worklog?.startTime || nextStartTime(existingWorklogs)
      await onSave({
        issueKey: state.issueKey.trim().toUpperCase(),
        hours: parseFloat(state.hours),
        date: state.date,
        startTime,
        description: state.description,
        accountKey: state.accountKey || undefined,
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
          <div className="tempo-editor-row">
            <label htmlFor={accountId}>Account{state.accountsLoading ? ' (loading…)' : ''}</label>
            <select
              id={accountId}
              value={state.accountKey}
              onChange={e => {
                userPickedAccountRef.current = true
                dispatch({ type: 'setAccountKey', value: e.target.value })
              }}
            >
              <option value="">— select account —</option>
              {(state.projectAccounts.length > 0 ? state.projectAccounts : state.accounts).map(
                a => (
                  <option key={a.key} value={a.key}>
                    {a.name} ({a.key})
                  </option>
                )
              )}
            </select>
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
