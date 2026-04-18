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

interface TerminalTabContextMenuProps {
  x: number
  y: number
  tab: TerminalTab
  onRename: (tabId: string, title: string) => void
  onSetColor: (tabId: string, color: string | undefined) => void
  onOpenFolderView: (cwd: string) => void
  onClose: () => void
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
  const [renameValue, setRenameValue] = useState(tab.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'rename') inputRef.current?.select()
  }, [mode])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

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
            <div className="terminal-ctx-colors">
              {TAB_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`terminal-ctx-color-swatch ${tab.color === c.value ? 'active' : ''}`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  onClick={() => {
                    onSetColor(tab.id, c.value)
                    onClose()
                  }}
                />
              ))}
              {tab.color && (
                <button
                  className="terminal-ctx-color-reset"
                  title="Reset color"
                  onClick={() => {
                    onSetColor(tab.id, undefined)
                    onClose()
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </>
        ) : (
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
        )}
      </div>
    </>
  )
}
