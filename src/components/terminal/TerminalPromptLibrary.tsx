import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertCircle, ArrowLeft, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { useTerminalPrompts, useTerminalPromptMutations } from '../../hooks/useConvex'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../ConfirmDialog'
import { getSessionId, hasTerminalPasteHandler, pasteIntoTerminal } from './terminalSessions'
import './TerminalPromptLibrary.css'

type TerminalPrompt = Doc<'terminalPrompts'>
type TerminalPromptMutations = ReturnType<typeof useTerminalPromptMutations>

type EditorState =
  | {
      mode: 'create'
      title: string
      content: string
    }
  | {
      mode: 'edit'
      id: Id<'terminalPrompts'>
      title: string
      content: string
    }

interface TerminalPromptLibraryProps {
  activeTabId: string | null
  ownerRef?: RefObject<HTMLElement | null>
  onClose: () => void
}

interface TerminalAvailability {
  canUsePrompt: boolean
  terminalStatus: string
}

interface TerminalPromptEditorViewProps {
  editorState: EditorState
  saving: boolean
  titleInputRef: RefObject<HTMLInputElement | null>
  onBack: () => void
  onDelete: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
}

interface TerminalPromptListViewProps {
  prompts: TerminalPrompt[] | undefined
  canUsePrompt: boolean
  terminalStatus: string
  usingPromptId: Id<'terminalPrompts'> | null
  onCreate: () => void
  onEdit: (prompt: TerminalPrompt) => void
  onUse: (prompt: TerminalPrompt) => void
}

interface TerminalPromptHeaderCopy {
  heading: string
  description: string
}

interface TerminalPromptLibraryHeaderProps {
  editorState: EditorState | null
  onClose: () => void
}

interface TerminalPromptLibraryErrorProps {
  errorMessage: string | null
}

