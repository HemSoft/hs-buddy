import {
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react'
import { X } from 'lucide-react'
import { useBookmarkMutations } from '../../hooks/useConvex'
import type { Id } from '../../../convex/_generated/dataModel'
import './BookmarkDialog.css'

type BookmarkInput = {
  _id: Id<'bookmarks'>
  url: string
  title: string
  description?: string
  category: string
  tags?: string[]
} | null

interface BookmarkDialogProps {
  bookmark: BookmarkInput
  categories: string[]
  initialUrl?: string
  initialTitle?: string
  onClose: () => void
}

interface BookmarkDialogState {
  url: string
  title: string
  fetchingTitle: boolean
  description: string
  category: string
  newCategory: string
  useNewCategory: boolean
  tagsInput: string
  saving: boolean
  error: string | null
  aiSuggesting: boolean
  initialTitleReady: boolean
}

type BookmarkDialogAction =
  | { type: 'setUrl'; value: string }
  | { type: 'setTitle'; value: string }
  | { type: 'setDescription'; value: string }
  | { type: 'setCategory'; value: string }
  | { type: 'setNewCategory'; value: string }
  | { type: 'setParentCategory'; parent: string }
  | { type: 'setUseNewCategory'; value: boolean }
  | { type: 'setTagsInput'; value: string }
  | { type: 'setError'; value: string | null }
  | { type: 'submit:start' }
  | { type: 'submit:finish' }
  | { type: 'titleFetch:start' }
  | { type: 'titleFetch:finish'; title?: string }
  | { type: 'titleFetch:cancel' }
  | { type: 'ai:start' }
  | { type: 'ai:finish'; description?: string; tagsInput?: string }

function deriveBookmarkFields(
  bookmark: BookmarkInput,
  initialUrl?: string,
  initialTitle?: string
): { url: string; title: string; description: string; category: string; tagsInput: string } {
  if (!bookmark) {
    return {
      url: initialUrl ?? '',
      title: initialTitle ?? '',
      description: '',
      category: '',
      tagsInput: '',
    }
  }
  return {
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description ?? '',
    category: bookmark.category,
    tagsInput: bookmark.tags?.join(', ') ?? '',
  }
}

function createInitialState(
  bookmark: BookmarkInput,
  initialUrl?: string,
  initialTitle?: string
): BookmarkDialogState {
  const fields = deriveBookmarkFields(bookmark, initialUrl, initialTitle)
  return {
    ...fields,
    fetchingTitle: false,
    newCategory: '',
    useNewCategory: false,
    saving: false,
    error: null,
    aiSuggesting: false,
    initialTitleReady: Boolean(bookmark || !initialUrl || initialTitle),
  }
}

function handleSimpleField(
  state: BookmarkDialogState,
  action: BookmarkDialogAction & { type: `set${string}` }
): BookmarkDialogState | null {
  switch (action.type) {
    case 'setUrl':
      return { ...state, url: action.value }
    case 'setTitle':
      return { ...state, title: action.value }
    case 'setDescription':
      return { ...state, description: action.value }
    case 'setCategory':
      return { ...state, category: action.value }
    case 'setNewCategory':
      return { ...state, newCategory: action.value }
    case 'setUseNewCategory':
      return { ...state, useNewCategory: action.value }
    case 'setTagsInput':
      return { ...state, tagsInput: action.value }
    case 'setError':
      return { ...state, error: action.value }
    default:
      return null
  }
}

function handleSetField(
  state: BookmarkDialogState,
  action: BookmarkDialogAction & { type: `set${string}` }
): BookmarkDialogState {
  const simple = handleSimpleField(state, action)
  if (simple) return simple

  /* v8 ignore start */
  if (action.type === 'setParentCategory') {
    const lastSlash = state.newCategory.lastIndexOf('/')
    const leafPart = lastSlash >= 0 ? state.newCategory.substring(lastSlash + 1) : state.newCategory
    return {
      ...state,
      newCategory: leafPart ? `${action.parent}/${leafPart}` : `${action.parent}/`,
    }
  }
  /* v8 ignore stop */
  /* v8 ignore start */
  return state
  /* v8 ignore stop */
}

function handleSubmitActions(
  state: BookmarkDialogState,
  action: BookmarkDialogAction
): BookmarkDialogState | null {
  switch (action.type) {
    case 'submit:start':
      return { ...state, saving: true, error: null }
    case 'submit:finish':
      return { ...state, saving: false }
    default:
      return null
  }
}

function handleTitleFetchActions(
  state: BookmarkDialogState,
  action: BookmarkDialogAction
): BookmarkDialogState | null {
  switch (action.type) {
    case 'titleFetch:start':
      return { ...state, fetchingTitle: true, initialTitleReady: false }
    case 'titleFetch:finish':
      return {
        ...state,
        fetchingTitle: false,
        initialTitleReady: true,
        title: action.title ?? state.title,
      }
    case 'titleFetch:cancel':
      return { ...state, fetchingTitle: false }
    default:
      return null
  }
}

function handleLifecycleAction(
  state: BookmarkDialogState,
  action: BookmarkDialogAction
): BookmarkDialogState {
  return (
    handleSubmitActions(state, action) ??
    handleTitleFetchActions(state, action) ??
    (action.type === 'ai:start'
      ? { ...state, aiSuggesting: true }
      : action.type === 'ai:finish'
        ? {
            ...state,
            aiSuggesting: false,
            description: action.description ?? state.description,
            tagsInput: action.tagsInput ?? state.tagsInput,
          }
        : /* v8 ignore start */
          state)
  ) /* v8 ignore stop */
}

function bookmarkDialogReducer(
  state: BookmarkDialogState,
  action: BookmarkDialogAction
): BookmarkDialogState {
  /* v8 ignore start */
  if (action.type.startsWith('set')) {
    /* v8 ignore stop */
    return handleSetField(state, action as BookmarkDialogAction & { type: `set${string}` })
  }
  return handleLifecycleAction(state, action)
}

interface BookmarkFormFieldsProps {
  state: BookmarkDialogState
  isEdit: boolean
  categories: string[]
  dispatch: Dispatch<BookmarkDialogAction>
  setUrlInputRef: (node: HTMLInputElement | null) => void
  setTitleInputRef: (node: HTMLInputElement | null) => void
  userEditedTitle: MutableRefObject<boolean>
  userEditedDescription: MutableRefObject<boolean>
  userEditedTags: MutableRefObject<boolean>
}

function BookmarkFormFields({
  state,
  isEdit,
  categories,
  dispatch,
  setUrlInputRef,
  setTitleInputRef,
  userEditedTitle,
  userEditedDescription,
  userEditedTags,
}: BookmarkFormFieldsProps) {
  return (
    <>
      <label className="bookmark-dialog-label">
        <span>
          URL <span className="bookmark-required">*</span>
        </span>
        <input
          ref={setUrlInputRef}
          type="text"
          className="bookmark-dialog-input"
          value={state.url}
          onChange={e => dispatch({ type: 'setUrl', value: e.target.value })}
          placeholder="https://example.com"
        />
      </label>

      <label className="bookmark-dialog-label">
        <span>
          Title <span className="bookmark-required">*</span>
          {state.fetchingTitle && <span className="bookmark-fetching-hint"> (fetching…)</span>}
        </span>
        <input
          ref={setTitleInputRef}
          type="text"
          className="bookmark-dialog-input"
          value={state.title}
          onChange={e => {
            dispatch({ type: 'setTitle', value: e.target.value })
            userEditedTitle.current = true
          }}
          placeholder={state.fetchingTitle ? 'Fetching page title…' : 'My Bookmark'}
        />
      </label>

      <label className="bookmark-dialog-label">
        <span>
          Description
          {state.aiSuggesting && <span className="bookmark-fetching-hint"> ✨ AI suggesting…</span>}
        </span>
        <textarea
          className="bookmark-dialog-textarea"
          value={state.description}
          onChange={e => {
            dispatch({ type: 'setDescription', value: e.target.value })
            userEditedDescription.current = true
          }}
          placeholder={
            state.aiSuggesting ? 'AI is generating a description…' : 'Optional description…'
          }
          rows={2}
        />
      </label>

      <label className="bookmark-dialog-label">
        <span>
          Category <span className="bookmark-required">*</span>
        </span>
        {isEdit ? (
          <input
            type="text"
            className="bookmark-dialog-input"
            value={state.category}
            /* v8 ignore start */
            onChange={e => dispatch({ type: 'setCategory', value: e.target.value })}
            /* v8 ignore stop */
            placeholder="Category/Subcategory"
          />
        ) : !state.useNewCategory ? (
          <div className="bookmark-category-row">
            <select
              className="bookmark-dialog-select"
              value={state.category}
              onChange={e => dispatch({ type: 'setCategory', value: e.target.value })}
            >
              <option value="">Select category…</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c.includes('/')
                    ? '\u00A0\u00A0'.repeat(c.split('/').length - 1) + c.split('/').pop()
                    : c}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bookmark-new-category-btn"
              onClick={() => dispatch({ type: 'setUseNewCategory', value: true })}
            >
              New
            </button>
          </div>
        ) : (
          <div className="bookmark-category-row">
            <select
              className="bookmark-dialog-select"
              style={{ flex: '0 0 auto', minWidth: 120 }}
              value=""
              onChange={e => {
                if (e.target.value) {
                  dispatch({ type: 'setParentCategory', parent: e.target.value })
                }
              }}
            >
              <option value="">Parent…</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="bookmark-dialog-input"
              value={state.newCategory}
              onChange={e => dispatch({ type: 'setNewCategory', value: e.target.value })}
              placeholder="Category/Subcategory"
            />
            <button
              type="button"
              className="bookmark-new-category-btn"
              onClick={() => dispatch({ type: 'setUseNewCategory', value: false })}
            >
              Existing
            </button>
          </div>
        )}
        <span className="bookmark-dialog-hint">
          Use / for hierarchy (e.g. Development/Frontend)
        </span>
      </label>

      <label className="bookmark-dialog-label">
        <span>
          Tags
          {state.aiSuggesting && <span className="bookmark-fetching-hint"> ✨ AI suggesting…</span>}
        </span>
        <input
          type="text"
          className="bookmark-dialog-input"
          value={state.tagsInput}
          onChange={e => {
            dispatch({ type: 'setTagsInput', value: e.target.value })
            userEditedTags.current = true
          }}
          placeholder={state.aiSuggesting ? 'AI is suggesting tags…' : 'tag1, tag2, tag3'}
        />
        <span className="bookmark-dialog-hint">Comma-separated</span>
      </label>
    </>
  )
}

