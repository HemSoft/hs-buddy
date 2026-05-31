import { useCallback } from 'react'
import { Plus, Search, ExternalLink, Pencil, Trash2, Globe, Tag, FolderOpen, X } from 'lucide-react'
import { useBookmarkListState, type Bookmark } from '../../hooks/useBookmarkListState'

type BookmarkDispatch = ReturnType<typeof useBookmarkListState>['dispatch']
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

function handleBookmarkCardKeyDown(
  e: React.KeyboardEvent<HTMLElement>,
  bookmark: Bookmark,
  onOpen: (bookmark: Bookmark) => void
) {
  if (e.target !== e.currentTarget) return
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onOpen(bookmark)
}

function getBookmarkCategoryLabel(category: string): string | undefined {
  return category.includes('/') ? category.split('/').pop() : category
}

function BookmarkCardIcon({ faviconUrl }: { faviconUrl?: string }) {
  return (
    <div className="bookmark-card-icon">
      {faviconUrl && (
        <img
          src={faviconUrl}
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
      <Globe size={20} style={{ display: faviconUrl ? 'none' : undefined }} />
    </div>
  )
}

function BookmarkDescription({ description }: { description?: string }) {
  if (!description) return null
  return <span className="bookmark-card-desc">{description}</span>
}

function BookmarkTags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return tags.map(tag => (
    <span key={tag} className="bookmark-card-tag">
      <Tag size={10} />
      {tag}
    </span>
  ))
}

function BookmarkMeta({ bookmark }: { bookmark: Bookmark }) {
  return (
    <span className="bookmark-card-meta">
      <span className="bookmark-card-category" title={bookmark.category}>
        <FolderOpen size={12} />
        {getBookmarkCategoryLabel(bookmark.category)}
      </span>
      <BookmarkTags tags={bookmark.tags} />
    </span>
  )
}

function BookmarkCard({ bookmark, onOpen, onOpenExternal, onEdit, onDelete }: BookmarkCardProps) {
  return (
    <div className="bookmark-card">
      <button
        type="button"
        className="bookmark-card-main"
        onClick={() => onOpen(bookmark)}
        onKeyDown={e => handleBookmarkCardKeyDown(e, bookmark, onOpen)}
      >
        <BookmarkCardIcon faviconUrl={bookmark.faviconUrl} />
        <span className="bookmark-card-content">
          <span className="bookmark-card-title">{bookmark.title}</span>
          <span className="bookmark-card-url">{bookmark.url}</span>
          <BookmarkDescription description={bookmark.description} />
          <BookmarkMeta bookmark={bookmark} />
        </span>
      </button>
      <div className="bookmark-card-actions">
        <button
          type="button"
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
          type="button"
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
          type="button"
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
          aria-label="Search bookmarks…"
          type="text"
          className="bookmark-search-input"
          placeholder="Search bookmarks…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
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
        <button
          aria-label="Clear filters"
          type="button"
          className="bookmark-clear-filters"
          onClick={onClearFilters}
          title="Clear filters"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function BookmarkListBody({
  filteredBookmarks,
  allBookmarks,
  handleOpen,
  handleOpenExternal,
  dispatch,
}: {
  filteredBookmarks: Bookmark[]
  allBookmarks: Bookmark[]
  handleOpen: (bookmark: Bookmark) => void
  handleOpenExternal: (bookmark: Bookmark) => void
  dispatch: ReturnType<typeof useBookmarkListState>['dispatch']
}) {
  if (filteredBookmarks.length === 0) {
    return (
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
    )
  }

  return (
    <>
      {filteredBookmarks.map(bookmark => (
        <BookmarkCard
          key={bookmark._id}
          bookmark={bookmark}
          onOpen={handleOpen}
          onOpenExternal={handleOpenExternal}
          onEdit={b => dispatch({ type: 'open-edit', bookmark: b })}
          onDelete={b => dispatch({ type: 'set-delete-target', bookmark: b })}
        />
      ))}
    </>
  )
}

interface BookmarkListProps {
  filterCategory?: string
  onOpenTab?: (viewId: string) => void
}

function resolveOptionalDialogText(value: string | null): string | undefined {
  return value ?? undefined
}

function getDeleteDescription(deleteError: string | null): string {
  return deleteError ?? 'This bookmark will be permanently removed.'
}

function BookmarkEditorDialog({
  dialogOpen,
  editingBookmark,
  categories,
  droppedUrl,
  droppedTitle,
  dispatch,
}: {
  dialogOpen: boolean
  editingBookmark: Bookmark | null
  categories: string[]
  droppedUrl: string | null
  droppedTitle: string | null
  dispatch: BookmarkDispatch
}) {
  if (!dialogOpen) return null

  return (
    <BookmarkDialog
      bookmark={editingBookmark}
      categories={categories}
      initialUrl={resolveOptionalDialogText(droppedUrl)}
      initialTitle={resolveOptionalDialogText(droppedTitle)}
      onClose={() => dispatch({ type: 'close-dialog' })}
    />
  )
}

function BookmarkDeleteDialog({
  deleteTarget,
  deleteError,
  dispatch,
  handleDelete,
}: {
  deleteTarget: Bookmark | null
  deleteError: string | null
  dispatch: BookmarkDispatch
  handleDelete: () => void
}) {
  if (!deleteTarget) return null

  return (
    <ConfirmDialog
      message={`Delete "${deleteTarget.title}"?`}
      description={getDeleteDescription(deleteError)}
      confirmLabel="Delete"
      variant="danger"
      onConfirm={handleDelete}
      onCancel={() => dispatch({ type: 'clear-delete' })}
    />
  )
}

function BookmarkDialogs({
  dialogOpen,
  editingBookmark,
  categories,
  droppedUrl,
  droppedTitle,
  deleteTarget,
  deleteError,
  dispatch,
  handleDelete,
}: {
  dialogOpen: boolean
  editingBookmark: Bookmark | null
  categories: string[]
  droppedUrl: string | null
  droppedTitle: string | null
  deleteTarget: Bookmark | null
  deleteError: string | null
  dispatch: BookmarkDispatch
  handleDelete: () => void
}) {
  return (
    <>
      <BookmarkEditorDialog
        dialogOpen={dialogOpen}
        editingBookmark={editingBookmark}
        categories={categories}
        droppedUrl={droppedUrl}
        droppedTitle={droppedTitle}
        dispatch={dispatch}
      />
      <BookmarkDeleteDialog
        deleteTarget={deleteTarget}
        deleteError={deleteError}
        dispatch={dispatch}
        handleDelete={handleDelete}
      />
    </>
  )
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
        onOpenTab(
          `browser:${encodeURIComponent(bookmark.url)}|${encodeURIComponent(bookmark.title)}`
        )
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
            type="button"
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
        <BookmarkListBody
          filteredBookmarks={filteredBookmarks}
          allBookmarks={allBookmarks}
          handleOpen={handleOpen}
          handleOpenExternal={handleOpenExternal}
          dispatch={dispatch}
        />
      </div>

      <BookmarkDialogs
        dialogOpen={state.dialogOpen}
        editingBookmark={state.editingBookmark}
        categories={categories ?? []}
        droppedUrl={state.droppedUrl}
        droppedTitle={state.droppedTitle}
        deleteTarget={state.deleteTarget}
        deleteError={state.deleteError}
        dispatch={dispatch}
        handleDelete={handleDelete}
      />
    </div>
  )
}