interface TerminalPromptLibraryContentProps {
  editorState: EditorState | null
  saving: boolean
  titleInputRef: RefObject<HTMLInputElement | null>
  prompts: TerminalPrompt[] | undefined
  canUsePrompt: boolean
  terminalStatus: string
  usingPromptId: Id<'terminalPrompts'> | null
  onCreate: () => void
  onEdit: (prompt: TerminalPrompt) => void
  onUse: (prompt: TerminalPrompt) => void
  onBack: () => void
  onDelete: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function getTerminalStatus(
  activeTabId: string | null,
  hasActiveSession: boolean,
  hasPasteTarget: boolean
) {
  if (!activeTabId) {
    return 'Open a terminal tab to insert prompts.'
  }

  if (!hasActiveSession || !hasPasteTarget) {
    return 'The active terminal is still connecting.'
  }

  return 'Ready to paste into the active terminal.'
}

function getTerminalAvailability(activeTabId: string | null): TerminalAvailability {
  const hasActiveSession = activeTabId ? getSessionId(activeTabId) !== undefined : false
  const hasPasteTarget = activeTabId ? hasTerminalPasteHandler(activeTabId) : false

  return {
    canUsePrompt: Boolean(activeTabId && hasActiveSession && hasPasteTarget),
    terminalStatus: getTerminalStatus(activeTabId, hasActiveSession, hasPasteTarget),
  }
}

function validateEditorState(editorState: EditorState) {
  const title = editorState.title.trim()
  const content = editorState.content.replace(/\r\n/g, '\n')

  if (!title) {
    throw new Error('Title is required')
  }

  if (!content.trim()) {
    throw new Error('Prompt content is required')
  }

  return { title, content }
}

function getEditorHeaderCopy(editorState: EditorState | null): TerminalPromptHeaderCopy | null {
  if (!editorState) {
    return null
  }

  if (editorState.mode === 'create') {
    return {
      heading: 'New prompt',
      description: 'Save the prompt once. The menu stays compact and only shows names.',
    }
  }

  return {
    heading: editorState.title.trim() || 'Edit prompt',
    description: 'Keep the menu name-first. Edit the full prompt here when you need to change it.',
  }
}

function getLibraryClassName(editorState: EditorState | null) {
  return `terminal-prompt-library ${editorState ? 'terminal-prompt-library--editor' : 'terminal-prompt-library--menu'}`
}

function getLibraryAriaLabel(editorState: EditorState | null) {
  const editorCopy = getEditorHeaderCopy(editorState)
  return editorCopy?.heading ?? 'Prompt library'
}

async function persistPrompt(
  editorState: EditorState,
  createPrompt: TerminalPromptMutations['create'],
  updatePrompt: TerminalPromptMutations['update']
) {
  const { title, content } = validateEditorState(editorState)

  if (editorState.mode === 'create') {
    await createPrompt({ title, content })
    return
  }

  await updatePrompt({ id: editorState.id, title, content })
}

function ensureActiveTerminalReady(activeTabId: string | null, prompt: TerminalPrompt) {
  /* v8 ignore next -- the use button is disabled whenever no active tab is available */
  if (!activeTabId) {
    throw new Error('Open a terminal tab to use a prompt.')
  }

  if (getSessionId(activeTabId) === undefined || !hasTerminalPasteHandler(activeTabId)) {
    throw new Error('The active terminal is still connecting. Try again in a moment.')
  }

  if (!pasteIntoTerminal(activeTabId, prompt.content)) {
    throw new Error('The active terminal is still connecting. Try again in a moment.')
  }
}

async function pastePromptToActiveTerminal(
  activeTabId: string | null,
  prompt: TerminalPrompt,
  markUsed: TerminalPromptMutations['markUsed'],
  onClose: () => void
) {
  ensureActiveTerminalReady(activeTabId, prompt)
  await markUsed({ id: prompt._id })

  try {
    await copyTextToClipboard(prompt.content)
    onClose()
    return null
  } catch (error: unknown) {
    console.error('Failed to copy terminal prompt to clipboard', error)
    return 'Prompt pasted into the terminal, but clipboard copy failed.'
  }
}

function isPromptLibraryOwnerTarget(
  ownerRef: RefObject<HTMLElement | null> | undefined,
  rootRef: RefObject<HTMLDivElement | null>,
  target: Node
): boolean {
  return Boolean(ownerRef?.current?.contains(target) || rootRef.current?.contains(target))
}

function shouldDismissPromptLibrary(
  ownerRef: RefObject<HTMLElement | null> | undefined,
  rootRef: RefObject<HTMLDivElement | null>,
  target: Node
): boolean {
  /* v8 ignore next -- the dismiss listener only runs while the dialog root is mounted */
  if (!rootRef.current) {
    return false
  }

  if (isPromptLibraryOwnerTarget(ownerRef, rootRef, target)) {
    return false
  }

  return true
}

function usePromptLibraryDismiss(
  ownerRef: RefObject<HTMLElement | null> | undefined,
  rootRef: RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (shouldDismissPromptLibrary(ownerRef, rootRef, target)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose, ownerRef, rootRef])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}

function useEditorFocus(
  editorState: EditorState | null,
  titleInputRef: RefObject<HTMLInputElement | null>
) {
  useEffect(() => {
    if (editorState) {
      titleInputRef.current?.focus()
    }
  }, [editorState, titleInputRef])
}

