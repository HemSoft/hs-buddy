import { useReducer, useMemo, useCallback, type DragEvent } from 'react'
import { useBookmarks, useBookmarkMutations, useBookmarkCategories } from './useConvex'
import { getErrorMessageWithFallback } from '../utils/errorUtils'
import type { Id } from '../../convex/_generated/dataModel'

/** Check if a string is a valid HTTP/HTTPS URL. */
function isValidHttpUrl(text: string | undefined): text is string {
  /* v8 ignore start -- text always non-empty when called from extractUrlFromDataTransfer */
  if (!text) return false
  /* v8 ignore stop */
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol)
  } catch {
    return false
  }
}

function extractUrlFromDataTransfer(data: DataTransfer): string | null {
  const uri = data.getData('text/uri-list')
  if (uri) {
    const found =
      /* v8 ignore start */
      uri
        /* v8 ignore stop */
        .split('\n')
        .find(l => !l.startsWith('#'))
        ?.trim() ?? null
    /* v8 ignore start */
    if (found) return found
    /* v8 ignore stop */
  }
  const text = data.getData('text/plain')?.trim()
  if (isValidHttpUrl(text)) return text
  return null
}

function isUsableLinkText(text: string | undefined, url: string): text is string {
  return !!text && text !== url && !text.startsWith('http')
}

function extractTitleFromHtml(html: string, url: string): string | null {
  if (!html) return null
  const anchorMatch = html.match(/<a[^>]*>([^<]+)<\/a>/i)
  const linkText = anchorMatch?.[1]?.trim()
  return isUsableLinkText(linkText, url) ? linkText : null
}

export type Bookmark = {
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

interface BookmarkListState {
  searchQuery: string
  selectedCategory: string
  selectedTag: string
  dialogOpen: boolean
  editingBookmark: Bookmark | null
  deleteTarget: Bookmark | null
  deleteError: string | null
  droppedUrl: string | null
  droppedTitle: string | null
  dragOver: boolean
}

type BookmarkListAction =
  | { type: 'set-search'; query: string }
  | { type: 'set-category'; category: string }
  | { type: 'set-tag'; tag: string }
  | { type: 'clear-filters' }
  | { type: 'open-add' }
  | { type: 'open-edit'; bookmark: Bookmark }
  | { type: 'open-drop'; url: string; title: string | null }
  | { type: 'close-dialog' }
  | { type: 'set-delete-target'; bookmark: Bookmark | null }
  | { type: 'set-delete-error'; error: string | null }
  | { type: 'clear-delete' }
  | { type: 'set-drag-over'; active: boolean }

function handleDialogAction(
  state: BookmarkListState,
  action: BookmarkListAction
): BookmarkListState | null {
  switch (action.type) {
    case 'open-add':
      return {
        ...state,
        dialogOpen: true,
        editingBookmark: null,
        droppedUrl: null,
        droppedTitle: null,
      }
    case 'open-edit':
      return { ...state, dialogOpen: true, editingBookmark: action.bookmark }
    case 'open-drop':
      return {
        ...state,
        dialogOpen: true,
        editingBookmark: null,
        droppedUrl: action.url,
        droppedTitle: action.title,
      }
    case 'close-dialog':
      return {
        ...state,
        dialogOpen: false,
        editingBookmark: null,
        droppedUrl: null,
        droppedTitle: null,
      }
    default:
      return null
  }
}

function handleDeleteAction(
  state: BookmarkListState,
  action: BookmarkListAction
): BookmarkListState | null {
  switch (action.type) {
    case 'set-delete-target':
      return { ...state, deleteTarget: action.bookmark }
    case 'set-delete-error':
      return { ...state, deleteError: action.error }
    case 'clear-delete':
      return { ...state, deleteTarget: null, deleteError: null }
    default:
      return null
  }
}

function handleFilterAction(
  state: BookmarkListState,
  action: BookmarkListAction
): BookmarkListState | null {
  switch (action.type) {
    case 'set-search':
      return { ...state, searchQuery: action.query }
    case 'set-category':
      return { ...state, selectedCategory: action.category }
    case 'set-tag':
      return { ...state, selectedTag: action.tag }
    case 'clear-filters':
      return { ...state, searchQuery: '', selectedCategory: '', selectedTag: '' }
    case 'set-drag-over':
      return { ...state, dragOver: action.active }
    default:
      return null
  }
}

function bookmarkListReducer(
  state: BookmarkListState,
  action: BookmarkListAction
): BookmarkListState {
  return (
    handleFilterAction(state, action) ??
    handleDialogAction(state, action) ??
    handleDeleteAction(state, action) ??
    state
  )
}

export function useBookmarkListState(filterCategory?: string) {
  const allBookmarks = useBookmarks()
  const categories = useBookmarkCategories()
  const { remove, recordVisit } = useBookmarkMutations()

  const [state, dispatch] = useReducer(bookmarkListReducer, {
    searchQuery: '',
    selectedCategory: filterCategory ?? '',
    selectedTag: '',
    dialogOpen: false,
    editingBookmark: null,
    deleteTarget: null,
    deleteError: null,
    droppedUrl: null,
    droppedTitle: null,
    dragOver: false,
  })

  const allTags = useMemo(() => {
    if (!allBookmarks) return []
    const tagSet = new Set<string>()
    for (const b of allBookmarks) {
      if (b.tags) b.tags.forEach(t => tagSet.add(t))
    }
    return [...tagSet].sort()
  }, [allBookmarks])

  const filteredBookmarks = useMemo(() => {
    if (!allBookmarks) return []
    let result = [...allBookmarks] as Bookmark[]

    if (state.selectedCategory) {
      result = result.filter(
        b =>
          b.category === state.selectedCategory ||
          b.category.startsWith(state.selectedCategory + '/')
      )
    }
    if (state.selectedTag) {
      result = result.filter(b => b.tags?.includes(state.selectedTag))
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase()
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
  }, [allBookmarks, state.selectedCategory, state.selectedTag, state.searchQuery])

  const handleDelete = useCallback(async () => {
    if (!state.deleteTarget) return
    try {
      await remove({ id: state.deleteTarget._id })
      dispatch({ type: 'clear-delete' })
    } catch (err) {
      dispatch({
        type: 'set-delete-error',
        error: getErrorMessageWithFallback(err, 'Failed to delete bookmark'),
      })
    }
  }, [state.deleteTarget, remove])

  const extractDropData = useCallback(
    (data: DataTransfer): { url: string; title: string | null } | null => {
      const url = extractUrlFromDataTransfer(data)
      if (!url) return null
      const title = extractTitleFromHtml(data.getData('text/html'), url)
      return { url, title }
    },
    []
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.some(t => t === 'text/uri-list' || t === 'text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      dispatch({ type: 'set-drag-over', active: true })
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    dispatch({ type: 'set-drag-over', active: false })
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      dispatch({ type: 'set-drag-over', active: false })
      const result = extractDropData(e.dataTransfer)
      if (result) {
        dispatch({ type: 'open-drop', url: result.url, title: result.title })
      }
    },
    [extractDropData]
  )

  return {
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
    hasFilters: !!(state.searchQuery || state.selectedCategory || state.selectedTag),
  }
}
