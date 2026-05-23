import { useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Palette, FolderOpen, X } from 'lucide-react'
import type { TerminalTab } from '../../hooks/useTerminalPanel'
import './TerminalTabContextMenu.css'

const TAB_COLORS = [
  { name: 'Red', value: '#e74856' },
  { name: 'Orange', value: '#f7a72e' },
  { name: 'Yellow', value: '#f9f1a5' },
  { name: 'Green', value: '#16c60c' },
  { name: 'Teal', value: '#61d6d6' },
  { name: 'Blue', value: '#3b78ff' },
  { name: 'Purple', value: '#b4009e' },
  { name: 'Pink', value: '#ff69b4' },
  { name: 'White', value: '#cccccc' },
]

interface ColorSwatchGridProps {
  tabId: string
  activeColor: string | undefined
  onSetColor: (tabId: string, color: string | undefined) => void
  onClose: () => void
}

function ColorSwatchGrid({ tabId, activeColor, onSetColor, onClose }: ColorSwatchGridProps) {
  return (
    <div className="terminal-ctx-colors">
      {TAB_COLORS.map(c => (
        <button
          key={c.value}
          className={`terminal-ctx-color-swatch ${activeColor === c.value ? 'active' : ''}`}
          style={{ backgroundColor: c.value }}
          title={c.name}
          onClick={() => {
            onSetColor(tabId, c.value)
            onClose()
          }}
        />
      ))}
      {activeColor && (
        <button
          className="terminal-ctx-color-reset"
          title="Reset color"
          onClick={() => {
            onSetColor(tabId, undefined)
            onClose()
          }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}

interface TerminalTabContextMenuProps {
  x: number
  y: number
  tab: TerminalTab
  onRename: (tabId: string, title: string) => void
  onSetColor: (tabId: string, color: string | undefined) => void
  onOpenFolderView: (cwd: string) => void
  onClose: () => void
}

interface RenameInputProps {
  tab: { id: string; title: string }
  onRename: (tabId: string, name: string) => void
  onClose: () => void
}

function RenameInput({ tab, onRename, onClose }: RenameInputProps) {
  const [renameValue, setRenameValue] = useState(tab.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== tab.title) {
      onRename(tab.id, trimmed)
    }
    onClose()
  }, [renameValue, tab, onRename, onClose])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleRenameSubmit()
      if (e.key === 'Escape') onClose()
    },
    [handleRenameSubmit, onClose]
  )

  return (
    <div className="terminal-ctx-rename">
      <input
        ref={inputRef}
        className="terminal-ctx-rename-input"
        value={renameValue}
        onChange={e => setRenameValue(e.target.value)}
        onKeyDown={handleRenameKeyDown}
        onBlur={handleRenameSubmit}
        maxLength={40}
      />
    </div>
  )
}

export function TerminalTabContextMenu({
  x,
  y,
  tab,
  onRename,
  onSetColor,
  onOpenFolderView,
  onClose,
}: TerminalTabContextMenuProps) {
  const [mode, setMode] = useState<'menu' | 'rename'>('menu')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <>
      <div className="terminal-ctx-overlay" onClick={onClose} aria-hidden="true" />
      <div className="terminal-ctx-menu" style={{ top: y, left: x }} ref={menuRef}>
        {mode === 'menu' ? (
          <>
            <button className="terminal-ctx-item" onClick={() => setMode('rename')}>
              <Pencil size={14} />
              Rename
            </button>
            {tab.cwd && (
              <button
                className="terminal-ctx-item"
                onClick={() => {
                  onOpenFolderView(tab.cwd)
                  onClose()
                }}
              >
                <FolderOpen size={14} />
                Folder View
              </button>
            )}
            <div className="terminal-ctx-separator" />
            <div className="terminal-ctx-label">
              <Palette size={12} />
              Color
            </div>
            <ColorSwatchGrid
              tabId={tab.id}
              activeColor={tab.color}
              onSetColor={onSetColor}
              onClose={onClose}
            />
          </>
        ) : (
          <RenameInput tab={tab} onRename={onRename} onClose={onClose} />
        )}
      </div>
    </>
  )
}
