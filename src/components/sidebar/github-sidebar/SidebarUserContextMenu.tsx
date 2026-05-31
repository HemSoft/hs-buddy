import { ExternalLink, RefreshCw, Star } from 'lucide-react'

interface SidebarUserContextMenuProps {
  displayName: string
  org: string
  x: number
  y: number
  isFavorite: boolean
  onOpenProfile: () => void
  onRefresh: () => void
  onToggleFavorite: () => void
  onClose: () => void
}

export function SidebarUserContextMenu({
  displayName,
  x,
  y,
  isFavorite,
  onOpenProfile,
  onRefresh,
  onToggleFavorite,
  onClose,
}: SidebarUserContextMenuProps) {
  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="context-menu" style={{ top: y, left: x }}>
        <button type="button" onClick={onOpenProfile}>
          <ExternalLink size={14} />
          Open Profile
        </button>
        <button type="button" onClick={onRefresh}>
          <RefreshCw size={14} />
          Refresh
        </button>
        <button type="button" onClick={onToggleFavorite}>
          <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          {isFavorite ? `Unfavorite ${displayName}` : `Favorite ${displayName}`}
        </button>
      </div>
    </>
  )
}
