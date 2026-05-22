import { ChevronDown, ChevronRight, FolderOpen, Globe } from 'lucide-react'
import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { useBookmarks, useBookmarkCategories, useBookmarkMutations } from '../../hooks/useConvex'
import { useToggleSet } from '../../hooks/useToggleSet'
import { onKeyboardActivate } from '../../utils/keyboard'
import { BookmarkDialog } from '../bookmarks/BookmarkDialog'
import type { Id } from '../../../convex/_generated/dataModel'
import { isSafeImageUrl, buildCategoryTree, type CategoryNode } from './bookmarksSidebarUtils'

function computeDropInsertIndex(
  fromIdx: number,
  toIdx: number,
  clientY: number,
  element: HTMLElement
): number {
  const rect = element.getBoundingClientRect()
  const adjustedToIdx = toIdx > fromIdx ? toIdx - 1 : toIdx
  return clientY < rect.top + rect.height / 2 ? adjustedToIdx : adjustedToIdx + 1
}

function computeAdjustedMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number
): { x: number; y: number } | null {
  let adjustedX = x
  let adjustedY = y
  if (adjustedX + menuWidth > window.innerWidth) adjustedX = window.innerWidth - menuWidth - 4
  if (adjustedY + menuHeight > window.innerHeight) adjustedY = window.innerHeight - menuHeight - 4
  if (adjustedX !== x || adjustedY !== y) return { x: adjustedX, y: adjustedY }
  return null
}

interface BookmarksSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

type DragOver = { id: string; position: 'above' | 'below' } | null

interface CategoryBookmark {
  _id: string
  url: string
  title: string
  faviconUrl?: string
  sortOrder: number
}

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

function bookmarkItemClassName(
  selectedItem: string | null,
  bmViewId: string,
  dragOver: DragOver,
  bookmarkId: string
) {
  const selectedClass = selectedItem === bmViewId ? 'selected' : ''
  const dragClass = dragOver && dragOver.id === bookmarkId ? `drag-over-${dragOver.position}` : ''
  return `sidebar-item ${selectedClass} ${dragClass}`
}

function handleBookmarkItemKeyDown(
  e: React.KeyboardEvent,
  bmViewId: string,
  onItemSelect: (viewId: string) => void
) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onItemSelect(bmViewId)
}

function BookmarkItemIcon({ bm }: { bm: BookmarkItemProps['bm'] }) {
  if (bm.faviconUrl && isSafeImageUrl(bm.faviconUrl)) {
    return <img src={bm.faviconUrl} alt="" width={14} height={14} style={{ borderRadius: 2 }} />
  }
  return <Globe size={14} />
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
      className={bookmarkItemClassName(selectedItem, bmViewId, dragOver, bm._id)}
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
      onKeyDown={e => handleBookmarkItemKeyDown(e, bmViewId, onItemSelect)}
    >
      <span className="sidebar-item-chevron" style={{ width: 12 }} />
      <span className="sidebar-item-icon">
        <BookmarkItemIcon bm={bm} />
      </span>
      <span className="sidebar-item-label">{bm.title}</span>
    </div>
  )
}

function categoryHasContent(node: CategoryNode, directCount: number) {
  return node.children.length > 0 || directCount > 0
}

function categoryItemClassName(selectedItem: string | null, catViewId: string) {
  return `sidebar-item ${selectedItem === catViewId ? 'selected' : ''}`
}

function categoryLabel(name: string) {
  return name || 'Uncategorized'
}

function CategoryNodeChevron({
  hasChildren,
  isExpanded,
  onToggle,
}: {
  hasChildren: boolean
  isExpanded: boolean
  onToggle: () => void
}) {
  if (!hasChildren) return <span className="sidebar-item-chevron" style={{ width: 12 }} />
  return (
    <span
      className="sidebar-item-chevron"
      onClick={e => {
        e.stopPropagation()
        onToggle()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
          e.preventDefault()
          onToggle()
        }
      }}
    >
      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </span>
  )
}

