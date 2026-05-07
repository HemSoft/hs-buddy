import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { useTerminalPrompts, useTerminalPromptMutations } from '../../hooks/useConvex'
import { useConfirm } from '../../hooks/useConfirm'
import { formatDistanceToNow } from '../../utils/dateUtils'
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

function buildPromptPreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
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

function describeLastUsed(prompt: TerminalPrompt): string {
  return prompt.lastUsedAt ? `Used ${formatDistanceToNow(prompt.lastUsedAt)}` : 'Not used yet'
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

async function pastePromptToActiveTerminal(
  activeTabId: string | null,
  prompt: TerminalPrompt,
  markUsed: TerminalPromptMutations['markUsed'],
  onClose: () => void
) {
  if (!activeTabId) {
    throw new Error('Open a terminal tab to use a prompt.')
  }

  if (getSessionId(activeTabId) === undefined || !hasTerminalPasteHandler(activeTabId)) {
    throw new Error('The active terminal is still connecting. Try again in a moment.')
  }

  if (!pasteIntoTerminal(activeTabId, prompt.content)) {
    throw new Error('The active terminal is still connecting. Try again in a moment.')
  }

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

function usePromptLibraryDismiss(
  ownerRef: RefObject<HTMLElement | null> | undefined,
  rootRef: RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (ownerRef?.current?.contains(target) || rootRef.current?.contains(target)) {
        return
      }

      if (rootRef.current) {
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
  if (prompts === undefined) {
    return (
      <div className="terminal-prompt-list-view">
        <div className="terminal-prompt-list-toolbar">
          <div className={`terminal-prompt-status ${canUsePrompt ? 'ready' : 'waiting'}`}>
            <span className="terminal-prompt-status-dot" />
            {terminalStatus}
          </div>
          <button type="button" className="terminal-prompt-btn-primary" onClick={onCreate}>
            <Plus size={14} />
            New prompt
          </button>
        </div>

        <div className="terminal-prompt-library-empty terminal-prompt-library-loading">
          <Loader2 size={16} className="spin" />
          <span>Loading prompts…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="terminal-prompt-list-view">
      <div className="terminal-prompt-list-toolbar">
        <div className={`terminal-prompt-status ${canUsePrompt ? 'ready' : 'waiting'}`}>
          <span className="terminal-prompt-status-dot" />
          {terminalStatus}
        </div>
        <button type="button" className="terminal-prompt-btn-primary" onClick={onCreate}>
          <Plus size={14} />
          New prompt
        </button>
      </div>

      {prompts.length === 0 ? (
        <div className="terminal-prompt-library-empty">
          <div className="terminal-prompt-library-empty-badge">0 prompts saved</div>
          <h4>Build your first reusable prompt</h4>
          <p>
            Save the prompts you use most in Copilot CLI, then paste them into the active terminal
            in one click.
          </p>
          <button
            type="button"
            className="terminal-prompt-btn-primary terminal-prompt-btn-primary-wide"
            onClick={onCreate}
          >
            <Plus size={14} />
            Create prompt
          </button>
        </div>
      ) : (
        <div className="terminal-prompt-cards">
          {prompts.map(prompt => (
            <article className="terminal-prompt-card" key={prompt._id}>
              <div className="terminal-prompt-card-topline">
                <div>
                  <h4>{prompt.title}</h4>
                  <p>{describeLastUsed(prompt)}</p>
                </div>
                <div className="terminal-prompt-card-actions">
                  <button
                    type="button"
                    className="terminal-prompt-card-action"
                    onClick={() => void onUse(prompt)}
                    disabled={!canUsePrompt || usingPromptId === prompt._id}
                  >
                    {usingPromptId === prompt._id ? (
                      <>
                        <Loader2 size={14} className="spin" />
                        Using
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Use
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="terminal-prompt-card-action subtle"
                    onClick={() => onEdit(prompt)}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                </div>
              </div>
              <pre className="terminal-prompt-card-preview">
                {buildPromptPreview(prompt.content)}
              </pre>
            </article>
          ))}
        </div>
      )}
    </div>
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

  return (
    <>
      <div
        className="terminal-prompt-library"
        ref={rootRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="terminal-prompt-library-title"
      >
        <div className="terminal-prompt-library-header">
          <div>
            <div className="terminal-prompt-library-kicker">
              <Sparkles size={12} />
              Prompt library
            </div>
            <h3 id="terminal-prompt-library-title">Reusable Copilot CLI prompts</h3>
            <p>{editorState ? 'Tweak the wording once, reuse it everywhere.' : terminalStatus}</p>
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

        {errorMessage && (
          <div className="terminal-prompt-library-error" role="alert">
            <AlertCircle size={14} />
            <span>{errorMessage}</span>
          </div>
        )}

        {editorState ? (
          <TerminalPromptEditorView
            editorState={editorState}
            saving={saving}
            titleInputRef={titleInputRef}
            onBack={closeEditor}
            onDelete={() => void handleDelete()}
            onSubmit={handleSave}
            onTitleChange={value =>
              setEditorState(current => (current ? { ...current, title: value } : current))
            }
            onContentChange={value =>
              setEditorState(current => (current ? { ...current, content: value } : current))
            }
          />
        ) : (
          <TerminalPromptListView
            prompts={prompts}
            canUsePrompt={canUsePrompt}
            terminalStatus={terminalStatus}
            usingPromptId={usingPromptId}
            onCreate={openCreateEditor}
            onEdit={openEditEditor}
            onUse={handleUsePrompt}
          />
        )}
      </div>

      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  )
}
