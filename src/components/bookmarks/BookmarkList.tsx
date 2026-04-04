import { useState, useMemo, useCallback, type DragEvent } from 'react'
import { Plus, Search, ExternalLink, Pencil, Trash2, Globe, Tag, FolderOpen, X } from 'lucide-react'
import { useBookmarks, useBookmarkMutations, useBookmarkCategories } from '../../hooks/useConvex'
import { BookmarkDialog } from './BookmarkDialog'
import { ConfirmDialog } from '../ConfirmDialog'
import type { Id } from '../../../convex/_generated/dataModel'
import './BookmarkList.css'

type Bookmark = {
  _id: Id<'bookmarks'>
  url: string
  title: string
  description?: string
  faviconUrl?: string
  category: string
  tags?: string[]
  sortOrder: number
  lastVisitedAt?: number
  createdAt: number
  updatedAt: number
}

interface BookmarkListProps {
  filterCategory?: string
}

export function BookmarkList({ filterCategory }: BookmarkListProps) {
  const allBookmarks = useBookmarks()
  const categories = useBookmarkCategories()
  const { remove, recordVisit } = useBookmarkMutations()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>(filterCategory ?? '')
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [droppedUrl, setDroppedUrl] = useState<string | null>(null)
  const [droppedTitle, setDroppedTitle] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Derive all tags from bookmarks
  const allTags = useMemo(() => {
    if (!allBookmarks) return []
    const tagSet = new Set<string>()
    for (const b of allBookmarks) {
      if (b.tags) b.tags.forEach(t => tagSet.add(t))
    }
    return [...tagSet].sort()
  }, [allBookmarks])

  // Filter bookmarks
  const filteredBookmarks = useMemo(() => {
    if (!allBookmarks) return []
    let result = [...allBookmarks] as Bookmark[]

    if (selectedCategory) {
      result = result.filter(
        b => b.category === selectedCategory || b.category.startsWith(selectedCategory + '/')
      )
    }
    if (selectedTag) {
      result = result.filter(b => b.tags?.includes(selectedTag))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        b =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q) ||
          b.tags?.some(t => t.toLowerCase().includes(q))
      )
    }

    result.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
    return result
  }, [allBookmarks, selectedCategory, selectedTag, searchQuery])

  const handleOpen = useCallback(
    (bookmark: Bookmark) => {
      recordVisit({ id: bookmark._id })
      window.shell.openInAppBrowser(bookmark.url, bookmark.title)
    },
    [recordVisit]
  )

  const handleOpenExternal = useCallback(
    (bookmark: Bookmark) => {
      recordVisit({ id: bookmark._id })
      window.shell.openExternal(bookmark.url)
    },
    [recordVisit]
  )

  const handleEdit = useCallback((bookmark: Bookmark) => {
    setEditingBookmark(bookmark)
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await remove({ id: deleteTarget._id })
      setDeleteTarget(null)
      setDeleteError(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete bookmark')
    }
  }, [deleteTarget, remove])

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false)
    setEditingBookmark(null)
    setDroppedUrl(null)
    setDroppedTitle(null)
  }, [])

  const handleAddNew = useCallback(() => {
    setEditingBookmark(null)
    setDroppedUrl(null)
    setDroppedTitle(null)
    setDialogOpen(true)
  }, [])

  const extractDropData = useCallback(
    (data: DataTransfer): { url: string; title: string | null } | null => {
      // Try to get URL
      let url: string | null = null
      const uri = data.getData('text/uri-list')
      if (uri) {
        url =
          uri
            .split('\n')
            .find(l => !l.startsWith('#'))
            ?.trim() ?? null
      }
      if (!url) {
        const text = data.getData('text/plain')?.trim()
        if (text) {
          try {
            const parsed = new URL(text)
            if (['http:', 'https:'].includes(parsed.protocol)) url = text
          } catch {
            /* not a valid URL */
          }
        }
      }
      if (!url) return null

      // Try to extract title from text/html (browsers include <a> with link text)
      let title: string | null = null
      const html = data.getData('text/html')
      if (html) {
        const anchorMatch = html.match(/<a[^>]*>([^<]+)<\/a>/i)
        const linkText = anchorMatch?.[1]?.trim()
        if (linkText && linkText !== url && !linkText.startsWith('http')) {
          title = linkText
        }
      }

      return { url, title }
    },
    []
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.some(t => t === 'text/uri-list' || t === 'text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const result = extractDropData(e.dataTransfer)
      if (result) {
        setEditingBookmark(null)
        setDroppedUrl(result.url)
        setDroppedTitle(result.title)
        setDialogOpen(true)
      }
    },
    [extractDropData]
  )

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedCategory('')
    setSelectedTag('')
  }, [])

  const hasFilters = searchQuery || selectedCategory || selectedTag

  if (allBookmarks === undefined) {
    return (
      <div className="bookmark-list-loading">
        <div className="bookmark-list-spinner" />
        <span>Loading bookmarks…</span>
      </div>
    )
  }

  return (
    <div
      className={`bookmark-list-container${dragOver ? ' bookmark-drop-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="bookmark-list-header">
        <h2>Bookmarks</h2>
        <div className="bookmark-header-actions">
          <button className="bookmark-add-btn" onClick={handleAddNew} title="Add bookmark">
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Search and filter bar */}
      <div className="bookmark-filter-bar">
        <div className="bookmark-search-wrapper">
          <Search size={14} className="bookmark-search-icon" />
          <input
            type="text"
            className="bookmark-search-input"
            placeholder="Search bookmarks…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="bookmark-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          className="bookmark-filter-select"
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          title="Filter by category"
        >
          <option value="">All Categories</option>
          {(categories ?? []).map(c => (
            <option key={c} value={c}>
              {c.includes('/')
                ? '\u00A0\u00A0'.repeat(c.split('/').length - 1) + c.split('/').pop()
                : c}
            </option>
          ))}
        </select>
        <select
          className="bookmark-filter-select"
          value={selectedTag}
          onChange={e => setSelectedTag(e.target.value)}
          title="Filter by tag"
        >
          <option value="">All Tags</option>
          {allTags.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button className="bookmark-clear-filters" onClick={clearFilters} title="Clear filters">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Bookmark list */}
      <div className="bookmark-list-body">
        {filteredBookmarks.length === 0 ? (
          <div className="bookmark-list-empty">
            {allBookmarks.length === 0 ? (
              <>
                <Globe size={48} strokeWidth={1} />
                <p>No bookmarks yet</p>
                <p className="bookmark-empty-hint">
                  Click <strong>Add</strong> or drag a URL here to save your first link
                </p>
              </>
            ) : (
              <>
                <Search size={48} strokeWidth={1} />
                <p>No bookmarks match your filters</p>
              </>
            )}
          </div>
        ) : (
          filteredBookmarks.map(bookmark => (
            <div
              key={bookmark._id}
              className="bookmark-card"
              onClick={() => handleOpen(bookmark)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleOpen(bookmark)
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="bookmark-card-icon">
                {bookmark.faviconUrl && (
                  <img
                    src={bookmark.faviconUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="bookmark-favicon"
                    onError={e => {
                      e.currentTarget.style.display = 'none'
                      const sibling = e.currentTarget.nextElementSibling as HTMLElement | null
                      if (sibling) sibling.style.display = 'block'
                    }}
                  />
                )}
                <Globe size={20} style={{ display: bookmark.faviconUrl ? 'none' : undefined }} />
              </div>
              <div className="bookmark-card-content">
                <div className="bookmark-card-title">{bookmark.title}</div>
                <div className="bookmark-card-url">{bookmark.url}</div>
                {bookmark.description && (
                  <div className="bookmark-card-desc">{bookmark.description}</div>
                )}
                <div className="bookmark-card-meta">
                  <span className="bookmark-card-category" title={bookmark.category}>
                    <FolderOpen size={12} />
                    {bookmark.category.includes('/')
                      ? bookmark.category.split('/').pop()
                      : bookmark.category}
                  </span>
                  {bookmark.tags &&
                    bookmark.tags.length > 0 &&
                    bookmark.tags.map(tag => (
                      <span key={tag} className="bookmark-card-tag">
                        <Tag size={10} />
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
              <div className="bookmark-card-actions">
                <button
                  className="bookmark-action-btn"
                  onClick={e => {
                    e.stopPropagation()
                    handleOpenExternal(bookmark)
                  }}
                  title="Open in external browser"
                >
                  <ExternalLink size={14} />
                </button>
                <button
                  className="bookmark-action-btn"
                  onClick={e => {
                    e.stopPropagation()
                    handleEdit(bookmark)
                  }}
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="bookmark-action-btn bookmark-action-danger"
                  onClick={e => {
                    e.stopPropagation()
                    setDeleteTarget(bookmark)
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit dialog */}
      {dialogOpen && (
        <BookmarkDialog
          bookmark={editingBookmark}
          categories={categories ?? []}
          initialUrl={droppedUrl ?? undefined}
          initialTitle={droppedTitle ?? undefined}
          onClose={handleDialogClose}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.title}"?`}
          description={deleteError ?? 'This bookmark will be permanently removed.'}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => {
            setDeleteTarget(null)
            setDeleteError(null)
          }}
        />
      )}
    </div>
  )
}