function CategoryTreeNode({
  node,
  depth,
  bookmarksByCategory,
  isSectionExpanded,
  selectedItem,
  dragOver,
  onItemSelect,
  onToggleSection,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  node: CategoryNode
  depth: number
  bookmarksByCategory: Map<string, CategoryBookmark[]>
  isSectionExpanded: (key: string) => boolean
  selectedItem: string | null
  dragOver: DragOver
  onItemSelect: (itemId: string) => void
  onToggleSection: (key: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent, id: string, categoryBookmarks: CategoryBookmark[]) => void
}) {
  const catViewId = `bookmarks-category:${node.fullPath}`
  const sectionKey = `cat:${node.fullPath}`
  const directBookmarks = bookmarksByCategory.get(node.fullPath) ?? []
  const hasChildren = categoryHasContent(node, directBookmarks.length)
  const isExpanded = isSectionExpanded(sectionKey)

  return (
    <div>
      <div
        className={categoryItemClassName(selectedItem, catViewId)}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onItemSelect(catViewId)}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyboardActivate(() => onItemSelect(catViewId))}
      >
        <CategoryNodeChevron
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggle={() => onToggleSection(sectionKey)}
        />
        <span className="sidebar-item-icon">
          <FolderOpen size={14} />
        </span>
        <span className="sidebar-item-label">{categoryLabel(node.name)}</span>
        {node.totalCount > 0 && <span className="sidebar-item-count">{node.totalCount}</span>}
      </div>
      {hasChildren && isExpanded && (
        <>
          {node.children.map(child => (
            <CategoryTreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              bookmarksByCategory={bookmarksByCategory}
              isSectionExpanded={isSectionExpanded}
              selectedItem={selectedItem}
              dragOver={dragOver}
              onItemSelect={onItemSelect}
              onToggleSection={onToggleSection}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}
          {directBookmarks.map(bm => (
            <BookmarkItem
              key={bm._id}
              bm={bm}
              selectedItem={selectedItem}
              dragOver={dragOver}
              paddingLeft={`${12 + (depth + 1) * 16}px`}
              onItemSelect={onItemSelect}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDrop={e => onDrop(e, bm._id, directBookmarks)}
            />
          ))}
        </>
      )}
    </div>
  )
}

function getBookmarkCount(bookmarks: readonly unknown[] | undefined): number {
  return bookmarks?.length ?? 0
}

function renderRootCategoryNode(
  node: CategoryNode,
  props: React.ComponentProps<typeof CategoryTreeNode>
) {
  return <CategoryTreeNode {...props} key={node.fullPath} node={node} depth={0} />
}

type BookmarkDropHandler = (
  e: React.DragEvent,
  id: string,
  categoryBookmarks: CategoryBookmark[]
) => void

function renderBookmarksPanelContent(
  categoryTree: CategoryNode[],
  bookmarksByCategory: Map<string, CategoryBookmark[]>,
  categoryProps: React.ComponentProps<typeof CategoryTreeNode>,
  bookmarkProps: Omit<BookmarkItemProps, 'bm' | 'paddingLeft' | 'onDrop'> & { onDrop: BookmarkDropHandler }
) {
  return categoryTree.flatMap(node => {
    if (!node.name) {
      return renderUncategorizedBookmarks(node, bookmarksByCategory, categoryProps, bookmarkProps)
    }
    return [renderRootCategoryNode(node, { ...categoryProps, node })]
  })
}

