import { useCallback } from 'react'
import { Plus, Search, ExternalLink, Pencil, Trash2, Globe, Tag, FolderOpen, X } from 'lucide-react'
import { useBookmarkListState, type Bookmark } from '../../hooks/useBookmarkListState'
import { BookmarkDialog } from './BookmarkDialog'
import { ConfirmDialog } from '../ConfirmDialog'
import './BookmarkList.css'

interface BookmarkCardProps {
  bookmark: Bookmark
  onOpen: (bookmark: Bookmark) => void
  onOpenExternal: (bookmark: Bookmark) => void
  onEdit: (bookmark: Bookmark) => void
  onDelete: (bookmark: Bookmark) => void
}

function BookmarkCard({ bookmark, onOpen, onOpenExternal, onEdit, onDelete }: BookmarkCardProps) {
  return (
    <div
      className="bookmark-card"
      onClick={() => onOpen(bookmark)}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(bookmark)
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
              /* v8 ignore start */
              if (sibling) sibling.style.display = 'block'
              /* v8 ignore stop */
            }}
          />
        )}
        <Globe size={20} style={{ display: bookmark.faviconUrl ? 'none' : undefined }} />
      </div>
      <div className="bookmark-card-content">
        <div className="bookmark-card-title">{bookmark.title}</div>
        <div className="bookmark-card-url">{bookmark.url}</div>
        {bookmark.description && <div className="bookmark-card-desc">{bookmark.description}</div>}
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
            onOpenExternal(bookmark)
          }}
          title="Open in external browser"
        >
          <ExternalLink size={14} />
        </button>
        <button
          className="bookmark-action-btn"
          onClick={e => {
            e.stopPropagation()
            onEdit(bookmark)
          }}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          className="bookmark-action-btn bookmark-action-danger"
          onClick={e => {
            e.stopPropagation()
            onDelete(bookmark)
          }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

interface BookmarkFilterBarProps {
  searchQuery: string
  selectedCategory: string
  selectedTag: string
  categories: string[]
  allTags: string[]
  hasFilters: boolean
  onSearchChange: (query: string) => void
  onCategoryChange: (category: string) => void
  onTagChange: (tag: string) => void
  onClearFilters: () => void
}

function BookmarkFilterBar({
  searchQuery,
  selectedCategory,
  selectedTag,
  categories,
  allTags,
  hasFilters,
  onSearchChange,
  onCategoryChange,
  onTagChange,
  onClearFilters,
}: BookmarkFilterBarProps) {
  return (
    <div className="bookmark-filter-bar">
      <div className="bookmark-search-wrapper">
        <Search size={14} className="bookmark-search-icon" />
        <input
          type="text"
          className="bookmark-search-input"
          placeholder="Search bookmarks…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className="bookmark-search-clear"
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <select
        className="bookmark-filter-select"
        value={selectedCategory}
        onChange={e => onCategoryChange(e.target.value)}
        title="Filter by category"
      >
        <option value="">All Categories</option>
        {categories.map(c => (
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
        onChange={e => onTagChange(e.target.value)}
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
        <button className="bookmark-clear-filters" onClick={onClearFilters} title="Clear filters">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

interface BookmarkListProps {
  filterCategory?: string
  onOpenTab?: (viewId: string) => void
}

export function BookmarkList({ filterCategory, onOpenTab }: BookmarkListProps) {
  const {
    state,
    dispatch,
    allBookmarks,
    categories,
    recordVisit,
    allTags,
    filteredBookmarks,
    handleDelete,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    hasFilters,
  } = useBookmarkListState(filterCategory)

  const handleOpen = useCallback(
    (bookmark: Bookmark) => {
      recordVisit({ id: bookmark._id })
      if (onOpenTab) {
        onOpenTab(`browser:${encodeURIComponent(bookmark.url)}`)
      } else {
        window.shell.openInAppBrowser(bookmark.url, bookmark.title)
      }
    },
    [recordVisit, onOpenTab]
  )

  const handleOpenExternal = useCallback(
    (bookmark: Bookmark) => {
      recordVisit({ id: bookmark._id })
      window.shell.openExternal(bookmark.url)
    },
    [recordVisit]
  )

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
      className={`bookmark-list-container${state.dragOver ? ' bookmark-drop-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="bookmark-list-header">
        <h2>Bookmarks</h2>
        <div className="bookmark-header-actions">
          <button
            className="bookmark-add-btn"
            onClick={() => dispatch({ type: 'open-add' })}
            title="Add bookmark"
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>
      </div>

      <BookmarkFilterBar
        searchQuery={state.searchQuery}
        selectedCategory={state.selectedCategory}
        selectedTag={state.selectedTag}
        categories={categories ?? []}
        allTags={allTags}
        hasFilters={hasFilters}
        onSearchChange={q => dispatch({ type: 'set-search', query: q })}
        onCategoryChange={c => dispatch({ type: 'set-category', category: c })}
        onTagChange={t => dispatch({ type: 'set-tag', tag: t })}
        onClearFilters={() => dispatch({ type: 'clear-filters' })}
      />

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
            <BookmarkCard
              key={bookmark._id}
              bookmark={bookmark}
              onOpen={handleOpen}
              onOpenExternal={handleOpenExternal}
              onEdit={b => dispatch({ type: 'open-edit', bookmark: b })}
              onDelete={b => dispatch({ type: 'set-delete-target', bookmark: b })}
            />
          ))
        )}
      </div>

      {state.dialogOpen && (
        <BookmarkDialog
          bookmark={state.editingBookmark}
          categories={categories ?? []}
          initialUrl={state.droppedUrl ?? undefined}
          initialTitle={state.droppedTitle ?? undefined}
          onClose={() => dispatch({ type: 'close-dialog' })}
        />
      )}

      {state.deleteTarget && (
        <ConfirmDialog
          message={`Delete "${state.deleteTarget.title}"?`}
          description={state.deleteError ?? 'This bookmark will be permanently removed.'}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => dispatch({ type: 'clear-delete' })}
        />
      )}
    </div>
  )
}
