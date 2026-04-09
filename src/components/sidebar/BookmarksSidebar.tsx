import { ChevronDown, ChevronRight, FolderOpen, Globe } from 'lucide-react'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useBookmarks, useBookmarkCategories, useBookmarkMutations } from '../../hooks/useConvex'
import { BookmarkDialog } from '../bookmarks/BookmarkDialog'
import type { Id } from '../../../convex/_generated/dataModel'

function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

interface CategoryNode {
  name: string
  fullPath: string
  directCount: number
  totalCount: number
  children: CategoryNode[]
}

function buildCategoryTree(categories: string[], counts: Record<string, number>): CategoryNode[] {
  const root: CategoryNode[] = []
  const nodeMap = new Map<string, CategoryNode>()

  // Sort so parents are processed before children
  const sorted = [...categories].sort()

  for (const cat of sorted) {
    const parts = cat.split('/')
    let currentPath = ''

    for (let i = 0; i < parts.length; i++) {
      const parentPath = currentPath
      currentPath = i === 0 ? parts[i] : `${currentPath}/${parts[i]}`

      if (!nodeMap.has(currentPath)) {
        const node: CategoryNode = {
          name: parts[i],
          fullPath: currentPath,
          directCount: 0,
          totalCount: 0,
          children: [],
        }
        nodeMap.set(currentPath, node)

        if (parentPath && nodeMap.has(parentPath)) {
          nodeMap.get(parentPath)!.children.push(node)
        } else if (!parentPath) {
          root.push(node)
        }
      }
    }
  }

  // Assign direct counts and roll up totals
  for (const cat of sorted) {
    const directCount = counts[cat] ?? 0
    const node = nodeMap.get(cat)
    if (node) {
      node.directCount = directCount
    }
    // Add to all ancestors
    const parts = cat.split('/')
    let path = ''
    for (let i = 0; i < parts.length; i++) {
      path = i === 0 ? parts[i] : `${path}/${parts[i]}`
      const ancestor = nodeMap.get(path)
      if (ancestor) {
        ancestor.totalCount += directCount
      }
    }
  }

  return root
}

interface BookmarksSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

export function BookmarksSidebar({ onItemSelect, selectedItem }: BookmarksSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    bookmarkId: string
  } | null>(null)
  const [editingBookmark, setEditingBookmark] = useState<
    NonNullable<typeof bookmarks>[number] | null
  >(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below'>('below')
  const draggedIdRef = useRef<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const bookmarks = useBookmarks()
  const categories = useBookmarkCategories()
  const { reorder } = useBookmarkMutations()

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

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
    setDragOverId(targetId)
    setDragOverPosition(e.clientY < midY ? 'above' : 'below')
  }, [])

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null
    setDragOverId(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string, categoryBookmarks: NonNullable<typeof bookmarks>) => {
      e.preventDefault()
      const draggedId = draggedIdRef.current
      draggedIdRef.current = null
      setDragOverId(null)
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
      reorder({ updates }).catch(() => {/* Convex will retry; optimistic UI handles re-sync */})
    },
    [reorder]
  )

  useEffect(() => {
    if (!contextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
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
      setContextMenu(prev => (prev ? { ...prev, x: adjustedX, y: adjustedY } : null))
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
    // Sort each category's bookmarks by sortOrder
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
      const isExpanded = expandedSections.has(`cat:${node.fullPath}`)
      const displayCount = node.totalCount

      return (
        <div key={node.fullPath}>
          <div
            className={`sidebar-item ${selectedItem === catViewId ? 'selected' : ''}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => onItemSelect(catViewId)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onItemSelect(catViewId)
              }
            }}
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
                  if (e.key === 'Enter' || e.key === ' ') {
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
              {directBookmarks.map(bm => {
                const bmViewId = `browser:${encodeURIComponent(bm.url)}`
                const isDragTarget = dragOverId === bm._id
                return (
                  <div
                    key={bm._id}
                    className={`sidebar-item ${selectedItem === bmViewId ? 'selected' : ''} ${isDragTarget ? `drag-over-${dragOverPosition}` : ''}`}
                    style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
                    onClick={() => onItemSelect(bmViewId)}
                    onContextMenu={e => handleContextMenu(e, bm._id)}
                    draggable
                    onDragStart={e => handleDragStart(e, bm._id)}
                    onDragOver={e => handleDragOver(e, bm._id)}
                    onDragEnd={handleDragEnd}
                    onDrop={e => handleDrop(e, bm._id, directBookmarks)}
                    role="button"
                    tabIndex={0}
                    title={bm.url}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onItemSelect(bmViewId)
                      }
                    }}
                  >
                    <span className="sidebar-item-chevron" style={{ width: 12 }} />
                    <span className="sidebar-item-icon">
                      {bm.faviconUrl && isSafeImageUrl(bm.faviconUrl) ? (
                        <img
                          src={bm.faviconUrl}
                          alt=""
                          width={14}
                          height={14}
                          style={{ borderRadius: 2 }}
                        />
                      ) : (
                        <Globe size={14} />
                      )}
                    </span>
                    <span className="sidebar-item-label">{bm.title}</span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )
    },
    [
      expandedSections,
      selectedItem,
      onItemSelect,
      toggleSection,
      bookmarksByCategory,
      handleContextMenu,
      handleDragStart,
      handleDragOver,
      handleDragEnd,
      handleDrop,
      dragOverId,
      dragOverPosition,
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
            // Skip empty-name root nodes — render their children directly
            if (!node.name) {
              const uncatBookmarks = bookmarksByCategory.get(node.fullPath) ?? []
              return [
                ...node.children.map(child => renderCategoryNode(child, 0)),
                ...uncatBookmarks.map(bm => {
                  const bmViewId = `browser:${encodeURIComponent(bm.url)}`
                  const isDragTarget = dragOverId === bm._id
                  return (
                    <div
                      key={bm._id}
                      className={`sidebar-item ${selectedItem === bmViewId ? 'selected' : ''} ${isDragTarget ? `drag-over-${dragOverPosition}` : ''}`}
                      style={{ paddingLeft: '12px' }}
                      onClick={() => onItemSelect(bmViewId)}
                      onContextMenu={e => handleContextMenu(e, bm._id)}
                      draggable
                      onDragStart={e => handleDragStart(e, bm._id)}
                      onDragOver={e => handleDragOver(e, bm._id)}
                      onDragEnd={handleDragEnd}
                      onDrop={e => handleDrop(e, bm._id, uncatBookmarks)}
                      role="button"
                      tabIndex={0}
                      title={bm.url}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onItemSelect(bmViewId)
                        }
                      }}
                    >
                      <span className="sidebar-item-chevron" style={{ width: 12 }} />
                      <span className="sidebar-item-icon">
                        {bm.faviconUrl && isSafeImageUrl(bm.faviconUrl) ? (
                          <img
                            src={bm.faviconUrl}
                            alt=""
                            width={14}
                            height={14}
                            style={{ borderRadius: 2 }}
                          />
                        ) : (
                          <Globe size={14} />
                        )}
                      </span>
                      <span className="sidebar-item-label">{bm.title}</span>
                    </div>
                  )
                }),
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
          categories={categories ?? []}
          onClose={() => setEditingBookmark(null)}
        />
      )}
    </div>
  )
}