function usePromptEditorActions(params: {
  editorState: EditorState | null
  createPrompt: TerminalPromptMutations['create']
  updatePrompt: TerminalPromptMutations['update']
  removePrompt: TerminalPromptMutations['remove']
  confirm: ReturnType<typeof useConfirm>['confirm']
  setEditorState: (
    value: EditorState | null | ((current: EditorState | null) => EditorState | null)
  ) => void
  setErrorMessage: (value: string | null) => void
  setSaving: (value: boolean) => void
}) {
  const {
    editorState,
    createPrompt,
    updatePrompt,
    removePrompt,
    confirm,
    setEditorState,
    setErrorMessage,
    setSaving,
  } = params

  const openCreateEditor = useCallback(() => {
    setErrorMessage(null)
    setEditorState({
      mode: 'create',
      title: '',
      content: '',
    })
  }, [setEditorState, setErrorMessage])

  const openEditEditor = useCallback(
    (prompt: TerminalPrompt) => {
      setErrorMessage(null)
      setEditorState({
        mode: 'edit',
        id: prompt._id,
        title: prompt.title,
        content: prompt.content,
      })
    },
    [setEditorState, setErrorMessage]
  )

  const closeEditor = useCallback(() => {
    setErrorMessage(null)
    setEditorState(null)
  }, [setEditorState, setErrorMessage])

  const handleSave = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      /* v8 ignore next -- submit comes from the mounted editor form */
      if (!editorState) return

      setSaving(true)
      setErrorMessage(null)

      try {
        await persistPrompt(editorState, createPrompt, updatePrompt)
        setEditorState(null)
      } catch (error: unknown) {
        setErrorMessage(resolveErrorMessage(error, 'Failed to save prompt'))
      } finally {
        setSaving(false)
      }
    },
    [createPrompt, editorState, setEditorState, setErrorMessage, setSaving, updatePrompt]
  )

  const handleDelete = useCallback(async () => {
    /* v8 ignore next -- delete is only available from the mounted edit view */
    if (!editorState || editorState.mode !== 'edit') return

    const confirmed = await confirm({
      message: `Delete "${editorState.title}"?`,
      description: 'This prompt will be removed from Convex for every synced client.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      variant: 'danger',
    })

    if (!confirmed) return

    setSaving(true)
    setErrorMessage(null)

    try {
      await removePrompt({ id: editorState.id })
      setEditorState(null)
    } catch (error: unknown) {
      setErrorMessage(resolveErrorMessage(error, 'Failed to delete prompt'))
    } finally {
      setSaving(false)
    }
  }, [confirm, editorState, removePrompt, setEditorState, setErrorMessage, setSaving])

  return {
    openCreateEditor,
    openEditEditor,
    closeEditor,
    handleSave,
    handleDelete,
  }
}

function usePromptUseAction(params: {
  activeTabId: string | null
  markUsed: TerminalPromptMutations['markUsed']
  onClose: () => void
  setErrorMessage: (value: string | null) => void
  setUsingPromptId: (value: Id<'terminalPrompts'> | null) => void
}) {
  const { activeTabId, markUsed, onClose, setErrorMessage, setUsingPromptId } = params

  return useCallback(
    async (prompt: TerminalPrompt) => {
      setUsingPromptId(prompt._id)
      setErrorMessage(null)

      try {
        const warning = await pastePromptToActiveTerminal(activeTabId, prompt, markUsed, onClose)
        if (warning) {
          setErrorMessage(warning)
        }
      } catch (error: unknown) {
        setErrorMessage(resolveErrorMessage(error, 'Failed to use prompt'))
      } finally {
        setUsingPromptId(null)
      }
    },
    [activeTabId, markUsed, onClose, setErrorMessage, setUsingPromptId]
  )
}