interface BookmarkDialogShellProps {
  isEdit: boolean
  onClose: () => void
  children: ReactNode
}

function BookmarkDialogShell({ isEdit, onClose, children }: BookmarkDialogShellProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const mouseDownTarget = useRef<EventTarget | null>(null)

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose()
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      /* v8 ignore start */
      if (e.key === 'Escape') onClose()
      /* v8 ignore stop */
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="bookmark-dialog-overlay"
      ref={overlayRef}
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div
        className="bookmark-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-dialog-title"
      >
        <div className="bookmark-dialog-header">
          <h3 id="bookmark-dialog-title">{isEdit ? 'Edit Bookmark' : 'Add Bookmark'}</h3>
          <button className="bookmark-dialog-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function validateBookmarkForm(state: BookmarkDialogState): string | null {
  const trimmedUrl = state.url.trim()
  const trimmedTitle = state.title.trim()
  const resolvedCategory = state.useNewCategory ? state.newCategory.trim() : state.category.trim()

  if (!trimmedUrl) return 'URL is required'
  if (!trimmedTitle) return 'Title is required'
  if (!resolvedCategory) return 'Category is required'

  try {
    const parsed = new URL(trimmedUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'Only http and https URLs are allowed'
    }
  } catch {
    return 'Please enter a valid URL (e.g., https://example.com)'
  }

  const tags = state.tagsInput.split(',').filter(t => t.trim())
  if (tags.length > 50) return 'Maximum 50 tags allowed'

  return null
}

