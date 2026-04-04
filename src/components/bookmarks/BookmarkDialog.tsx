import { useState, useEffect, useRef } from 'react'
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

export function BookmarkDialog({
  bookmark,
  categories,
  initialUrl,
  initialTitle,
  onClose,
}: BookmarkDialogProps) {
  const { create, update } = useBookmarkMutations()
  const isEdit = bookmark !== null

  const [url, setUrl] = useState(bookmark?.url ?? initialUrl ?? '')
  const [title, setTitle] = useState(bookmark?.title ?? initialTitle ?? '')
  const [fetchingTitle, setFetchingTitle] = useState(false)
  const [description, setDescription] = useState(bookmark?.description ?? '')
  const [category, setCategory] = useState(bookmark?.category ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [useNewCategory, setUseNewCategory] = useState(false)
  const [tagsInput, setTagsInput] = useState(bookmark?.tags?.join(', ') ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiSuggesting, setAiSuggesting] = useState(false)

  const urlRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const userEditedTitle = useRef(false)
  const userEditedDescription = useRef(false)
  const userEditedTags = useRef(false)
  const aiRequestedFor = useRef<string | null>(null)

  useEffect(() => {
    if (isEdit) {
      titleRef.current?.focus()
    } else {
      urlRef.current?.focus()
    }
  }, [isEdit])

  // Auto-fetch page title when we have a URL but no title
  useEffect(() => {
    if (isEdit || !initialUrl || initialTitle) return
    let cancelled = false
    setFetchingTitle(true)
    window.shell
      .fetchPageTitle(initialUrl)
      .then(result => {
        if (!cancelled && !userEditedTitle.current && result.success && result.title) {
          setTitle(result.title)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetchingTitle(false)
      })
    return () => {
      cancelled = true
    }
  }, [isEdit, initialUrl, initialTitle])

  // AI-suggest description and tags once we have a URL + title
  useEffect(() => {
    if (isEdit || !initialUrl) return
    const resolvedTitle = title.trim()
    if (!resolvedTitle || fetchingTitle) return
    // Only run once per URL+title combo
    const key = `${initialUrl}|${resolvedTitle}`
    if (aiRequestedFor.current === key) return
    aiRequestedFor.current = key

    let cancelled = false
    setAiSuggesting(true)
    window.copilot
      .chatSend({
        message: `Given this bookmark URL and title, respond with ONLY a JSON object (no markdown, no code fences):
{"description": "one-sentence summary of what this page is about", "tags": ["tag1", "tag2", "tag3"]}

URL: ${initialUrl}
Title: ${resolvedTitle}

Rules:
- description: 1 short sentence, max 120 chars
- tags: 3-5 lowercase single-word tags relevant to the content
- Respond with ONLY the JSON object, nothing else`,
        context: '',
        conversationHistory: [],
        model: 'gpt-4o-mini',
      })
      .then(result => {
        if (cancelled) return
        const text = typeof result === 'string' ? result : result?.content
        if (!text) return
        try {
          // Strip any markdown fences if present
          const cleaned = text
            .replace(/```(?:json)?\s*/g, '')
            .replace(/```/g, '')
            .trim()
          const parsed = JSON.parse(cleaned) as { description?: string; tags?: string[] }
          if (parsed.description && !userEditedDescription.current) {
            setDescription(parsed.description)
          }
          if (parsed.tags?.length && !userEditedTags.current) {
            setTagsInput(parsed.tags.join(', '))
          }
        } catch {
          // AI returned non-JSON — ignore silently
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAiSuggesting(false)
      })
    return () => {
      cancelled = true
    }
  }, [isEdit, initialUrl, title, fetchingTitle])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedUrl = url.trim()
    const trimmedTitle = title.trim()
    const resolvedCategory = useNewCategory ? newCategory.trim() : category.trim()

    if (!trimmedUrl) {
      setError('URL is required')
      return
    }
    if (!trimmedTitle) {
      setError('Title is required')
      return
    }
    if (!resolvedCategory) {
      setError('Category is required')
      return
    }

    // Basic URL validation
    try {
      const parsed = new URL(trimmedUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError('Only http and https URLs are allowed')
        return
      }
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)')
      return
    }

    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    if (tags.length > 50) {
      setError('Maximum 50 tags allowed')
      return
    }

    setSaving(true)
    try {
      if (isEdit && bookmark) {
        await update({
          id: bookmark._id,
          url: trimmedUrl,
          title: trimmedTitle,
          description: description.trim() || undefined,
          category: resolvedCategory,
          tags: tags.length > 0 ? tags : undefined,
        })
      } else {
        await create({
          url: trimmedUrl,
          title: trimmedTitle,
          description: description.trim() || undefined,
          category: resolvedCategory,
          tags: tags.length > 0 ? tags : undefined,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bookmark')
    } finally {
      setSaving(false)
    }
  }

  const overlayRef = useRef<HTMLDivElement>(null)
  const mouseDownTarget = useRef<EventTarget | null>(null)

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose()
  }

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

        <form className="bookmark-dialog-form" onSubmit={handleSubmit}>
          {error && <div className="bookmark-dialog-error">{error}</div>}

          <label className="bookmark-dialog-label">
            <span>
              URL <span className="bookmark-required">*</span>
            </span>
            <input
              ref={urlRef}
              type="text"
              className="bookmark-dialog-input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </label>

          <label className="bookmark-dialog-label">
            <span>
              Title <span className="bookmark-required">*</span>
              {fetchingTitle && <span className="bookmark-fetching-hint"> (fetching…)</span>}
            </span>
            <input
              ref={titleRef}
              type="text"
              className="bookmark-dialog-input"
              value={title}
              onChange={e => {
                setTitle(e.target.value)
                userEditedTitle.current = true
              }}
              placeholder={fetchingTitle ? 'Fetching page title…' : 'My Bookmark'}
            />
          </label>

          <label className="bookmark-dialog-label">
            <span>
              Description
              {aiSuggesting && <span className="bookmark-fetching-hint"> ✨ AI suggesting…</span>}
            </span>
            <textarea
              className="bookmark-dialog-textarea"
              value={description}
              onChange={e => {
                setDescription(e.target.value)
                userEditedDescription.current = true
              }}
              placeholder={
                aiSuggesting ? 'AI is generating a description…' : 'Optional description…'
              }
              rows={2}
            />
          </label>

          <label className="bookmark-dialog-label">
            <span>
              Category <span className="bookmark-required">*</span>
            </span>
            {!useNewCategory ? (
              <div className="bookmark-category-row">
                <select
                  className="bookmark-dialog-select"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  <option value="">Select category…</option>
                  {categories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bookmark-new-category-btn"
                  onClick={() => setUseNewCategory(true)}
                >
                  New
                </button>
              </div>
            ) : (
              <div className="bookmark-category-row">
                <input
                  type="text"
                  className="bookmark-dialog-input"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="New category name"
                />
                <button
                  type="button"
                  className="bookmark-new-category-btn"
                  onClick={() => setUseNewCategory(false)}
                >
                  Existing
                </button>
              </div>
            )}
          </label>

          <label className="bookmark-dialog-label">
            <span>
              Tags
              {aiSuggesting && <span className="bookmark-fetching-hint"> ✨ AI suggesting…</span>}
            </span>
            <input
              type="text"
              className="bookmark-dialog-input"
              value={tagsInput}
              onChange={e => {
                setTagsInput(e.target.value)
                userEditedTags.current = true
              }}
              placeholder={aiSuggesting ? 'AI is suggesting tags…' : 'tag1, tag2, tag3'}
            />
            <span className="bookmark-dialog-hint">Comma-separated</span>
          </label>

          <div className="bookmark-dialog-actions">
            <button type="button" className="bookmark-dialog-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="bookmark-dialog-btn-save" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Bookmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
