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
import type { TerminalTreeNode } from '../terminal-workspace/types'
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

interface EditableNodeNameControls {
  editingId: string | null
  editValue: string
  inputRef: React.RefObject<HTMLInputElement | null>
  setEditValue: React.Dispatch<React.SetStateAction<string>>
  commitEdit: () => void
  handleKeyDown: (e: React.KeyboardEvent) => void
}

interface EditableNodeNameProps extends EditableNodeNameControls {
  node: TerminalTreeNode
}

function EditableNodeName({
  node,
  editingId,
  editValue,
  inputRef,
  setEditValue,
  commitEdit,
  handleKeyDown,
}: EditableNodeNameProps) {
  if (editingId !== node.id) return <span className="terminal-sidebar-label">{node.name}</span>

  return (
    <input
      aria-label="Rename terminal workspace item"
      ref={inputRef}
      className="terminal-sidebar-input"
      value={editValue}
      onChange={e => setEditValue(e.target.value)}
      onBlur={commitEdit}
      onKeyDown={handleKeyDown}
      onClick={e => e.stopPropagation()}
    />
  )
}

function folderRowStyle(folder: TerminalTreeNode) {
  return folder.color
    ? { backgroundColor: `${folder.color}22`, borderLeftColor: folder.color }
    : undefined
}

function selectedClass(base: string, selected: boolean): string {
  return selected ? `${base} selected` : base
}

function TerminalSidebarLoading() {
  return (
    <div className="terminal-sidebar">
      <div className="terminal-sidebar-header">
        <span className="terminal-sidebar-title">Projects</span>
      </div>
      <div className="terminal-sidebar-loading">Loading…</div>
    </div>
  )
}

function TerminalSidebarHeader({ onAddFolder }: { onAddFolder: () => void }) {
  return (
    <div className="terminal-sidebar-header">
      <span className="terminal-sidebar-title">Projects</span>
      <button
        type="button"
        className="terminal-sidebar-add-btn"
        onClick={onAddFolder}
        title="Add Project"
        aria-label="Add Project"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

interface TerminalFolderRowProps extends EditableNodeNameControls {
  folder: TerminalTreeNode
  expanded: boolean
  selected: boolean
  handleSelectTerminal: (nodeId: string) => void
  startEditing: (nodeId: string, currentName: string) => void
  handleContextMenu: (e: React.MouseEvent, nodeId: string) => void
  toggleFolder: (folderId: string) => boolean
  handleAddTerminal: (folderId: string) => void
}

function TerminalFolderRow({
  folder,
  expanded,
  selected,
  handleSelectTerminal,
  startEditing,
  handleContextMenu,
  toggleFolder,
  handleAddTerminal,
  ...editableProps
}: TerminalFolderRowProps) {
  const isEditing = editableProps.editingId === folder.id

  return (
    <div
      className={selectedClass('terminal-sidebar-folder-row', selected)}
      style={folderRowStyle(folder)}
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
      {isEditing ? (
        <EditableNodeName node={folder} {...editableProps} />
      ) : (
        <button
          type="button"
          className="terminal-sidebar-folder-main"
          onClick={() => handleSelectTerminal(folder.id)}
          onDoubleClick={() => startEditing(folder.id, folder.name)}
          onContextMenu={e => handleContextMenu(e, folder.id)}
          onKeyDown={onKeyboardActivate(() => handleSelectTerminal(folder.id))}
          aria-label={`Project: ${folder.name}`}
          aria-expanded={expanded}
        >
          <EditableNodeName node={folder} {...editableProps} />
        </button>
      )}
      <button
        type="button"
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
  )
}

interface TerminalNodeRowProps extends EditableNodeNameControls {
  child: TerminalTreeNode
  selected: boolean
  handleSelectTerminal: (nodeId: string) => void
  startEditing: (nodeId: string, currentName: string) => void
  handleContextMenu: (e: React.MouseEvent, nodeId: string) => void
  handleDragStart: (e: React.DragEvent, nodeId: string) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, targetNodeId: string) => void
}

function TerminalNodeRow({
  child,
  selected,
  handleSelectTerminal,
  startEditing,
  handleContextMenu,
  handleDragStart,
  handleDragOver,
  handleDrop,
  ...editableProps
}: TerminalNodeRowProps) {
  return (
    // react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- Terminal rows can contain an inline rename input while editing, which cannot live inside a native button.
    <div
      className={selectedClass('terminal-sidebar-node', selected)}
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
      <EditableNodeName node={child} {...editableProps} />
    </div>
  )
}

interface TerminalChildrenListProps extends EditableNodeNameControls {
  expanded: boolean
  terminalChildren: TerminalTreeNode[]
  activeNodeId: string | null
  selectedItem: string | null
  handleAddTerminal: (folderId: string) => void
  folderId: string
  handleSelectTerminal: (nodeId: string) => void
  startEditing: (nodeId: string, currentName: string) => void
  handleContextMenu: (e: React.MouseEvent, nodeId: string) => void
  handleDragStart: (e: React.DragEvent, nodeId: string) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, targetNodeId: string) => void
}

function TerminalChildrenList({
  expanded,
  terminalChildren,
  activeNodeId,
  selectedItem,
  handleAddTerminal,
  folderId,
  ...rowProps
}: TerminalChildrenListProps) {
  if (!expanded) return null

  return (
    <div className="terminal-sidebar-children">
      {terminalChildren.map(child => (
        <TerminalNodeRow
          child={child}
          selected={activeNodeId === child.id && selectedItem === 'terminal-workspace'}
          {...rowProps}
          key={child.id}
        />
      ))}
      {terminalChildren.length === 0 && (
        <div className="terminal-sidebar-no-terminals">
          <button
            type="button"
            className="terminal-sidebar-empty-btn"
            onClick={() => handleAddTerminal(folderId)}
          >
            + Add Terminal
          </button>
        </div>
      )}
    </div>
  )
}