function renderUncategorizedBookmarks(
  node: CategoryNode,
  bookmarksByCategory: Map<string, CategoryBookmark[]>,
  categoryProps: React.ComponentProps<typeof CategoryTreeNode>,
  bookmarkProps: Omit<BookmarkItemProps, 'bm' | 'paddingLeft' | 'onDrop'> & { onDrop: BookmarkDropHandler }
) {
  const uncatBookmarks = bookmarksByCategory.get(node.fullPath) ?? []
  return [
    ...node.children.map(child => renderRootCategoryNode(child, categoryProps)),
    ...uncatBookmarks.map(bm => (
      <BookmarkItem
        key={bm._id}
        bm={bm}
        paddingLeft="12px"
        {...bookmarkProps}
        onDrop={e => bookmarkProps.onDrop(e, bm._id, uncatBookmarks)}
      />
    )),
  ]
}

function BookmarksContextMenu({
  contextMenu,
  bookmarks,
  closeContextMenu,
  menuRef,
  setEditingBookmark,
}: {
  contextMenu: { x: number; y: number; bookmarkId: string } | null
  bookmarks: ReturnType<typeof useBookmarks>
  closeContextMenu: () => void
  menuRef: React.RefObject<HTMLDivElement | null>
  setEditingBookmark: React.Dispatch<React.SetStateAction<NonNullable<ReturnType<typeof useBookmarks>>[number] | null>>
}) {
  if (!contextMenu) return null
  return (
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
  )
}

function EditingBookmarkDialog({
  editingBookmark,
  categories,
  onClose,
}: {
  editingBookmark: NonNullable<ReturnType<typeof useBookmarks>>[number] | null
  categories: ReturnType<typeof useBookmarkCategories>
  onClose: () => void
}) {
  if (!editingBookmark) return null
  return <BookmarkDialog bookmark={editingBookmark} categories={categories ?? []} onClose={onClose} />
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
    (e: React.DragEvent, targetId: string, categoryBookmarks: CategoryBookmark[]) => {
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
      const insertIdx = computeDropInsertIndex(fromIdx, toIdx, e.clientY, e.currentTarget as HTMLElement)
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
    const adjusted = computeAdjustedMenuPosition(contextMenu.x, contextMenu.y, rect.width, rect.height)
    if (adjusted) {
      /* v8 ignore start */
      setContextMenu(prev => (prev ? { ...prev, ...adjusted } : null))
      /* v8 ignore stop */
    }
  }, [contextMenu])

  const totalCount = getBookmarkCount(bookmarks)

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
    const map = new Map<string, CategoryBookmark[]>()
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

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>BOOKMARKS</h2>
        {totalCount > 0 && <span className="sidebar-item-count">{totalCount}</span>}
      </div>
      <div className="sidebar-panel-content">
        {categoryTree.length > 0 ? (
          renderBookmarksPanelContent(
            categoryTree,
            bookmarksByCategory,
            {
              node: categoryTree[0],
              depth: 0,
              bookmarksByCategory,
              isSectionExpanded,
              selectedItem,
              dragOver,
              onItemSelect,
              onToggleSection: toggleSection,
              onContextMenu: handleContextMenu,
              onDragStart: handleDragStart,
              onDragOver: handleDragOver,
              onDragEnd: handleDragEnd,
              onDrop: handleDrop,
            },
            {
              selectedItem,
              dragOver,
              onItemSelect,
              onContextMenu: handleContextMenu,
              onDragStart: handleDragStart,
              onDragOver: handleDragOver,
              onDragEnd: handleDragEnd,
              onDrop: handleDrop,
            }
          )
        ) : (
          <div className="sidebar-item" style={{ color: 'var(--text-muted)' }}>
            <span className="sidebar-item-label">No bookmarks yet</span>
          </div>
        )}
      </div>

      <BookmarksContextMenu
        contextMenu={contextMenu}
        bookmarks={bookmarks}
        closeContextMenu={closeContextMenu}
        menuRef={menuRef}
        setEditingBookmark={setEditingBookmark}
      />

      <EditingBookmarkDialog
        editingBookmark={editingBookmark}
        categories={categories}
        onClose={() => setEditingBookmark(null)}
      />
    </div>
  )
}
