import { useCallback, useEffect, useId, useReducer, useRef } from 'react'
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

const CREATE_INITIAL_DEFAULTS = {
  defaultIssueKey: '',
  defaultAccountKey: '',
  defaultDescription: '',
}

function getWorklogRaw(worklog: TempoWorklog | null) {
  return {
    issueKey: worklog?.issueKey,
    hours: worklog?.hours,
    date: worklog?.date,
    description: worklog?.description,
    accountKey: worklog?.accountKey,
  }
}

function resolveWorklogFields(
  worklog: TempoWorklog | null,
  defaults: { defaultIssueKey: string; defaultAccountKey: string; defaultDescription: string },
  defaultDate: string
) {
  const raw = getWorklogRaw(worklog)
  return {
    issueKey: resolveField(raw.issueKey, defaults.defaultIssueKey),
    hours: String(raw.hours || 1),
    date: raw.date || defaultDate,
    description: resolveField(raw.description, defaults.defaultDescription),
    accountKey: resolveField(raw.accountKey, defaults.defaultAccountKey),
  }
}

function createInitialState(
  worklog: TempoWorklog | null,
  defaultDate: string,
  opts?: { defaultIssueKey?: string; defaultAccountKey?: string; defaultDescription?: string }
): TempoWorklogEditorState {
  const defaults = {
    ...CREATE_INITIAL_DEFAULTS,
    ...opts,
  }
  return {
    ...resolveWorklogFields(worklog, defaults, defaultDate),
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
  setAccountsLoading: 'accountsLoading',
}

function handleSubmitAction(
  state: TempoWorklogEditorState,
  action: TempoWorklogEditorAction
): TempoWorklogEditorState {
  if (action.type === 'submit:start') return { ...state, saving: true, error: null }
  if (action.type === 'submit:error') return { ...state, saving: false, error: action.value }
  /* v8 ignore start */
  if (action.type === 'submit:finish') return { ...state, saving: false }
  return state
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
  /* v8 ignore start */
  return handleSubmitAction(state, action)
  /* v8 ignore stop */
}

function submitLabel(saving: boolean, isEdit: boolean) {
  if (saving) return 'Saving...'
  return isEdit ? 'Update' : 'Create'
}

type TempoProjectAccount = TempoWorklogEditorState['projectAccounts'][number]

function getAccountOptions(projectAccounts: TempoProjectAccount[], accounts: TempoAccount[]) {
  return projectAccounts.length > 0 ? projectAccounts : accounts
}

function hasInitialAccountSelection(worklog: TempoWorklog | null, defaultAccountKey?: string) {
  return Boolean(worklog?.accountKey || defaultAccountKey)
}

function resolveProjectKey(issueKey: string) {
  const key = issueKey.trim().toUpperCase()
  const projectKey = key.split('-')[0]
  if (!projectKey || !key.includes('-')) return null
  return projectKey
}

function applyProjectAccounts(
  projectAccounts: TempoProjectAccount[],
  dispatch: React.Dispatch<TempoWorklogEditorAction>,
  userPickedAccountRef: React.MutableRefObject<boolean>
) {
  dispatch({ type: 'setProjectAccounts', projectAccounts })
  if (userPickedAccountRef.current) return

  const defaultAccount = projectAccounts.find(account => account.isDefault)
  if (defaultAccount) {
    dispatch({ type: 'setAccountKey', value: defaultAccount.key })
  }
}

function useTempoAccountData({
  issueKey,
  isEdit,
  dispatch,
  userPickedAccountRef,
  debounceRef,
  requestVersionRef,
}: {
  issueKey: string
  isEdit: boolean
  dispatch: React.Dispatch<TempoWorklogEditorAction>
  userPickedAccountRef: React.MutableRefObject<boolean>
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  requestVersionRef: React.MutableRefObject<number>
}) {
  useEffect(() => {
    window.tempo.getAccounts().then(res => {
      if (res.data) dispatch({ type: 'setAccounts', accounts: res.data })
    })
  }, [dispatch])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const projectKey = resolveProjectKey(issueKey)
    if (!projectKey) {
      dispatch({ type: 'setProjectAccounts', projectAccounts: [] })
      return
    }

    userPickedAccountRef.current = false
    const version = ++requestVersionRef.current
    debounceRef.current = setTimeout(() => {
      dispatch({ type: 'setAccountsLoading', value: true })
      window.tempo.getProjectAccounts(projectKey).then(res => {
        if (requestVersionRef.current !== version) return
        dispatch({ type: 'setAccountsLoading', value: false })
        if (res.data) applyProjectAccounts(res.data, dispatch, userPickedAccountRef)
      })
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [debounceRef, dispatch, issueKey, requestVersionRef, userPickedAccountRef])

  useEffect(() => {
    if (!isEdit) return

    const projectKey = resolveProjectKey(issueKey)
    if (!projectKey) return

    window.tempo.getProjectAccounts(projectKey).then(res => {
      if (res.data) dispatch({ type: 'setProjectAccounts', projectAccounts: res.data })
    })
  }, [dispatch, isEdit, issueKey])
}

function useTempoEditorEscapeShortcut(saving: boolean, onCancel: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, saving])
}