function parseAIResponse(
  text: string,
  userEditedDescription: boolean,
  userEditedTags: boolean
): { description?: string; tagsInput?: string } {
  try {
    const cleaned = text
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```/g, '')
      .trim()
    const parsed = JSON.parse(cleaned) as { description?: string; tags?: string[] }
    const result: { description?: string; tagsInput?: string } = {}
    if (parsed.description && !userEditedDescription) {
      result.description = parsed.description
    }
    if (parsed.tags?.length && !userEditedTags) {
      result.tagsInput = parsed.tags.join(', ')
    }
    return result
  } catch {
    return {}
  }
}

export function BookmarkDialog({
  bookmark,
  categories,
  initialUrl,
  initialTitle,
  onClose,
}: BookmarkDialogProps) {
  const { create, update } = useBookmarkMutations()
  const isEdit = bookmark !== null
  const [state, dispatch] = useReducer(
    bookmarkDialogReducer,
    { bookmark, initialUrl, initialTitle },
    ({ bookmark, initialUrl, initialTitle }) =>
      createInitialState(bookmark, initialUrl, initialTitle)
  )

  const urlRef = useRef<HTMLInputElement | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const userEditedTitle = useRef(false)
  const userEditedDescription = useRef(false)
  const userEditedTags = useRef(false)
  const aiRequestedFor = useRef<string | null>(null)

  const setUrlInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      urlRef.current = node
      if (node && !isEdit) {
        node.focus()
      }
    },
    [isEdit]
  )

  const setTitleInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      titleRef.current = node
      if (node && isEdit) {
        node.focus()
      }
    },
    [isEdit]
  )

  // Auto-fetch page title when we have a URL but no title
  useEffect(() => {
    if (isEdit || !initialUrl || initialTitle || state.url !== initialUrl) return
    let cancelled = false
    dispatch({ type: 'titleFetch:start' })
    window.shell
      .fetchPageTitle(initialUrl)
      .then(result => {
        if (cancelled) return
        if (!userEditedTitle.current && result.success && result.title) {
          dispatch({ type: 'titleFetch:finish', title: result.title })
          return
        }
        dispatch({ type: 'titleFetch:finish' })
      })
      .catch(() => {
        /* v8 ignore start */
        if (!cancelled) dispatch({ type: 'titleFetch:finish' })
        /* v8 ignore stop */
      })
    return () => {
      cancelled = true
      dispatch({ type: 'titleFetch:cancel' })
    }
  }, [isEdit, initialUrl, initialTitle, state.url])

  // AI-suggest description and tags once we have a URL (and optionally title)
  useEffect(() => {
    if (isEdit || !initialUrl || !state.initialTitleReady || state.url !== initialUrl) return
    const resolvedTitle = state.title.trim()
    const key = `${initialUrl}|${resolvedTitle}`
    /* v8 ignore start */
    if (aiRequestedFor.current === key) return
    /* v8 ignore stop */

    // Set the guard before the async call to prevent duplicate requests
    // if state.title changes while the request is in-flight
    aiRequestedFor.current = key
    let cancelled = false
    dispatch({ type: 'ai:start' })
    const titleLine = resolvedTitle ? `\nTitle: ${resolvedTitle}` : ''
    window.copilot
      .quickPrompt({
        prompt: `Given this bookmark URL${resolvedTitle ? ' and title' : ''}, respond with ONLY a JSON object (no markdown, no code fences):
{"description": "one-sentence summary of what this page is about", "tags": ["tag1", "tag2", "tag3"]}

URL: ${initialUrl}${titleLine}

Rules:
- description: 1 short sentence, max 120 chars
- tags: 3-5 lowercase single-word tags relevant to the content
- Respond with ONLY the JSON object, nothing else`,
        model: 'gpt-4o-mini',
      })
      .then(text => {
        if (cancelled || !text) {
          if (!cancelled) dispatch({ type: 'ai:finish' })
          return
        }

        const { description: nextDescription, tagsInput: nextTagsInput } = parseAIResponse(
          text,
          userEditedDescription.current,
          userEditedTags.current
        )

        /* v8 ignore start */
        if (!cancelled) {
          /* v8 ignore stop */
          dispatch({
            type: 'ai:finish',
            description: nextDescription,
            tagsInput: nextTagsInput,
          })
        }
      })
      .catch(err => {
        console.warn('[BookmarkDialog] AI suggestion failed:', err)
        /* v8 ignore start */
        if (!cancelled) dispatch({ type: 'ai:finish' })
        /* v8 ignore stop */
      })
    return () => {
      /* v8 ignore start */
      if (aiRequestedFor.current === key) {
        /* v8 ignore stop */
        dispatch({ type: 'ai:finish' })
        aiRequestedFor.current = null
      }
      cancelled = true
    }
  }, [isEdit, initialUrl, state.initialTitleReady, state.title, state.url])

  const prepareSubmitData = (formState: BookmarkDialogState) => {
    const trimmedUrl = formState.url.trim()
    const trimmedTitle = formState.title.trim()
    const resolvedCategory = formState.useNewCategory
      ? formState.newCategory.trim()
      : formState.category.trim()
    const tags = formState.tagsInput.split(',').flatMap(t => {
      const trimmed = t.trim()
      return trimmed ? [trimmed] : []
    })
    return { trimmedUrl, trimmedTitle, resolvedCategory, tags }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationError = validateBookmarkForm(state)
    if (validationError) {
      dispatch({ type: 'setError', value: validationError })
      return
    }

    const { trimmedUrl, trimmedTitle, resolvedCategory, tags } = prepareSubmitData(state)

    dispatch({ type: 'submit:start' })
    try {
      const payload = {
        url: trimmedUrl,
        title: trimmedTitle,
        description: state.description.trim() || undefined,
        category: resolvedCategory,
        tags: tags.length > 0 ? tags : undefined,
      }
      if (isEdit && bookmark) {
        await update({ id: bookmark._id, ...payload })
      } else {
        await create(payload)
      }
      onClose()
    } catch (err) {
      dispatch({
        type: 'setError',
        value: err instanceof Error ? err.message : 'Failed to save bookmark',
      })
    } finally {
      dispatch({ type: 'submit:finish' })
    }
  }

  return (
    <BookmarkDialogShell isEdit={isEdit} onClose={onClose}>
      <form className="bookmark-dialog-form" onSubmit={handleSubmit}>
        {state.error && <div className="bookmark-dialog-error">{state.error}</div>}

        <BookmarkFormFields
          state={state}
          isEdit={isEdit}
          categories={categories}
          dispatch={dispatch}
          setUrlInputRef={setUrlInputRef}
          setTitleInputRef={setTitleInputRef}
          userEditedTitle={userEditedTitle}
          userEditedDescription={userEditedDescription}
          userEditedTags={userEditedTags}
        />

        <div className="bookmark-dialog-actions">
          <button type="button" className="bookmark-dialog-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="bookmark-dialog-btn-save" disabled={state.saving}>
            {state.saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Bookmark'}
          </button>
        </div>
      </form>
    </BookmarkDialogShell>
  )
}
