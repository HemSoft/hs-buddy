import { type SyntheticEvent, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { X, Plus, TerminalSquare, GripHorizontal } from 'lucide-react'
import type { TerminalTab } from '../../hooks/useTerminalPanel'
import { TerminalTabContextMenu } from './TerminalTabContextMenu'
import './TerminalPanel.css'

const TerminalPane = lazy(() => import('./TerminalPane').then(m => ({ default: m.TerminalPane })))

interface TerminalPanelProps {
  tabs: TerminalTab[]
  activeTabId: string | null
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onAddTab: () => void
  onRenameTab: (tabId: string, title: string) => void
  onSetTabColor: (tabId: string, color: string | undefined) => void
}

export function TerminalPanel({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onAddTab,
  onRenameTab,
  onSetTabColor,
}: TerminalPanelProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tab: TerminalTab } | null>(null)

  const handleTabClose = useCallback(
    (e: SyntheticEvent, tabId: string) => {
      e.stopPropagation()
      onTabClose(tabId)
    },
    [onTabClose]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTab) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, tab })
    },
    []
  )

  // Close context menu when active tab changes
  useEffect(() => {
    setContextMenu(null)
  }, [activeTabId])

  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <div className="terminal-panel">
      <div className="terminal-panel-resize-grip" title="Drag to resize">
        <GripHorizontal size={14} />
      </div>
      <div className="terminal-panel-header">
        <div className="terminal-panel-label">
          <TerminalSquare size={12} />
          <span>Terminal</span>
        </div>
        <div className="terminal-panel-tabs">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`terminal-panel-tab ${tab.id === activeTabId ? 'active' : ''}`}
              title={tab.cwd || tab.title}
              onContextMenu={e => handleContextMenu(e, tab)}
              style={tab.color ? { '--tab-color': tab.color } as React.CSSProperties : undefined}
            >
              {tab.color && <span className="terminal-panel-tab-color-dot" />}
              <button
                type="button"
                className="terminal-panel-tab-button"
                onClick={() => onTabSelect(tab.id)}
              >
                <span className="terminal-panel-tab-title">{tab.title}</span>
              </button>
              <button
                type="button"
                className="terminal-panel-tab-close"
                onClick={e => handleTabClose(e, tab.id)}
                aria-label={`Close ${tab.title}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="terminal-panel-add-tab"
            onClick={onAddTab}
            title="New Terminal"
            aria-label="New Terminal"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="terminal-panel-body">
        {activeTab ? (
          <Suspense fallback={<div className="terminal-panel-loading">Loading terminal…</div>}>
            <TerminalPane
              key={activeTab.id}
              viewKey={activeTab.id}
              cwd={activeTab.cwd || undefined}
            />
          </Suspense>
        ) : (
          <div className="terminal-panel-empty">No terminal sessions. Click + to open one.</div>
        )}
      </div>
      {contextMenu && (
        <TerminalTabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tab={contextMenu.tab}
          onRename={onRenameTab}
          onSetColor={onSetTabColor}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