function resolveStartTime(worklog: TempoWorklog | null, existingWorklogs: TempoWorklog[]) {
  return worklog?.startTime || nextStartTime(existingWorklogs)
}

function optionalAccountKey(accountKey: string) {
  return accountKey || undefined
}

function createSubmitPayload(
  state: TempoWorklogEditorState,
  worklog: TempoWorklog | null,
  existingWorklogs: TempoWorklog[]
): CreateWorklogPayload {
  return {
    issueKey: state.issueKey.trim().toUpperCase(),
    hours: parseFloat(state.hours),
    date: state.date,
    startTime: resolveStartTime(worklog, existingWorklogs),
    description: state.description,
    accountKey: optionalAccountKey(state.accountKey),
  }
}

function useTempoSubmitHandler({
  state,
  worklog,
  existingWorklogs,
  onSave,
  dispatch,
}: {
  state: TempoWorklogEditorState
  worklog: TempoWorklog | null
  existingWorklogs: TempoWorklog[]
  onSave: (payload: CreateWorklogPayload) => Promise<void>
  dispatch: React.Dispatch<TempoWorklogEditorAction>
}) {
  return useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const error = validateWorklogFields(state.issueKey, state.hours, state.date)
      if (error) {
        dispatch({ type: 'submit:error', value: error })
        return
      }

      dispatch({ type: 'submit:start' })
      try {
        await onSave(createSubmitPayload(state, worklog, existingWorklogs))
      } catch (err: unknown) {
        dispatch({ type: 'submit:error', value: String(err) })
        return
      }
      dispatch({ type: 'submit:finish' })
    },
    [dispatch, existingWorklogs, onSave, state, worklog]
  )
}

function resolveBackdropClickHandler(saving: boolean, onCancel: () => void) {
  return saving ? undefined : onCancel
}

function editorTitle(isEdit: boolean) {
  return isEdit ? 'Edit Worklog' : 'Log Time'
}

function accountLabel(accountsLoading: boolean) {
  return accountsLoading ? 'Account (loading…)' : 'Account'
}

function TempoAccountField({
  accountId,
  state,
  dispatch,
  userPickedAccountRef,
}: {
  accountId: string
  state: TempoWorklogEditorState
  dispatch: React.Dispatch<TempoWorklogEditorAction>
  userPickedAccountRef: React.MutableRefObject<boolean>
}) {
  return (
    <div className="tempo-editor-row">
      <label htmlFor={accountId}>{accountLabel(state.accountsLoading)}</label>
      <select
        id={accountId}
        value={state.accountKey}
        onChange={e => {
          userPickedAccountRef.current = true
          dispatch({ type: 'setAccountKey', value: e.target.value })
        }}
      >
        <option value="">— select account —</option>
        {getAccountOptions(state.projectAccounts, state.accounts).map(account => (
          <option key={account.key} value={account.key}>
            {account.name} ({account.key})
          </option>
        ))}
      </select>
    </div>
  )
}

function TempoEditorError({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="tempo-editor-error">{error}</div>
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
      createInitialState(worklog, defaultDate, {
        defaultIssueKey,
        defaultAccountKey,
        defaultDescription,
      })
  )
  const issueKeyId = useId()
  const hoursId = useId()
  const dateId = useId()
  const descriptionId = useId()
  const accountId = useId()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestVersionRef = useRef(0)
  const userPickedAccountRef = useRef(hasInitialAccountSelection(worklog, defaultAccountKey))
  const handleSubmit = useTempoSubmitHandler({
    state,
    worklog,
    existingWorklogs,
    onSave,
    dispatch,
  })

  useTempoAccountData({
    issueKey: state.issueKey,
    isEdit,
    dispatch,
    userPickedAccountRef,
    debounceRef,
    requestVersionRef,
  })
  useTempoEditorEscapeShortcut(state.saving, onCancel)

  return (
    <div className="tempo-editor-overlay">
      <button
        type="button"
        className="tempo-editor-backdrop"
        onClick={resolveBackdropClickHandler(state.saving, onCancel)}
        aria-label="Close worklog editor"
      />
      <div
        className="tempo-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tempo-editor-title"
      >
        <div className="tempo-editor-header">
          <h3 id="tempo-editor-title">{editorTitle(isEdit)}</h3>
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
          <TempoAccountField
            accountId={accountId}
            state={state}
            dispatch={dispatch}
            userPickedAccountRef={userPickedAccountRef}
          />
          <TempoEditorError error={state.error} />
          <div className="tempo-editor-actions">
            <button type="button" onClick={onCancel} className="tempo-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={state.saving} className="tempo-btn-primary">
              {submitLabel(state.saving, isEdit)}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