interface TerminalFolderProps extends EditableNodeNameControls {
  folder: TerminalTreeNode
  terminalChildren: TerminalTreeNode[]
  expanded: boolean
  activeNodeId: string | null
  selectedItem: string | null
  handleSelectTerminal: (nodeId: string) => void
  startEditing: (nodeId: string, currentName: string) => void
  handleContextMenu: (e: React.MouseEvent, nodeId: string) => void
  toggleFolder: (folderId: string) => boolean
  handleAddTerminal: (folderId: string) => void
  handleDragStart: (e: React.DragEvent, nodeId: string) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, targetNodeId: string) => void
}

function TerminalFolder({
  folder,
  terminalChildren,
  expanded,
  activeNodeId,
  selectedItem,
  editingId,
  editValue,
  inputRef,
  setEditValue,
  commitEdit,
  handleKeyDown,
  handleSelectTerminal,
  startEditing,
  handleContextMenu,
  toggleFolder,
  handleAddTerminal,
  handleDragStart,
  handleDragOver,
  handleDrop,
}: TerminalFolderProps) {
  const editableProps = { editingId, editValue, inputRef, setEditValue, commitEdit, handleKeyDown }
  return (
    <div className="terminal-sidebar-folder">
      <TerminalFolderRow
        folder={folder}
        expanded={expanded}
        selected={activeNodeId === folder.id && selectedItem === 'terminal-workspace'}
        handleSelectTerminal={handleSelectTerminal}
        startEditing={startEditing}
        handleContextMenu={handleContextMenu}
        toggleFolder={toggleFolder}
        handleAddTerminal={handleAddTerminal}
        {...editableProps}
      />
      <TerminalChildrenList
        expanded={expanded}
        terminalChildren={terminalChildren}
        activeNodeId={activeNodeId}
        selectedItem={selectedItem}
        folderId={folder.id}
        handleSelectTerminal={handleSelectTerminal}
        startEditing={startEditing}
        handleContextMenu={handleContextMenu}
        handleAddTerminal={handleAddTerminal}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        {...editableProps}
      />
    </div>
  )
}

interface TerminalFolderListProps extends EditableNodeNameControls {
  folders: TerminalTreeNode[]
  activeNodeId: string | null
  selectedItem: string | null
  getChildren: (folderId: string) => TerminalTreeNode[]
  isFolderExpanded: (folderId: string) => boolean
  handleAddFolder: () => void
  handleSelectTerminal: (nodeId: string) => void
  startEditing: (nodeId: string, currentName: string) => void
  handleContextMenu: (e: React.MouseEvent, nodeId: string) => void
  toggleFolder: (folderId: string) => boolean
  handleAddTerminal: (folderId: string) => void
  handleDragStart: (e: React.DragEvent, nodeId: string) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, targetNodeId: string) => void
}

function TerminalFolderList({
  folders,
  activeNodeId,
  selectedItem,
  getChildren,
  isFolderExpanded,
  handleAddFolder,
  ...folderProps
}: TerminalFolderListProps) {
  return (
    <div className="terminal-sidebar-list">
      {folders.map(folder => (
        <TerminalFolder
          folder={folder}
          terminalChildren={getChildren(folder.id)}
          expanded={isFolderExpanded(folder.id)}
          activeNodeId={activeNodeId}
          selectedItem={selectedItem}
          {...folderProps}
          key={folder.id}
        />
      ))}

      {folders.length === 0 && (
        <div className="terminal-sidebar-empty">
          <button type="button" className="terminal-sidebar-empty-btn" onClick={handleAddFolder}>
            + New Project
          </button>
        </div>
      )}
    </div>
  )
}

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
    /* v8 ignore next -- focus selection timing is platform-dependent under coverage. */
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

  if (!loaded) return <TerminalSidebarLoading />

  return (
    <div className="terminal-sidebar" onClick={closeContextMenu} role="presentation">
      <TerminalSidebarHeader onAddFolder={handleAddFolder} />

      <TerminalFolderList
        folders={folders}
        activeNodeId={activeNodeId}
        selectedItem={selectedItem}
        getChildren={getChildren}
        isFolderExpanded={isFolderExpanded}
        handleAddFolder={handleAddFolder}
        editingId={editingId}
        editValue={editValue}
        inputRef={inputRef}
        setEditValue={setEditValue}
        commitEdit={commitEdit}
        handleKeyDown={handleKeyDown}
        handleSelectTerminal={handleSelectTerminal}
        startEditing={startEditing}
        handleContextMenu={handleContextMenu}
        toggleFolder={toggleFolder}
        handleAddTerminal={handleAddTerminal}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
      />

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
            type="button"
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
            type="button"
            className="terminal-sidebar-context-item"
            onClick={() => setShowColorPicker(contextMenu.nodeId)}
          >
            <Palette size={12} /> Change Color
          </button>
          <div className="terminal-sidebar-context-divider" />
          <button
            type="button"
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
        <fieldset
          className="terminal-sidebar-color-picker"
          style={{ top: contextMenu.y + 30, left: contextMenu.x }}
          aria-label="Terminal color"
        >
          {NODE_COLORS.map(color => (
            <button
              type="button"
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
            type="button"
            className="terminal-sidebar-color-swatch terminal-sidebar-color-none"
            onClick={() => {
              recolorNode(showColorPicker, undefined)
              closeContextMenu()
            }}
            aria-label="Remove color"
          >
            ✕
          </button>
        </fieldset>
      )}
    </div>
  )
}
