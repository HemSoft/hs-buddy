import { X } from 'lucide-react'
import './TabBar.css'

export interface Tab {
  id: string
  label: string
  viewId: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose }: TabBarProps) {
  if (tabs.length === 0) {
    return null
  }

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    onTabClose(tabId)
  }

  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => onTabSelect(tab.id)}
          >
            <span className="tab-label">{tab.label}</span>
            <button
              className="tab-close"
              onClick={(e) => handleClose(e, tab.id)}
              aria-label={`Close ${tab.label}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
