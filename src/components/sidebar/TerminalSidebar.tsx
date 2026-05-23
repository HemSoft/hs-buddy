import { useCallback, useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  Palette,
  Edit3,
  GripVertical,
  TerminalSquare,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
} from 'lucide-react'
import { useTerminalWorkspace } from '../../hooks/useTerminalWorkspace'
import { useToggleSet } from '../../hooks/useToggleSet'
import { onKeyboardActivate } from '../../utils/keyboard'
import './TerminalSidebar.css'

interface TerminalSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

const NODE_COLORS = [
  '#4ec9b0',
  '#569cd6',
  '#ce9178',
  '#dcdcaa',
  '#c586c0',
  '#d7ba7d',
  '#9cdcfe',
  '#f14c4c',
  '#23d18b',
  '#3b8eea',
]

export function TerminalSidebar({ onItemSelect, selectedItem }: TerminalSidebarProps) {
  const {
    nodes,
    activeNodeId,
    loaded,
    addNode,
    renameNode,
    recolorNode,
    removeNode,
    reorderNode,
    selectNode,
  } = useTerminalWorkspace()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string
    x: number
    y: number
  } | null>(null)
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)
  const dragNodeRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Folders = nodes with no parent; terminals = nodes with a parent
  const folders = nodes.filter(n => n.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder)
  const getChildren = useCallback(
    (folderId: string) =>
      nodes.filter(n => n.parentId === folderId).sort((a, b) => a.sortOrder - b.sortOrder),
    [nodes]
  )

  const {
    has: isFolderExpanded,
    toggle: toggleFolder,
    add: expandFolder,
  } = useToggleSet(folders.map(f => f.id))

  const handleSelectTerminal = useCallback(
    (nodeId: string) => {
      selectNode(nodeId)
      onItemSelect('terminal-workspace')
    },
    [selectNode, onItemSelect]
  )

  const handleAddFolder = useCallback(() => {
    const folderCount = folders.length
    const node = addNode(`Project ${folderCount + 1}`)
    expandFolder(node.id)
    selectNode(node.id)
    onItemSelect('terminal-workspace')
  }, [folders.length, addNode, expandFolder, selectNode, onItemSelect])

  const handleAddTerminal = useCallback(
    (folderId: string) => {
      const children = getChildren(folderId)
      const newNode = addNode(`Terminal ${children.length + 1}`, { parentId: folderId })
      selectNode(newNode.id)
      onItemSelect('terminal-workspace')
    },
    [getChildren, addNode, selectNode, onItemSelect]
  )

  const startEditing = useCallback((nodeId: string, currentName: string) => {
    setEditingId(nodeId)
    setEditValue(currentName)
    setContextMenu(null)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [])

  const commitEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      renameNode(editingId, editValue.trim())
    }
    setEditingId(null)
  }, [editingId, editValue, renameNode])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') commitEdit()
      else if (e.key === 'Escape') setEditingId(null)
    },
    [commitEdit]
  )

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault()
    setContextMenu({ nodeId, x: e.clientX, y: e.clientY })
    setShowColorPicker(null)
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    dragNodeRef.current = nodeId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', nodeId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetNodeId: string) => {
      e.preventDefault()
      const sourceId = dragNodeRef.current
      if (!sourceId || sourceId === targetNodeId) return
      dragNodeRef.current = null
      const targetNode = nodes.find(n => n.id === targetNodeId)
      /* v8 ignore next */
      if (targetNode) reorderNode(sourceId, targetNode.sortOrder - 0.5)
    },
    [nodes, reorderNode]
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
    setShowColorPicker(null)
  }, [])

  if (!loaded) {
    return (
      <div className="terminal-sidebar">
        <div className="terminal-sidebar-header">
          <span className="terminal-sidebar-title">Projects</span>
        </div>
        <div className="terminal-sidebar-loading">Loading…</div>
      </div>
    )
  }

  return (
    <div className="terminal-sidebar" onClick={closeContextMenu} role="presentation">
      <div className="terminal-sidebar-header">
        <span className="terminal-sidebar-title">Projects</span>
        <button
          className="terminal-sidebar-add-btn"
          onClick={handleAddFolder}
          title="Add Project"
          aria-label="Add Project"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="terminal-sidebar-list">
        {folders.map(folder => {
          const children = getChildren(folder.id)
          const expanded = isFolderExpanded(folder.id)
          /* v8 ignore next */
          const folderSelected = activeNodeId === folder.id && selectedItem === 'terminal-workspace'
          /* v8 ignore next */
          const folderClassName = `terminal-sidebar-folder-row ${folderSelected ? 'selected' : ''}`

          return (
            <div key={folder.id} className="terminal-sidebar-folder">
              {/* Folder row — clicking selects this as active terminal */}
              <div
                className={folderClassName}
                style={
                  folder.color
                    ? { backgroundColor: `${folder.color}22`, borderLeftColor: folder.color }
                    : undefined
                }
                onClick={() => handleSelectTerminal(folder.id)}
                onDoubleClick={() => startEditing(folder.id, folder.name)}
                onContextMenu={e => handleContextMenu(e, folder.id)}
                role="button"
                tabIndex={0}
                onKeyDown={onKeyboardActivate(() => handleSelectTerminal(folder.id))}
                aria-label={`Project: ${folder.name}`}
                aria-expanded={expanded}
              >
                <button
                  type="button"
                  className="terminal-sidebar-chevron"
                  onClick={e => {
                    e.stopPropagation()
                    toggleFolder(folder.id)
                  }}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {expanded ? (
                  <FolderOpen size={14} className="terminal-sidebar-folder-icon" />
                ) : (
                  <Folder size={14} className="terminal-sidebar-folder-icon" />
                )}
                {editingId === folder.id ? (
                  <input
                    ref={inputRef}
                    className="terminal-sidebar-input"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={handleKeyDown}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="terminal-sidebar-label">{folder.name}</span>
                )}
                <button
                  className="terminal-sidebar-folder-add"
                  onClick={e => {
                    e.stopPropagation()
                    handleAddTerminal(folder.id)
                  }}
                  title="Add Terminal"
                  aria-label="Add Terminal"
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* Terminal children */}
              {expanded && (
                <div className="terminal-sidebar-children">
                  {children.map(child => (
                    <div
                      key={child.id}
                      className={`terminal-sidebar-node ${activeNodeId === child.id && selectedItem === 'terminal-workspace' ? 'selected' : ''}`}
                      onClick={() => handleSelectTerminal(child.id)}
                      onDoubleClick={() => startEditing(child.id, child.name)}
                      onContextMenu={e => handleContextMenu(e, child.id)}
                      draggable
                      onDragStart={e => handleDragStart(e, child.id)}
                      onDragOver={handleDragOver}
                      onDrop={e => handleDrop(e, child.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={onKeyboardActivate(() => handleSelectTerminal(child.id))}
                      aria-label={`Terminal: ${child.name}`}
                    >
                      <GripVertical size={12} className="terminal-sidebar-grip" />
                      <TerminalSquare size={14} className="terminal-sidebar-icon" />
                      {editingId === child.id ? (
                        <input
                          ref={inputRef}
                          className="terminal-sidebar-input"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="terminal-sidebar-label">{child.name}</span>
                      )}
                    </div>
                  ))}
                  {children.length === 0 && (
                    <div className="terminal-sidebar-no-terminals">
                      <button
                        className="terminal-sidebar-empty-btn"
                        onClick={() => handleAddTerminal(folder.id)}
                      >
                        + Add Terminal
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {folders.length === 0 && (
          <div className="terminal-sidebar-empty">
            <button className="terminal-sidebar-empty-btn" onClick={handleAddFolder}>
              + New Project
            </button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="terminal-sidebar-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          role="menu"
          tabIndex={-1}
        >
          <button
            className="terminal-sidebar-context-item"
            onClick={() => {
              const node = nodes.find(n => n.id === contextMenu.nodeId)
              /* v8 ignore next */
              if (node) startEditing(node.id, node.name)
            }}
          >
            <Edit3 size={12} /> Rename
          </button>
          <button
            className="terminal-sidebar-context-item"
            onClick={() => setShowColorPicker(contextMenu.nodeId)}
          >
            <Palette size={12} /> Change Color
          </button>
          <div className="terminal-sidebar-context-divider" />
          <button
            className="terminal-sidebar-context-item terminal-sidebar-context-danger"
            onClick={() => {
              removeNode(contextMenu.nodeId)
              closeContextMenu()
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}

      {/* Color Picker */}
      {showColorPicker && contextMenu && (
        <div
          className="terminal-sidebar-color-picker"
          style={{ top: contextMenu.y + 30, left: contextMenu.x }}
          role="group"
        >
          {NODE_COLORS.map(color => (
            <button
              key={color}
              className="terminal-sidebar-color-swatch"
              style={{ backgroundColor: color }}
              onClick={() => {
                recolorNode(showColorPicker, color)
                closeContextMenu()
              }}
              aria-label={`Color: ${color}`}
            />
          ))}
          <button
            className="terminal-sidebar-color-swatch terminal-sidebar-color-none"
            onClick={() => {
              recolorNode(showColorPicker, undefined)
              closeContextMenu()
            }}
            aria-label="Remove color"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
