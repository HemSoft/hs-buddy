import { useState } from 'react'
import { ChevronDown, ChevronRight, GitPullRequest, Zap, CheckSquare, Info } from 'lucide-react'
import './TreeView.css'

interface TreeItem {
  id: string
  label: string
  icon?: React.ReactNode
  children?: TreeItem[]
}

const defaultTreeData: TreeItem[] = [
  {
    id: 'pull-requests',
    label: 'Pull Requests',
    icon: <GitPullRequest size={16} />,
    children: [
      { id: 'pr-my-prs', label: 'My PRs' },
      { id: 'pr-needs-review', label: 'Needs Review' },
      { id: 'pr-recently-merged', label: 'Recently Merged' },
    ]
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: <Zap size={16} />,
    children: [
      { id: 'skills-browser', label: 'Browse Skills' },
      { id: 'skills-recent', label: 'Recently Used' },
      { id: 'skills-favorites', label: 'Favorites' },
    ]
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: <CheckSquare size={16} />,
    children: [
      { id: 'tasks-today', label: 'Today' },
      { id: 'tasks-upcoming', label: 'Upcoming' },
      { id: 'tasks-projects', label: 'Projects' },
    ]
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: <Info size={16} />,
    children: [
      { id: 'insights-productivity', label: 'Productivity' },
      { id: 'insights-activity', label: 'Activity' },
    ]
  }
]

export function TreeView() {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    new Set(['pull-requests', 'skills', 'tasks'])
  )
  const [selectedItem, setSelectedItem] = useState<string | null>('pr-my-prs')

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleItemClick = (item: TreeItem) => {
    if (item.children && item.children.length > 0) {
      toggleExpand(item.id)
    } else {
      setSelectedItem(item.id)
    }
  }

  const renderTreeItem = (item: TreeItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems.has(item.id)
    const isSelected = selectedItem === item.id

    return (
      <div key={item.id} className="tree-item-container">
        <div
          className={`tree-item ${isSelected ? 'selected' : ''} ${hasChildren ? 'has-children' : ''}`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => handleItemClick(item)}
        >
          {hasChildren && (
            <span className="chevron">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          )}
          {!hasChildren && <span className="chevron-spacer" />}
          {item.icon && <span className="item-icon">{item.icon}</span>}
          <span className="item-label">{item.label}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {item.children!.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="tree-view">
      {defaultTreeData.map(item => renderTreeItem(item))}
    </div>
  )
}
