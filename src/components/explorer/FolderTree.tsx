import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from 'lucide-react'
import './FolderTree.css'

interface DirEntry {
  name: string
  type: 'file' | 'directory'
  size: number
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  children?: TreeNode[]
  loaded: boolean
  expanded: boolean
}

interface FolderTreeProps {
  rootPath: string
  onFileSelect: (filePath: string) => void
  selectedFile?: string
}

export function FolderTree({ rootPath, onFileSelect, selectedFile }: FolderTreeProps) {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevRootRef = useRef(rootPath)

  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    const result = await window.filesystem.readDir(dirPath)
    if (result.error) throw new Error(result.error)
    return result.entries.map((entry: DirEntry) => ({
      name: entry.name,
      path: `${dirPath}\\${entry.name}`,
      type: entry.type,
      size: entry.size,
      loaded: false,
      expanded: false,
    }))
  }, [])

  // Load root directory
  useEffect(() => {
    if (!rootPath) return
    // Avoid reloading if root hasn't changed
    if (prevRootRef.current === rootPath && nodes.length > 0) return
    prevRootRef.current = rootPath

    let cancelled = false
    setLoading(true)
    setError(null)
    loadDirectory(rootPath)
      .then(loaded => {
        if (!cancelled) setNodes(loaded)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load directory')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [rootPath, loadDirectory, nodes.length])

  const toggleExpand = useCallback(async (nodePath: string) => {
    setNodes(prev => {
      const update = (items: TreeNode[]): TreeNode[] =>
        items.map(node => {
          if (node.path === nodePath) {
            if (node.type !== 'directory') return node
            return { ...node, expanded: !node.expanded }
          }
          if (node.children) {
            return { ...node, children: update(node.children) }
          }
          return node
        })
      return update(prev)
    })

    // Load children if not yet loaded
    setNodes(prev => {
      const find = (items: TreeNode[]): TreeNode | undefined => {
        for (const item of items) {
          if (item.path === nodePath) return item
          if (item.children) {
            const found = find(item.children)
            if (found) return found
          }
        }
        return undefined
      }
      const node = find(prev)
      if (!node || node.loaded || node.type !== 'directory') return prev
      return prev // Return as-is, load async below
    })

    // Check if we need to load
    const findNode = (items: TreeNode[]): TreeNode | undefined => {
      for (const item of items) {
        if (item.path === nodePath) return item
        if (item.children) {
          const found = findNode(item.children)
          if (found) return found
        }
      }
      return undefined
    }

    const targetNode = findNode(nodes)
    if (targetNode && !targetNode.loaded && targetNode.type === 'directory') {
      try {
        const children = await loadDirectory(nodePath)
        setNodes(prev => {
          const update = (items: TreeNode[]): TreeNode[] =>
            items.map(node => {
              if (node.path === nodePath) {
                return { ...node, children, loaded: true, expanded: true }
              }
              if (node.children) {
                return { ...node, children: update(node.children) }
              }
              return node
            })
          return update(prev)
        })
      } catch {
        // Silently fail on subdirectory load errors
      }
    }
  }, [nodes, loadDirectory])

  const handleFileClick = useCallback((filePath: string) => {
    onFileSelect(filePath)
  }, [onFileSelect])

  if (loading && nodes.length === 0) {
    return <div className="folder-tree-loading">Loading…</div>
  }

  if (error) {
    return <div className="folder-tree-error">{error}</div>
  }

  return (
    <div className="folder-tree">
      <TreeNodeList
        nodes={nodes}
        depth={0}
        onToggle={toggleExpand}
        onFileClick={handleFileClick}
        selectedFile={selectedFile}
      />
    </div>
  )
}

function TreeNodeList({
  nodes,
  depth,
  onToggle,
  onFileClick,
  selectedFile,
}: {
  nodes: TreeNode[]
  depth: number
  onToggle: (path: string) => void
  onFileClick: (path: string) => void
  selectedFile?: string
}) {
  return (
    <ul className="folder-tree-list" role="tree">
      {nodes.map(node => (
        <TreeNodeItem
          key={node.path}
          node={node}
          depth={depth}
          onToggle={onToggle}
          onFileClick={onFileClick}
          selectedFile={selectedFile}
        />
      ))}
    </ul>
  )
}

function TreeNodeItem({
  node,
  depth,
  onToggle,
  onFileClick,
  selectedFile,
}: {
  node: TreeNode
  depth: number
  onToggle: (path: string) => void
  onFileClick: (path: string) => void
  selectedFile?: string
}) {
  const isDir = node.type === 'directory'
  const isSelected = selectedFile === node.path

  const handleClick = useCallback(() => {
    if (isDir) {
      onToggle(node.path)
    } else {
      onFileClick(node.path)
    }
  }, [isDir, node.path, onToggle, onFileClick])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }, [handleClick])

  return (
    <li className="folder-tree-node" role="treeitem" aria-expanded={isDir ? node.expanded : undefined}>
      <div
        className={`folder-tree-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
      >
        <span className="folder-tree-icon">
          {isDir ? (
            node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span style={{ width: 14, display: 'inline-block' }} />
          )}
        </span>
        <span className="folder-tree-type-icon">
          {isDir ? (
            node.expanded ? <FolderOpen size={14} /> : <Folder size={14} />
          ) : (
            <File size={14} />
          )}
        </span>
        <span className="folder-tree-name" title={node.name}>{node.name}</span>
      </div>
      {isDir && node.expanded && node.children && (
        <TreeNodeList
          nodes={node.children}
          depth={depth + 1}
          onToggle={onToggle}
          onFileClick={onFileClick}
          selectedFile={selectedFile}
        />
      )}
    </li>
  )
}
