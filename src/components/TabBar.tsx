import { useState, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import './TabBar.css'

export interface Tab {
  id: string
  label: string
  viewId: string
}

interface ContextMenuState {
  x: number
  y: number
  tabId: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onCloseOtherTabs: (tabId: string) => void
  onCloseTabsToRight: (tabId: string) => void
  onCloseAllTabs: () => void
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onCloseOtherTabs, onCloseTabsToRight, onCloseAllTabs }: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [contextMenu, closeContextMenu])

  useEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let adjustedX = contextMenu.x
    let adjustedY = contextMenu.y

    if (rect.right > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 4
    }
    if (rect.bottom > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 4
    }

    if (adjustedX !== contextMenu.x || adjustedY !== contextMenu.y) {
      setContextMenu(prev => prev ? { ...prev, x: adjustedX, y: adjustedY } : null)
    }
  }, [contextMenu])

  if (tabs.length === 0) {
    return null
  }

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    onTabClose(tabId)
  }

  const contextTabIndex = contextMenu
    ? tabs.findIndex(t => t.id === contextMenu.tabId)
    : -1
  const hasTabsToRight = contextTabIndex >= 0 && contextTabIndex < tabs.length - 1

  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => onTabSelect(tab.id)}
            onContextMenu={e => handleContextMenu(e, tab.id)}
            role="tab"
            tabIndex={0}
            aria-selected={activeTabId === tab.id}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabSelect(tab.id); } }}
          >
            <span className="tab-label">{tab.label}</span>
            <button
              className="tab-close"
              onClick={e => handleClose(e, tab.id)}
              aria-label={`Close ${tab.label}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
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
            <button role="menuitem" onClick={() => { onTabClose(contextMenu.tabId); closeContextMenu() }}>
              Close
            </button>
            <button role="menuitem" onClick={() => { onCloseOtherTabs(contextMenu.tabId); closeContextMenu() }} disabled={tabs.length <= 1}>
              Close Others
            </button>
            <button role="menuitem" onClick={() => { onCloseTabsToRight(contextMenu.tabId); closeContextMenu() }} disabled={!hasTabsToRight}>
              Close to the Right
            </button>
            <div className="tab-context-menu-separator" />
            <button role="menuitem" onClick={() => { onCloseAllTabs(); closeContextMenu() }}>
              Close All
            </button>
          </div>
        </>
      )}
    </div>
  )
}
