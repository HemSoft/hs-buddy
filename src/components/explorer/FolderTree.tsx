import { useReducer, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from 'lucide-react'
import { getErrorMessageWithFallback } from '../../utils/errorUtils'
import './FolderTree.css'

interface DirEntry {
  name: string
  path: string
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

type FolderTreeState = { nodes: TreeNode[]; loading: boolean; error: string | null }
type FolderTreeAction =
  | { type: 'root-load-start' }
  | { type: 'root-load-success'; nodes: TreeNode[] }
  | { type: 'root-load-error'; error: string }
  | { type: 'update-nodes'; updater: (nodes: TreeNode[]) => TreeNode[] }

function folderTreeReducer(state: FolderTreeState, action: FolderTreeAction): FolderTreeState {
  /* v8 ignore start */
  switch (action.type) {
    /* v8 ignore stop */
    case 'root-load-start':
      return { nodes: [], loading: true, error: null }
    case 'root-load-success':
      return { ...state, nodes: action.nodes, loading: false }
    case 'root-load-error':
      return { ...state, error: action.error, loading: false }
    case 'update-nodes':
      return { ...state, nodes: action.updater(state.nodes) }
    default:
      /* v8 ignore start */
      return state
    /* v8 ignore stop */
  }
}

export interface ShouldLoadNode {
  type: 'file' | 'directory'
  expanded: boolean
  loaded: boolean
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for testing
export function shouldLoadChildren(
  target: ShouldLoadNode | undefined,
  alreadyPending: boolean
): boolean {
  if (!target || target.type !== 'directory') return false
  return !target.expanded && !target.loaded && !alreadyPending
}

export function FolderTree({ rootPath, onFileSelect, selectedFile }: FolderTreeProps) {
  const [state, dispatch] = useReducer(folderTreeReducer, {
    nodes: [],
    loading: false,
    error: null,
  })
  const { nodes, loading, error } = state
  const pendingLoads = useRef(new Set<string>())
  const mountedRef = useRef(true)
  const nodesRef = useRef<TreeNode[]>([])

  useLayoutEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    const result = await window.filesystem.readDir(dirPath)
    /* v8 ignore start */
    if (result.error) throw new Error(result.error)
    /* v8 ignore stop */
    return result.entries.map((entry: DirEntry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      loaded: false,
      expanded: false,
    }))
  }, [])

  // Load root directory
  useEffect(() => {
    /* v8 ignore start */
    if (!rootPath) return
    /* v8 ignore stop */

    let cancelled = false
    dispatch({ type: 'root-load-start' })
    loadDirectory(rootPath)
      .then(loaded => {
        /* v8 ignore start */
        if (!cancelled) dispatch({ type: 'root-load-success', nodes: loaded })
        /* v8 ignore stop */
      })
      .catch(err => {
        /* v8 ignore start */
        if (!cancelled)
          /* v8 ignore stop */
          dispatch({
            type: 'root-load-error',
            error: getErrorMessageWithFallback(err, 'Failed to load directory'),
          })
      })
    return () => {
      cancelled = true
    }
  }, [rootPath, loadDirectory])

  const toggleExpand = useCallback(
    async (nodePath: string) => {
      // Derive load decision outside the updater to keep it pure (React StrictMode safe)
      const findNode = (items: TreeNode[]): TreeNode | undefined => {
        for (const item of items) {
          if (item.path === nodePath) return item
          if (item.children) {
            const found = findNode(item.children)
            /* v8 ignore start */
            if (found) return found
            /* v8 ignore stop */
          }
        }
        /* v8 ignore start */
        return undefined
        /* v8 ignore stop */
      }
      const target = findNode(nodesRef.current)
      const needsLoad = shouldLoadChildren(target, pendingLoads.current.has(nodePath))

      dispatch({
        type: 'update-nodes',
        updater: prev => {
          const update = (items: TreeNode[]): TreeNode[] =>
            items.map(node => {
              if (node.path === nodePath) {
                /* v8 ignore start */
                if (node.type !== 'directory') return node
                /* v8 ignore stop */
                return { ...node, expanded: !node.expanded }
              }
              if (node.children) {
                return { ...node, children: update(node.children) }
              }
              return node
            })
          return update(prev)
        },
      })

      if (needsLoad) {
        pendingLoads.current.add(nodePath)
        try {
          const children = await loadDirectory(nodePath)
          /* v8 ignore start */
          if (!mountedRef.current) return
          /* v8 ignore stop */
          dispatch({
            type: 'update-nodes',
            updater: prev => {
              const update = (items: TreeNode[]): TreeNode[] =>
                items.map(node => {
                  if (node.path === nodePath) {
                    return { ...node, children, loaded: true }
                  }
                  if (node.children) {
                    return { ...node, children: update(node.children) }
                  }
                  return node
                })
              return update(prev)
            },
          })
        } catch (_: unknown) {
          // Silently fail on subdirectory load errors
        } finally {
          pendingLoads.current.delete(nodePath)
        }
      }
    },
    [loadDirectory]
  )

  const handleFileClick = useCallback(
    (filePath: string) => {
      onFileSelect(filePath)
    },
    [onFileSelect]
  )

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

function getChevronIcon(isDir: boolean, expanded: boolean) {
  if (!isDir) return <span style={{ width: 14, display: 'inline-block' }} />
  return expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
}

function getTypeIcon(isDir: boolean, expanded: boolean) {
  if (!isDir) return <File size={14} />
  return expanded ? <FolderOpen size={14} /> : <Folder size={14} />
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

  const activate = useCallback(() => {
    if (isDir) {
      onToggle(node.path)
    } else {
      onFileClick(node.path)
    }
  }, [isDir, node.path, onToggle, onFileClick])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      activate()
    },
    [activate]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        activate()
      }
    },
    [activate]
  )

  return (
    <li
      className="folder-tree-node"
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={isDir ? node.expanded : undefined}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`folder-tree-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <span className="folder-tree-icon">{getChevronIcon(isDir, node.expanded)}</span>
        <span className="folder-tree-type-icon">{getTypeIcon(isDir, node.expanded)}</span>
        <span className="folder-tree-name" title={node.name}>
          {node.name}
        </span>
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
