import { ChevronDown, ChevronRight, Bookmark, FolderOpen, Globe } from 'lucide-react'
import { useState, useMemo, useCallback } from 'react'
import { useBookmarks, useBookmarkCategories } from '../../hooks/useConvex'

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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['bookmarks-all', 'bookmarks-categories'])
  )
  const bookmarks = useBookmarks()
  const categories = useBookmarkCategories()

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

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
            <span className="sidebar-item-label">{node.name}</span>
            {displayCount > 0 && <span className="sidebar-item-count">{displayCount}</span>}
          </div>
          {hasChildren && isExpanded && (
            <>
              {node.children.map(child => renderCategoryNode(child, depth + 1))}
              {directBookmarks.map(bm => {
                const bmViewId = `browser:${encodeURIComponent(bm.url)}`
                return (
                  <div
                    key={bm._id}
                    className={`sidebar-item ${selectedItem === bmViewId ? 'selected' : ''}`}
                    style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
                    onClick={() => onItemSelect(bmViewId)}
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
    [expandedSections, selectedItem, onItemSelect, toggleSection, bookmarksByCategory]
  )

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>BOOKMARKS</h2>
        {totalCount > 0 && <span className="sidebar-item-count">{totalCount}</span>}
      </div>
      <div className="sidebar-panel-content">
        {/* All Bookmarks */}
        <div className="sidebar-section">
          <div
            className="sidebar-section-header"
            role="button"
            tabIndex={0}
            onClick={() => toggleSection('bookmarks-all')}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSection('bookmarks-all')
              }
            }}
          >
            <div className="sidebar-section-title">
              {expandedSections.has('bookmarks-all') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <Globe size={16} />
              </span>
              <span>All Bookmarks</span>
            </div>
          </div>
          {expandedSections.has('bookmarks-all') && (
            <div className="sidebar-section-items">
              <div
                className={`sidebar-item ${selectedItem === 'bookmarks-all' ? 'selected' : ''}`}
                onClick={() => onItemSelect('bookmarks-all')}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemSelect('bookmarks-all')
                  }
                }}
              >
                <span className="sidebar-item-icon">
                  <Bookmark size={14} />
                </span>
                <span className="sidebar-item-label">Browse All</span>
                {totalCount > 0 && <span className="sidebar-item-count">{totalCount}</span>}
              </div>
            </div>
          )}
        </div>

        {/* By Category (hierarchical tree) */}
        <div className="sidebar-section">
          <div
            className="sidebar-section-header"
            role="button"
            tabIndex={0}
            onClick={() => toggleSection('bookmarks-categories')}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSection('bookmarks-categories')
              }
            }}
          >
            <div className="sidebar-section-title">
              {expandedSections.has('bookmarks-categories') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <FolderOpen size={16} />
              </span>
              <span>By Category</span>
            </div>
          </div>
          {expandedSections.has('bookmarks-categories') && (
            <div className="sidebar-section-items">
              {categoryTree.length > 0 ? (
                categoryTree.map(node => renderCategoryNode(node, 0))
              ) : (
                <div className="sidebar-item" style={{ color: 'var(--text-muted)' }}>
                  <span className="sidebar-item-label">No categories yet</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
