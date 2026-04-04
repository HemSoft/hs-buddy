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
  onClose: () => void
}

export function BookmarkDialog({ bookmark, categories, onClose }: BookmarkDialogProps) {
  const { create, update } = useBookmarkMutations()
  const isEdit = bookmark !== null

  const [url, setUrl] = useState(bookmark?.url ?? '')
  const [title, setTitle] = useState(bookmark?.title ?? '')
  const [description, setDescription] = useState(bookmark?.description ?? '')
  const [category, setCategory] = useState(bookmark?.category ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [useNewCategory, setUseNewCategory] = useState(false)
  const [tagsInput, setTagsInput] = useState(bookmark?.tags?.join(', ') ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const urlRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEdit) {
      titleRef.current?.focus()
    } else {
      urlRef.current?.focus()
    }
  }, [isEdit])

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

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="bookmark-dialog-overlay" role="presentation" onClick={handleOverlayClick}>
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
            </span>
            <input
              ref={titleRef}
              type="text"
              className="bookmark-dialog-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="My Bookmark"
            />
          </label>

          <label className="bookmark-dialog-label">
            <span>Description</span>
            <textarea
              className="bookmark-dialog-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description…"
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
            <span>Tags</span>
            <input
              type="text"
              className="bookmark-dialog-input"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3"
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