function TerminalPromptEditorView({
  editorState,
  saving,
  titleInputRef,
  onBack,
  onDelete,
  onSubmit,
  onTitleChange,
  onContentChange,
}: TerminalPromptEditorViewProps) {
  const saveLabel = editorState.mode === 'create' ? 'Save prompt' : 'Update prompt'

  return (
    <form className="terminal-prompt-editor" onSubmit={onSubmit}>
      <div className="terminal-prompt-editor-toolbar">
        <button
          type="button"
          className="terminal-prompt-editor-back"
          onClick={onBack}
          disabled={saving}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        {editorState.mode === 'edit' && (
          <button
            type="button"
            className="terminal-prompt-editor-delete"
            onClick={onDelete}
            disabled={saving}
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>

      <label className="terminal-prompt-field">
        <span>Label</span>
        <input
          ref={titleInputRef}
          value={editorState.title}
          onChange={event => onTitleChange(event.target.value)}
          placeholder="e.g. Refactor this diff"
          maxLength={60}
          disabled={saving}
        />
      </label>

      <label className="terminal-prompt-field">
        <span>Prompt</span>
        <textarea
          value={editorState.content}
          onChange={event => onContentChange(event.target.value)}
          placeholder="Paste the reusable Copilot CLI prompt here..."
          rows={8}
          disabled={saving}
        />
      </label>

      <div className="terminal-prompt-editor-hint">
        Inserted prompts use xterm paste mode so multiline prompts do not auto-submit.
      </div>

      <div className="terminal-prompt-editor-actions">
        <button type="button" className="terminal-prompt-btn-secondary" onClick={onBack}>
          Cancel
        </button>
        <button type="submit" className="terminal-prompt-btn-primary" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={14} className="spin" />
              Saving
            </>
          ) : (
            saveLabel
          )}
        </button>
      </div>
    </form>
  )
}

