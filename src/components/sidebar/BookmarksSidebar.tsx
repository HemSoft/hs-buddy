import { ChevronDown, ChevronRight, FolderOpen, Globe } from 'lucide-react'
import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { useBookmarks, useBookmarkCategories, useBookmarkMutations } from '../../hooks/useConvex'
import { useToggleSet } from '../../hooks/useToggleSet'
import { onKeyboardActivate } from '../../utils/keyboard'
import { BookmarkDialog } from '../bookmarks/BookmarkDialog'
import type { Id } from '../../../convex/_generated/dataModel'
import { isSafeImageUrl, buildCategoryTree, type CategoryNode } from './bookmarksSidebarUtils'

interface BookmarksSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

type DragOver = { id: string; position: 'above' | 'below' } | null

interface BookmarkItemProps {
  bm: { _id: string; url: string; title: string; faviconUrl?: string }
  selectedItem: string | null
  dragOver: DragOver
  paddingLeft: string
  onItemSelect: (viewId: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent, id: string) => void
}

function BookmarkItem({
  bm,
  selectedItem,
  dragOver,
  paddingLeft,
  onItemSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: BookmarkItemProps) {
  const bmViewId = `browser:${encodeURIComponent(bm.url)}`
  return (
    <div
      key={bm._id}
      className={`sidebar-item ${selectedItem === bmViewId ? 'selected' : ''} ${dragOver && dragOver.id === bm._id ? `drag-over-${dragOver.position}` : ''}`}
      style={{ paddingLeft }}
      onClick={() => onItemSelect(bmViewId)}
      onContextMenu={e => onContextMenu(e, bm._id)}
      draggable
      onDragStart={e => onDragStart(e, bm._id)}
      onDragOver={e => onDragOver(e, bm._id)}
      onDragEnd={onDragEnd}
      onDrop={e => onDrop(e, bm._id)}
      role="button"
      tabIndex={0}
      title={bm.url}
      onKeyDown={e => {
        /* v8 ignore start */
        if (e.key === 'Enter' || e.key === ' ') {
          /* v8 ignore stop */
          e.preventDefault()
          onItemSelect(bmViewId)
        }
      }}
    >
      <span className="sidebar-item-chevron" style={{ width: 12 }} />
      <span className="sidebar-item-icon">
        {bm.faviconUrl && isSafeImageUrl(bm.faviconUrl) ? (
          <img src={bm.faviconUrl} alt="" width={14} height={14} style={{ borderRadius: 2 }} />
        ) : (
          <Globe size={14} />
        )}
      </span>
      <span className="sidebar-item-label">{bm.title}</span>
    </div>
  )
}

export function BookmarksSidebar({ onItemSelect, selectedItem }: BookmarksSidebarProps) {
  const { has: isSectionExpanded, toggle: toggleSection } = useToggleSet()
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    bookmarkId: string
  } | null>(null)
  const [editingBookmark, setEditingBookmark] = useState<
    NonNullable<typeof bookmarks>[number] | null
  >(null)
  const [dragOver, setDragOver] = useState<DragOver>(null)
  const draggedIdRef = useRef<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const bookmarks = useBookmarks()
  const categories = useBookmarkCategories()
  const { reorder } = useBookmarkMutations()

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleContextMenu = useCallback((e: React.MouseEvent, bookmarkId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, bookmarkId })
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
    /* v8 ignore start */
    setDragOver({ id: targetId, position: e.clientY < midY ? 'above' : 'below' })
    /* v8 ignore stop */
  }, [])

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null
    setDragOver(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string, categoryBookmarks: NonNullable<typeof bookmarks>) => {
      e.preventDefault()
      const draggedId = draggedIdRef.current
      draggedIdRef.current = null
      setDragOver(null)
      if (!draggedId || draggedId === targetId) return

      const list = [...categoryBookmarks]
      const fromIdx = list.findIndex(b => b._id === draggedId)
      const toIdx = list.findIndex(b => b._id === targetId)
      /* v8 ignore start */
      if (fromIdx < 0 || toIdx < 0) return
      /* v8 ignore stop */

      const [moved] = list.splice(fromIdx, 1)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const adjustedToIdx = toIdx > fromIdx ? toIdx - 1 : toIdx
      /* v8 ignore start */
      const insertIdx = e.clientY < rect.top + rect.height / 2 ? adjustedToIdx : adjustedToIdx + 1
      /* v8 ignore stop */
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
    if (!contextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => {
      /* v8 ignore start */
      if (e.key === 'Escape') closeContextMenu()
      /* v8 ignore stop */
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu, closeContextMenu])

  useEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    let adjustedX = contextMenu.x
    let adjustedY = contextMenu.y
    if (adjustedX + rect.width > window.innerWidth) adjustedX = window.innerWidth - rect.width - 4
    if (adjustedY + rect.height > window.innerHeight)
      adjustedY = window.innerHeight - rect.height - 4
    if (adjustedX !== contextMenu.x || adjustedY !== contextMenu.y) {
      /* v8 ignore start */
      setContextMenu(prev => (prev ? { ...prev, x: adjustedX, y: adjustedY } : null))
      /* v8 ignore stop */
    }
  }, [contextMenu])

  const totalCount = bookmarks?.length ?? 0

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    bookmarks?.forEach(b => {
      counts[b.category] = (counts[b.category] ?? 0) + 1
    })
    return counts
  }, [bookmarks])

  const categoryTree = useMemo(
    () => buildCategoryTree(categories ?? [], categoryCounts),
    [categories, categoryCounts]
  )

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

  const renderCategoryNode = useCallback(
    (node: CategoryNode, depth: number) => {
      const catViewId = `bookmarks-category:${node.fullPath}`
      const directBookmarks = bookmarksByCategory.get(node.fullPath) ?? []
      const hasChildren = node.children.length > 0 || directBookmarks.length > 0
      const isExpanded = isSectionExpanded(`cat:${node.fullPath}`)
      const displayCount = node.totalCount

      return (
        <div key={node.fullPath}>
          <div
            className={`sidebar-item ${selectedItem === catViewId ? 'selected' : ''}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => onItemSelect(catViewId)}
            role="button"
            tabIndex={0}
            onKeyDown={onKeyboardActivate(() => onItemSelect(catViewId))}
          >
            {hasChildren ? (
              <span
                className="sidebar-item-chevron"
                onClick={e => {
                  e.stopPropagation()
                  toggleSection(`cat:${node.fullPath}`)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  /* v8 ignore start */
                  if (e.key === 'Enter' || e.key === ' ') {
                    /* v8 ignore stop */
                    e.stopPropagation()
                    e.preventDefault()
                    toggleSection(`cat:${node.fullPath}`)
                  }
                }}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            ) : (
              <span className="sidebar-item-chevron" style={{ width: 12 }} />
            )}
            <span className="sidebar-item-icon">
              <FolderOpen size={14} />
            </span>
            <span className="sidebar-item-label">{node.name || 'Uncategorized'}</span>
            {displayCount > 0 && <span className="sidebar-item-count">{displayCount}</span>}
          </div>
          {hasChildren && isExpanded && (
            <>
              {node.children.map(child => renderCategoryNode(child, depth + 1))}
              {directBookmarks.map(bm => (
                <BookmarkItem
                  key={bm._id}
                  bm={bm}
                  selectedItem={selectedItem}
                  dragOver={dragOver}
                  paddingLeft={`${12 + (depth + 1) * 16}px`}
                  onItemSelect={onItemSelect}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDrop={e => handleDrop(e, bm._id, directBookmarks)}
                />
              ))}
            </>
          )}
        </div>
      )
    },
    [
      isSectionExpanded,
      selectedItem,
      onItemSelect,
      toggleSection,
      bookmarksByCategory,
      handleContextMenu,
      handleDragStart,
      handleDragOver,
      handleDragEnd,
      handleDrop,
      dragOver,
    ]
  )

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>BOOKMARKS</h2>
        {totalCount > 0 && <span className="sidebar-item-count">{totalCount}</span>}
      </div>
      <div className="sidebar-panel-content">
        {categoryTree.length > 0 ? (
          categoryTree.flatMap(node => {
            if (!node.name) {
              const uncatBookmarks = bookmarksByCategory.get(node.fullPath) ?? []
              return [
                /* v8 ignore start */
                ...node.children.map(child => renderCategoryNode(child, 0)),
                /* v8 ignore stop */
                ...uncatBookmarks.map(bm => (
                  <BookmarkItem
                    key={bm._id}
                    bm={bm}
                    selectedItem={selectedItem}
                    dragOver={dragOver}
                    paddingLeft="12px"
                    onItemSelect={onItemSelect}
                    onContextMenu={handleContextMenu}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDrop={e => handleDrop(e, bm._id, uncatBookmarks)}
                  />
                )),
              ]
            }
            return [renderCategoryNode(node, 0)]
          })
        ) : (
          <div className="sidebar-item" style={{ color: 'var(--text-muted)' }}>
            <span className="sidebar-item-label">No bookmarks yet</span>
          </div>
        )}
      </div>

      {contextMenu && (
        <>
          <div className="tab-context-menu-overlay" onClick={closeContextMenu} aria-hidden="true" />
          <div
            ref={menuRef}
            className="tab-context-menu"
            role="menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              role="menuitem"
              onClick={() => {
                const bm = bookmarks?.find(b => b._id === contextMenu.bookmarkId)
                if (bm) setEditingBookmark(bm)
                closeContextMenu()
              }}
            >
              Edit
            </button>
          </div>
        </>
      )}

      {editingBookmark && (
        <BookmarkDialog
          bookmark={editingBookmark}
          /* v8 ignore start */
          categories={categories ?? []}
          /* v8 ignore stop */
          onClose={() => setEditingBookmark(null)}
        />
      )}
    </div>
  )
}
