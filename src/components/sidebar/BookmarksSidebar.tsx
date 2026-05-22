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

type BookmarkRecord = NonNullable<ReturnType<typeof useBookmarks>>[number]
type BookmarkCategories = ReturnType<typeof useBookmarkCategories>
type BookmarksByCategory = Map<string, BookmarkRecord[]>
type DragOver = { id: string; position: 'above' | 'below' } | null
type ContextMenuState = { x: number; y: number; bookmarkId: string } | null

interface BookmarkItemProps {
  bm: BookmarkRecord
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

interface BookmarkItemListProps {
  selectedItem: string | null
  dragOver: DragOver
  onItemSelect: (viewId: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent, id: string, categoryBookmarks: readonly BookmarkRecord[]) => void
}

interface CategoryTreeNodeProps extends BookmarkItemListProps {
  node: CategoryNode
  depth: number
  bookmarksByCategory: BookmarksByCategory
  isSectionExpanded: (sectionId: string) => boolean
  toggleSection: (sectionId: string) => void
}

interface CategoryNodeChildrenProps extends CategoryTreeNodeProps {
  directBookmarks: readonly BookmarkRecord[]
  hasChildren: boolean
  isExpanded: boolean
}

interface RootCategoryContentProps extends Omit<CategoryTreeNodeProps, 'depth'> {
  node: CategoryNode
}

interface BookmarksContentProps extends Omit<CategoryTreeNodeProps, 'node' | 'depth'> {
  categoryTree: CategoryNode[]
}

interface CategoryChevronProps {
  hasChildren: boolean
  isExpanded: boolean
  sectionId: string
  toggleSection: (sectionId: string) => void
}

interface BookmarksContextMenuProps {
  contextMenu: ContextMenuState
  menuRef: React.RefObject<HTMLDivElement | null>
  closeContextMenu: () => void
  onEdit: () => void
}

interface BookmarkEditorDialogProps {
  editingBookmark: BookmarkRecord | null
  categories: BookmarkCategories
  onClose: () => void
}

function bookmarkItemClassName(
  selectedItem: string | null,
  bmViewId: string,
  dragOver: DragOver,
  bookmarkId: string
) {
  const classes = ['sidebar-item']
  if (selectedItem === bmViewId) classes.push('selected')
  if (dragOver && dragOver.id === bookmarkId) {
    classes.push(`drag-over-${dragOver.position}`)
  }
  return classes.join(' ')
}

function categoryItemClassName(selectedItem: string | null, catViewId: string) {
  return `sidebar-item ${selectedItem === catViewId ? 'selected' : ''}`
}

function categoryHasContent(node: CategoryNode, directCount: number) {
  return node.children.length > 0 || directCount > 0
}

function categoryLabel(name: string) {
  if (!name) return 'Uncategorized'
  return name
}

function getBookmarkCount(bookmarks: readonly unknown[] | undefined): number {
  if (!bookmarks) return 0
  return bookmarks.length
}

function getCategoryBookmarks(bookmarksByCategory: BookmarksByCategory, fullPath: string) {
  const bookmarks = bookmarksByCategory.get(fullPath)
  if (!bookmarks) return []
  return bookmarks
}

function hasSafeFavicon(faviconUrl?: string) {
  if (!faviconUrl) return false
  return isSafeImageUrl(faviconUrl)
}

function isToggleKey(key: string) {
  return key === 'Enter' || key === ' '
}

function resolveDialogCategories(categories: BookmarkCategories) {
  if (!categories) return []
  return categories
}

function adjustContextMenuPosition(contextMenu: NonNullable<ContextMenuState>, rect: DOMRect) {
  let adjustedX = contextMenu.x
  let adjustedY = contextMenu.y
  if (adjustedX + rect.width > window.innerWidth) adjustedX = window.innerWidth - rect.width - 4
  if (adjustedY + rect.height > window.innerHeight) {
    adjustedY = window.innerHeight - rect.height - 4
  }
  return { x: adjustedX, y: adjustedY }
}

function hasContextMenuPositionChanged(
  contextMenu: NonNullable<ContextMenuState>,
  nextPosition: { x: number; y: number }
) {
  return contextMenu.x !== nextPosition.x || contextMenu.y !== nextPosition.y
}

function updateContextMenuPosition(
  contextMenu: ContextMenuState,
  nextPosition: { x: number; y: number }
) {
  if (!contextMenu) return null
  return { ...contextMenu, x: nextPosition.x, y: nextPosition.y }
}

function resolveDropInsertIndex(
  target: HTMLElement,
  clientY: number,
  fromIdx: number,
  toIdx: number
) {
  const rect = target.getBoundingClientRect()
  const adjustedToIdx = toIdx > fromIdx ? toIdx - 1 : toIdx
  return clientY < rect.top + rect.height / 2 ? adjustedToIdx : adjustedToIdx + 1
}

function reorderCategoryBookmarks(
  categoryBookmarks: readonly BookmarkRecord[],
  draggedId: string,
  targetId: string,
  currentTarget: HTMLElement,
  clientY: number
) {
  const list = [...categoryBookmarks]
  const fromIdx = list.findIndex(b => b._id === draggedId)
  const toIdx = list.findIndex(b => b._id === targetId)
  if (fromIdx < 0 || toIdx < 0) return null

  const [moved] = list.splice(fromIdx, 1)
  const insertIdx = resolveDropInsertIndex(currentTarget, clientY, fromIdx, toIdx)
  list.splice(insertIdx, 0, moved)
  return list
}

function createReorderUpdates(bookmarks: readonly BookmarkRecord[]) {
  return bookmarks.map((bm, i) => ({
    id: bm._id as Id<'bookmarks'>,
    sortOrder: i,
  }))
}

function findBookmarkById(bookmarks: readonly BookmarkRecord[] | undefined, bookmarkId: string) {
  if (!bookmarks) return null
  return bookmarks.find(bookmark => bookmark._id === bookmarkId) ?? null
}

function BookmarkIcon({ faviconUrl }: { faviconUrl?: string }) {
  if (hasSafeFavicon(faviconUrl)) {
    return <img src={faviconUrl} alt="" width={14} height={14} style={{ borderRadius: 2 }} />
  }
  return <Globe size={14} />
}

function CategoryCount({ count }: { count: number }) {
  if (count <= 0) return null
  return <span className="sidebar-item-count">{count}</span>
}

function handleCategoryChevronKeyDown(
  e: React.KeyboardEvent,
  sectionId: string,
  toggleSection: (sectionId: string) => void
) {
  if (!isToggleKey(e.key)) return
  e.stopPropagation()
  e.preventDefault()
  toggleSection(sectionId)
}

function CategoryChevron({
  hasChildren,
  isExpanded,
  sectionId,
  toggleSection,
}: CategoryChevronProps) {
  if (!hasChildren) {
    return <span className="sidebar-item-chevron" style={{ width: 12 }} />
  }

  return (
    <span
      className="sidebar-item-chevron"
      onClick={e => {
        e.stopPropagation()
        toggleSection(sectionId)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={e => handleCategoryChevronKeyDown(e, sectionId, toggleSection)}
    >
      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </span>
  )
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
      onKeyDown={onKeyboardActivate(() => onItemSelect(bmViewId))}
    >
      <span className="sidebar-item-chevron" style={{ width: 12 }} />
      <span className="sidebar-item-icon">
        <BookmarkIcon faviconUrl={bm.faviconUrl} />
      </span>
      <span className="sidebar-item-label">{bm.title}</span>
    </div>
  )
}

function renderBookmarkItems(
  bookmarks: readonly BookmarkRecord[],
  paddingLeft: string,
  {
    selectedItem,
    dragOver,
    onItemSelect,
    onContextMenu,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
  }: BookmarkItemListProps
) {
  return bookmarks.map(bm => (
    <BookmarkItem
      key={bm._id}
      bm={bm}
      selectedItem={selectedItem}
      dragOver={dragOver}
      paddingLeft={paddingLeft}
      onItemSelect={onItemSelect}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={e => onDrop(e, bm._id, bookmarks)}
    />
  ))
}

function CategoryNodeChildren({
  node,
  depth,
  directBookmarks,
  hasChildren,
  isExpanded,
  bookmarksByCategory,
  isSectionExpanded,
  toggleSection,
  selectedItem,
  dragOver,
  onItemSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: CategoryNodeChildrenProps) {
  if (!hasChildren || !isExpanded) return null

  const bookmarkPadding = `${12 + (depth + 1) * 16}px`
  return (
    <>
      {node.children.map(child => (
        <CategoryTreeNodeItem
          key={child.fullPath}
          node={child}
          depth={depth + 1}
          bookmarksByCategory={bookmarksByCategory}
          isSectionExpanded={isSectionExpanded}
          toggleSection={toggleSection}
          selectedItem={selectedItem}
          dragOver={dragOver}
          onItemSelect={onItemSelect}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
        />
      ))}
      {renderBookmarkItems(directBookmarks, bookmarkPadding, {
        selectedItem,
        dragOver,
        onItemSelect,
        onContextMenu,
        onDragStart,
        onDragOver,
        onDragEnd,
        onDrop,
      })}
    </>
  )
}

function CategoryTreeNodeItem({
  node,
  depth,
  bookmarksByCategory,
  isSectionExpanded,
  toggleSection,
  selectedItem,
  dragOver,
  onItemSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: CategoryTreeNodeProps) {
  const catViewId = `bookmarks-category:${node.fullPath}`
  const sectionId = `cat:${node.fullPath}`
  const directBookmarks = getCategoryBookmarks(bookmarksByCategory, node.fullPath)
  const hasChildren = categoryHasContent(node, directBookmarks.length)
  const isExpanded = isSectionExpanded(sectionId)

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
        <CategoryChevron
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          sectionId={sectionId}
          toggleSection={toggleSection}
        />
        <span className="sidebar-item-icon">
          <FolderOpen size={14} />
        </span>
        <span className="sidebar-item-label">{categoryLabel(node.name)}</span>
        <CategoryCount count={node.totalCount} />
      </div>
      <CategoryNodeChildren
        node={node}
        depth={depth}
        directBookmarks={directBookmarks}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        bookmarksByCategory={bookmarksByCategory}
        isSectionExpanded={isSectionExpanded}
        toggleSection={toggleSection}
        selectedItem={selectedItem}
        dragOver={dragOver}
        onItemSelect={onItemSelect}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
      />
    </div>
  )
}

function RootCategoryContent({
  node,
  bookmarksByCategory,
  isSectionExpanded,
  toggleSection,
  selectedItem,
  dragOver,
  onItemSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: RootCategoryContentProps) {
  if (node.name) {
    return (
      <CategoryTreeNodeItem
        node={node}
        depth={0}
        bookmarksByCategory={bookmarksByCategory}
        isSectionExpanded={isSectionExpanded}
        toggleSection={toggleSection}
        selectedItem={selectedItem}
        dragOver={dragOver}
        onItemSelect={onItemSelect}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
      />
    )
  }

  const uncatBookmarks = getCategoryBookmarks(bookmarksByCategory, node.fullPath)
  return (
    <>
      {node.children.map(child => (
        <CategoryTreeNodeItem
          key={child.fullPath}
          node={child}
          depth={0}
          bookmarksByCategory={bookmarksByCategory}
          isSectionExpanded={isSectionExpanded}
          toggleSection={toggleSection}
          selectedItem={selectedItem}
          dragOver={dragOver}
          onItemSelect={onItemSelect}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
        />
      ))}
      {renderBookmarkItems(uncatBookmarks, '12px', {
        selectedItem,
        dragOver,
        onItemSelect,
        onContextMenu,
        onDragStart,
        onDragOver,
        onDragEnd,
        onDrop,
      })}
    </>
  )
}

function EmptyBookmarksState() {
  return (
    <div className="sidebar-item" style={{ color: 'var(--text-muted)' }}>
      <span className="sidebar-item-label">No bookmarks yet</span>
    </div>
  )
}

function BookmarksHeader({ totalCount }: { totalCount: number }) {
  return (
    <div className="sidebar-panel-header">
      <h2>BOOKMARKS</h2>
      <CategoryCount count={totalCount} />
    </div>
  )
}

function BookmarksContent({
  categoryTree,
  bookmarksByCategory,
  isSectionExpanded,
  toggleSection,
  selectedItem,
  dragOver,
  onItemSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: BookmarksContentProps) {
  if (categoryTree.length === 0) {
    return (
      <div className="sidebar-panel-content">
        <EmptyBookmarksState />
      </div>
    )
  }

  return (
    <div className="sidebar-panel-content">
      {categoryTree.map(node => (
        <RootCategoryContent
          key={node.fullPath}
          node={node}
          bookmarksByCategory={bookmarksByCategory}
          isSectionExpanded={isSectionExpanded}
          toggleSection={toggleSection}
          selectedItem={selectedItem}
          dragOver={dragOver}
          onItemSelect={onItemSelect}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
        />
      ))}
    </div>
  )
}

function BookmarksContextMenu({
  contextMenu,
  menuRef,
  closeContextMenu,
  onEdit,
}: BookmarksContextMenuProps) {
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
        <button role="menuitem" onClick={onEdit}>
          Edit
        </button>
      </div>
    </>
  )
}

function BookmarkEditorDialog({ editingBookmark, categories, onClose }: BookmarkEditorDialogProps) {
  if (!editingBookmark) return null

  return (
    <BookmarkDialog
      bookmark={editingBookmark}
      categories={resolveDialogCategories(categories)}
      onClose={onClose}
    />
  )
}

function buildCategoryCounts(bookmarks: readonly BookmarkRecord[] | undefined) {
  const counts: Record<string, number> = {}
  bookmarks?.forEach(bookmark => {
    counts[bookmark.category] = (counts[bookmark.category] ?? 0) + 1
  })
  return counts
}

function buildBookmarksByCategory(bookmarks: readonly BookmarkRecord[] | undefined) {
  const map = new Map<string, BookmarkRecord[]>()
  bookmarks?.forEach(bookmark => {
    const list = map.get(bookmark.category) ?? []
    list.push(bookmark)
    map.set(bookmark.category, list)
  })

  for (const [, list] of map) {
    list.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  return map
}

export function BookmarksSidebar({ onItemSelect, selectedItem }: BookmarksSidebarProps) {
  const { has: isSectionExpanded, toggle: toggleSection } = useToggleSet()
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [editingBookmark, setEditingBookmark] = useState<BookmarkRecord | null>(null)
  const [dragOver, setDragOver] = useState<DragOver>(null)
  const [draggedIdRef, menuRef] = [useRef<string | null>(null), useRef<HTMLDivElement>(null)]
  const bookmarks = useBookmarks()
  const categories = useBookmarkCategories()
  const { reorder } = useBookmarkMutations()

  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const closeBookmarkDialog = useCallback(() => setEditingBookmark(null), [])

  const handleContextMenu = useCallback((e: React.MouseEvent, bookmarkId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, bookmarkId })
  }, [])

  const handleEditBookmark = useCallback(() => {
    if (!contextMenu) return
    const bookmark = findBookmarkById(bookmarks, contextMenu.bookmarkId)
    if (bookmark) setEditingBookmark(bookmark)
    closeContextMenu()
  }, [bookmarks, contextMenu, closeContextMenu])

  const handleDragStart = useCallback((e: React.DragEvent, bookmarkId: string) => {
    draggedIdRef.current = bookmarkId; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', bookmarkId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    if (!draggedIdRef.current || draggedIdRef.current === targetId) return
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    /* v8 ignore start */
    setDragOver({ id: targetId, position: e.clientY < rect.top + rect.height / 2 ? 'above' : 'below' })
    /* v8 ignore stop */
  }, [])

  const handleDragEnd = useCallback(() => { draggedIdRef.current = null; setDragOver(null) }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: string, categoryBookmarks: readonly BookmarkRecord[]) => {
    e.preventDefault()
    const draggedId = draggedIdRef.current
    draggedIdRef.current = null; setDragOver(null)
    if (!draggedId || draggedId === targetId) return
    const reorderedBookmarks = reorderCategoryBookmarks(categoryBookmarks, draggedId, targetId, e.currentTarget as HTMLElement, e.clientY)
    if (!reorderedBookmarks) return
    reorder({ updates: createReorderUpdates(reorderedBookmarks) }).catch(() => {})
  }, [reorder])

  useEffect(() => {
    if (!contextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => { /* v8 ignore start */ if (e.key === 'Escape') closeContextMenu() /* v8 ignore stop */ }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu, closeContextMenu])

  useEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const nextPosition = adjustContextMenuPosition(contextMenu, menuRef.current.getBoundingClientRect())
    if (!hasContextMenuPositionChanged(contextMenu, nextPosition)) return
    /* v8 ignore start */
    setContextMenu(prev => updateContextMenuPosition(prev, nextPosition))
    /* v8 ignore stop */
  }, [contextMenu])

  const totalCount = getBookmarkCount(bookmarks)
  const categoryCounts = useMemo(() => buildCategoryCounts(bookmarks), [bookmarks])
  const categoryTree = useMemo(() => buildCategoryTree(categories ?? [], categoryCounts), [categories, categoryCounts])
  const bookmarksByCategory = useMemo(() => buildBookmarksByCategory(bookmarks), [bookmarks])

  return (
    <div className="sidebar-panel">
      <BookmarksHeader totalCount={totalCount} />
      <BookmarksContent
        categoryTree={categoryTree} bookmarksByCategory={bookmarksByCategory}
        isSectionExpanded={isSectionExpanded} toggleSection={toggleSection}
        selectedItem={selectedItem} dragOver={dragOver} onItemSelect={onItemSelect}
        onContextMenu={handleContextMenu} onDragStart={handleDragStart}
        onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDrop={handleDrop}
      />
      <BookmarksContextMenu contextMenu={contextMenu} menuRef={menuRef} closeContextMenu={closeContextMenu} onEdit={handleEditBookmark} />
      <BookmarkEditorDialog editingBookmark={editingBookmark} categories={categories} onClose={closeBookmarkDialog} />
    </div>
  )
}
