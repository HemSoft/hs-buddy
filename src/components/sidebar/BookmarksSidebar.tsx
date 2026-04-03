import { ChevronDown, ChevronRight, Bookmark, FolderOpen, Globe } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useBookmarks, useBookmarkCategories } from '../../hooks/useConvex'

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

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const totalCount = bookmarks?.length ?? 0

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    bookmarks?.forEach(b => {
      counts[b.category] = (counts[b.category] ?? 0) + 1
    })
    return counts
  }, [bookmarks])

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

        {/* By Category */}
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
              {categories && categories.length > 0 ? (
                categories.map(cat => {
                  const catViewId = `bookmarks-category:${cat}`
                  const catCount = categoryCounts[cat] ?? 0
                  return (
                    <div
                      key={cat}
                      className={`sidebar-item ${selectedItem === catViewId ? 'selected' : ''}`}
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
                      <span className="sidebar-item-icon">
                        <FolderOpen size={14} />
                      </span>
                      <span className="sidebar-item-label">{cat}</span>
                      {catCount > 0 && <span className="sidebar-item-count">{catCount}</span>}
                    </div>
                  )
                })
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
