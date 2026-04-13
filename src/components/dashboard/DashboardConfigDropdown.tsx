import { useState, useRef, useEffect } from 'react'
import { Settings, Eye, EyeOff } from 'lucide-react'
import type { DashboardCardDef } from '../../hooks/useDashboardCards'
import './DashboardConfigDropdown.css'

interface DashboardConfigDropdownProps {
  cards: DashboardCardDef[]
  isVisible: (cardId: string) => boolean
  toggleCard: (cardId: string) => void
}

export function DashboardConfigDropdown({
  cards,
  isVisible,
  toggleCard,
}: DashboardConfigDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div className="dashboard-config" ref={containerRef}>
      <button
        type="button"
        className="dashboard-config-trigger"
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Configure dashboard cards"
      >
        <Settings size={14} />
        <span>Customize</span>
      </button>

      {open && (
        <div className="dashboard-config-menu" role="menu">
          <div className="dashboard-config-header">Dashboard Cards</div>
          {cards.map(card => {
            const visible = isVisible(card.id)
            return (
              <button
                key={card.id}
                type="button"
                className="dashboard-config-item"
                role="menuitemcheckbox"
                aria-checked={visible}
                onClick={() => toggleCard(card.id)}
              >
                {visible ? (
                  <Eye size={14} className="dashboard-config-icon-on" />
                ) : (
                  <EyeOff size={14} className="dashboard-config-icon-off" />
                )}
                <span>{card.title}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
