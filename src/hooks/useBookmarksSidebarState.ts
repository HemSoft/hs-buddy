import { useReducer, useMemo, useCallback, useEffect, useRef } from 'react'
import { useBookmarks, useBookmarkCategories, useBookmarkMutations } from './useConvex'
import type { Id } from '../../convex/_generated/dataModel'

interface BookmarksSidebarState {
  expandedSections: Set<string>
  contextMenu: { x: number; y: number; bookmarkId: string } | null
  editingBookmark: NonNullable<ReturnType<typeof useBookmarks>>[number] | null
  dragOverId: string | null
  dragOverPosition: 'above' | 'below'
}

type BookmarksSidebarAction =
  | { type: 'toggle-section'; sectionId: string }
  | { type: 'open-context-menu'; x: number; y: number; bookmarkId: string }
  | { type: 'adjust-context-menu'; x: number; y: number }
  | { type: 'close-context-menu' }
  | { type: 'set-editing'; bookmark: NonNullable<ReturnType<typeof useBookmarks>>[number] | null }
  | { type: 'set-drag-over'; id: string | null; position?: 'above' | 'below' }
  | { type: 'clear-drag' }

function sidebarReducer(
  state: BookmarksSidebarState,
  action: BookmarksSidebarAction
): BookmarksSidebarState {
  switch (action.type) {
    case 'toggle-section': {
      const next = new Set(state.expandedSections)
      if (next.has(action.sectionId)) next.delete(action.sectionId)
      else next.add(action.sectionId)
      return { ...state, expandedSections: next }
    }
    case 'open-context-menu':
      return { ...state, contextMenu: { x: action.x, y: action.y, bookmarkId: action.bookmarkId } }
    case 'adjust-context-menu':
      return state.contextMenu
        ? { ...state, contextMenu: { ...state.contextMenu, x: action.x, y: action.y } }
        : state
    case 'close-context-menu':
      return { ...state, contextMenu: null }
    case 'set-editing':
      return { ...state, editingBookmark: action.bookmark }
    case 'set-drag-over':
      return {
        ...state,
        dragOverId: action.id,
        dragOverPosition: action.position ?? state.dragOverPosition,
      }
    case 'clear-drag':
      return { ...state, dragOverId: null }
    default:
      return state
  }
}

export function useBookmarksSidebarState() {
  const bookmarks = useBookmarks()
  const categories = useBookmarkCategories()
  const { reorder } = useBookmarkMutations()
  const draggedIdRef = useRef<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [state, dispatch] = useReducer(sidebarReducer, {
    expandedSections: new Set<string>(),
    contextMenu: null,
    editingBookmark: null,
    dragOverId: null,
    dragOverPosition: 'below' as const,
  })

  const handleContextMenu = useCallback((e: React.MouseEvent, bookmarkId: string) => {
    e.preventDefault()
    e.stopPropagation()
    dispatch({ type: 'open-context-menu', x: e.clientX, y: e.clientY, bookmarkId })
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, bookmarkId: string) => {
    draggedIdRef.current = bookmarkId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', bookmarkId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    if (!draggedIdRef.current || draggedIdRef.current === targetId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    dispatch({
      type: 'set-drag-over',
      id: targetId,
      position: e.clientY < midY ? 'above' : 'below',
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null
    dispatch({ type: 'clear-drag' })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string, categoryBookmarks: NonNullable<typeof bookmarks>) => {
      e.preventDefault()
      const draggedId = draggedIdRef.current
      draggedIdRef.current = null
      dispatch({ type: 'clear-drag' })
      if (!draggedId || draggedId === targetId) return

      const list = [...categoryBookmarks]
      const fromIdx = list.findIndex(b => b._id === draggedId)
      const toIdx = list.findIndex(b => b._id === targetId)
      if (fromIdx < 0 || toIdx < 0) return

      const [moved] = list.splice(fromIdx, 1)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const adjustedToIdx = toIdx > fromIdx ? toIdx - 1 : toIdx
      const insertIdx = e.clientY < rect.top + rect.height / 2 ? adjustedToIdx : adjustedToIdx + 1
      list.splice(insertIdx, 0, moved)

      const updates = list.map((bm, i) => ({
        id: bm._id as Id<'bookmarks'>,
        sortOrder: i,
      }))
      reorder({ updates }).catch(() => {
        /* Convex will retry; optimistic UI handles re-sync */
      })
    },
    [reorder]
  )

  useEffect(() => {
    if (!state.contextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'close-context-menu' })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state.contextMenu])

  useEffect(() => {
    if (!state.contextMenu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    let adjustedX = state.contextMenu.x
    let adjustedY = state.contextMenu.y
    if (adjustedX + rect.width > window.innerWidth) adjustedX = window.innerWidth - rect.width - 4
    if (adjustedY + rect.height > window.innerHeight)
      adjustedY = window.innerHeight - rect.height - 4
    if (adjustedX !== state.contextMenu.x || adjustedY !== state.contextMenu.y) {
      dispatch({ type: 'adjust-context-menu', x: adjustedX, y: adjustedY })
    }
  }, [state.contextMenu])

  const totalCount = bookmarks?.length ?? 0

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    bookmarks?.forEach(b => {
      counts[b.category] = (counts[b.category] ?? 0) + 1
    })
    return counts
  }, [bookmarks])

  const bookmarksByCategory = useMemo(() => {
    const map = new Map<string, NonNullable<typeof bookmarks>>()
    bookmarks?.forEach(b => {
      const list = map.get(b.category) ?? []
      list.push(b)
      map.set(b.category, list)
    })
    for (const [, list] of map) {
      list.sort((a, b) => a.sortOrder - b.sortOrder)
    }
    return map
  }, [bookmarks])

  return {
    state,
    dispatch,
    bookmarks,
    categories,
    menuRef,
    totalCount,
    categoryCounts,
    bookmarksByCategory,
    handleContextMenu,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
  }
}