function TerminalPromptListView({
  prompts,
  canUsePrompt,
  terminalStatus,
  usingPromptId,
  onCreate,
  onEdit,
  onUse,
}: TerminalPromptListViewProps) {
  const showTerminalStatus = !canUsePrompt

  if (prompts === undefined) {
    return (
      <div className="terminal-prompt-menu">
        <div className="terminal-prompt-menu-toolbar">
          <span className="terminal-prompt-menu-label">Prompt library</span>
          <button type="button" className="terminal-prompt-menu-create" onClick={onCreate}>
            <Plus size={14} />
            New prompt
          </button>
        </div>

        {showTerminalStatus && <div className="terminal-prompt-menu-status">{terminalStatus}</div>}

        <div className="terminal-prompt-menu-feedback">
          <Loader2 size={16} className="spin" />
          <span>Loading prompts…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="terminal-prompt-menu">
      <div className="terminal-prompt-menu-toolbar">
        <span className="terminal-prompt-menu-label">Prompt library</span>
        <button type="button" className="terminal-prompt-menu-create" onClick={onCreate}>
          <Plus size={14} />
          New prompt
        </button>
      </div>

      {showTerminalStatus && <div className="terminal-prompt-menu-status">{terminalStatus}</div>}

      {prompts.length === 0 ? (
        <div className="terminal-prompt-menu-empty">No saved prompts yet.</div>
      ) : (
        <div className="terminal-prompt-menu-list">
          {prompts.map(prompt => (
            <div className="terminal-prompt-menu-row" key={prompt._id}>
              <button
                type="button"
                className="terminal-prompt-menu-item"
                onClick={() => void onUse(prompt)}
                disabled={!canUsePrompt || usingPromptId === prompt._id}
                title={
                  canUsePrompt ? `Paste ${prompt.title} into the active terminal` : terminalStatus
                }
              >
                {usingPromptId === prompt._id && <Loader2 size={14} className="spin" />}
                <span className="terminal-prompt-menu-item-label">{prompt.title}</span>
              </button>
              <button
                type="button"
                className="terminal-prompt-menu-edit"
                onClick={() => onEdit(prompt)}
                aria-label={`Edit ${prompt.title}`}
                title={`Edit ${prompt.title}`}
                disabled={usingPromptId === prompt._id}
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TerminalPromptLibraryHeader({ editorState, onClose }: TerminalPromptLibraryHeaderProps) {
  const editorCopy = getEditorHeaderCopy(editorState)

  if (!editorCopy) {
    return null
  }

  return (
    <div className="terminal-prompt-library-header">
      <div>
        <div className="terminal-prompt-library-kicker">Prompt editor</div>
        <h3>{editorCopy.heading}</h3>
        <p>{editorCopy.description}</p>
      </div>
      <button
        type="button"
        className="terminal-prompt-library-close"
        onClick={onClose}
        aria-label="Close prompt library"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function TerminalPromptLibraryError({ errorMessage }: TerminalPromptLibraryErrorProps) {
  if (!errorMessage) {
    return null
  }

  return (
    <div className="terminal-prompt-library-error" role="alert">
      <AlertCircle size={14} />
      <span>{errorMessage}</span>
    </div>
  )
}

function TerminalPromptLibraryContent({
  editorState,
  saving,
  titleInputRef,
  prompts,
  canUsePrompt,
  terminalStatus,
  usingPromptId,
  onCreate,
  onEdit,
  onUse,
  onBack,
  onDelete,
  onSubmit,
  onTitleChange,
  onContentChange,
}: TerminalPromptLibraryContentProps) {
  if (editorState) {
    return (
      <TerminalPromptEditorView
        editorState={editorState}
        saving={saving}
        titleInputRef={titleInputRef}
        onBack={onBack}
        onDelete={onDelete}
        onSubmit={onSubmit}
        onTitleChange={onTitleChange}
        onContentChange={onContentChange}
      />
    )
  }

  return (
    <TerminalPromptListView
      prompts={prompts}
      canUsePrompt={canUsePrompt}
      terminalStatus={terminalStatus}
      usingPromptId={usingPromptId}
      onCreate={onCreate}
      onEdit={onEdit}
      onUse={onUse}
    />
  )
}

export function TerminalPromptLibrary({
  activeTabId,
  ownerRef,
  onClose,
}: TerminalPromptLibraryProps) {
  const prompts = useTerminalPrompts()
  const { create, update, remove, markUsed } = useTerminalPromptMutations()
  const { confirm, confirmDialog } = useConfirm()
  const rootRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [usingPromptId, setUsingPromptId] = useState<Id<'terminalPrompts'> | null>(null)

  usePromptLibraryDismiss(ownerRef, rootRef, onClose)
  useEditorFocus(editorState, titleInputRef)

  const { canUsePrompt, terminalStatus } = useMemo(
    () => getTerminalAvailability(activeTabId),
    [activeTabId]
  )

  const { openCreateEditor, openEditEditor, closeEditor, handleSave, handleDelete } =
    usePromptEditorActions({
      editorState,
      createPrompt: create,
      updatePrompt: update,
      removePrompt: remove,
      confirm,
      setEditorState,
      setErrorMessage,
      setSaving,
    })

  const handleUsePrompt = usePromptUseAction({
    activeTabId,
    markUsed,
    onClose,
    setErrorMessage,
    setUsingPromptId,
  })
  const updateEditorState = useCallback(
    (updater: (current: EditorState) => EditorState) => {
      setEditorState(current => {
        /* v8 ignore next -- editor inputs only render while editor state exists */
        if (!current) {
          return current
        }

        return updater(current)
      })
    },
    [setEditorState]
  )
  const handleTitleChange = useCallback(
    (value: string) => {
      updateEditorState(current => ({ ...current, title: value }))
    },
    [updateEditorState]
  )
  const handleContentChange = useCallback(
    (value: string) => {
      updateEditorState(current => ({ ...current, content: value }))
    },
    [updateEditorState]
  )

  return (
    <>
      <div
        className={getLibraryClassName(editorState)}
        ref={rootRef}
        role="dialog"
        aria-modal="false"
        aria-label={getLibraryAriaLabel(editorState)}
      >
        <TerminalPromptLibraryHeader editorState={editorState} onClose={onClose} />
        <TerminalPromptLibraryError errorMessage={errorMessage} />
        <TerminalPromptLibraryContent
          editorState={editorState}
          saving={saving}
          titleInputRef={titleInputRef}
          prompts={prompts}
          canUsePrompt={canUsePrompt}
          terminalStatus={terminalStatus}
          usingPromptId={usingPromptId}
          onCreate={openCreateEditor}
          onEdit={openEditEditor}
          onUse={handleUsePrompt}
          onBack={closeEditor}
          onDelete={() => void handleDelete()}
          onSubmit={handleSave}
          onTitleChange={handleTitleChange}
          onContentChange={handleContentChange}
        />
      </div>

      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  )
}
