import { LayoutGrid, List } from 'lucide-react'
import type { ViewMode } from '../../hooks/useViewMode'
import './ViewModeToggle.css'

interface ViewModeToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="view-mode-toggle">
      <button
        className={`view-mode-btn${mode === 'card' ? ' active' : ''}`}
        onClick={() => onChange('card')}
        title="Card view"
      >
        <LayoutGrid size={14} />
      </button>
      <button
        className={`view-mode-btn${mode === 'list' ? ' active' : ''}`}
        onClick={() => onChange('list')}
        title="List view"
      >
        <List size={14} />
      </button>
    </div>
  )
}
