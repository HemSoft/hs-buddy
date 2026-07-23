/* eslint-disable react-refresh/only-export-components */
import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  type TerminalTreeNode,
  type TerminalLayout,
  type TerminalWorkspaceData,
  createTreeNode,
  splitPane,
  removePane,
  updatePaneCwd,
  collectPaneIds,
} from '../components/terminal-workspace/types'
import { killTerminalSession } from '../components/terminal/terminalSessions'

const SAVE_DEBOUNCE_MS = 600

interface UseTerminalWorkspaceReturn {
  nodes: TerminalTreeNode[]
  activeNodeId: string | null
  activeNode: TerminalTreeNode | null
  loaded: boolean

  // Tree operations
  addNode: (name: string, opts?: { color?: string; parentId?: string | null }) => TerminalTreeNode
  renameNode: (nodeId: string, name: string) => void
  recolorNode: (nodeId: string, color: string | undefined) => void
  removeNode: (nodeId: string) => void
  reorderNode: (nodeId: string, newSortOrder: number) => void
  selectNode: (nodeId: string) => void

  // Layout operations
  splitPaneInNode: (nodeId: string, paneId: string, direction: 'horizontal' | 'vertical') => void
  closePaneInNode: (nodeId: string, paneId: string) => void
  updatePaneCwdInNode: (nodeId: string, paneId: string, cwd: string) => void
  updateLayoutSizes: (nodeId: string, layout: TerminalLayout) => void
  movePaneToNode: (sourcePaneId: string, sourceNodeId: string, targetNodeId: string) => void
}

interface PersistedTerminalWorkspace {
  nodes: Array<{
    id: string
    name: string
    color?: string | null
    parentId?: string | null
    sortOrder: number
    layout: unknown
  }>
  activeNodeId?: string | null
}

const TerminalWorkspaceContext = createContext<UseTerminalWorkspaceReturn | null>(null)

function collectNodeAndDescendantIds(nodes: TerminalTreeNode[], nodeId: string): Set<string> {
  const idsToRemove = new Set<string>([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (shouldCollectDescendantNode(node, idsToRemove)) {
        idsToRemove.add(node.id)
        changed = true
      }
    }
  }
  return idsToRemove
}

function shouldCollectDescendantNode(node: TerminalTreeNode, idsToRemove: Set<string>): boolean {
  if (!node.parentId) return false
  if (!idsToRemove.has(node.parentId)) return false
  return !idsToRemove.has(node.id)
}

function killSessionsForNodes(nodes: TerminalTreeNode[], nodeIds: Set<string>) {
  for (const node of nodes) {
    if (!nodeIds.has(node.id)) continue
    for (const paneId of collectPaneIds(node.layout)) {
      killTerminalSession(paneId)
    }
  }
}

function resolveNextActiveNodeId(
  currentActiveNodeId: string | null,
  removedNodeIds: Set<string>,
  remainingNodes: TerminalTreeNode[]
): string | null {
  if (currentActiveNodeId && removedNodeIds.has(currentActiveNodeId)) {
    return remainingNodes[0]?.id ?? null
  }
  return currentActiveNodeId
}

function restoreTerminalWorkspace(
  workspace: PersistedTerminalWorkspace | null | undefined,
  restoredRef: MutableRefObject<boolean>,
  nodesRef: MutableRefObject<TerminalTreeNode[]>,
  activeNodeIdRef: MutableRefObject<string | null>,
  setNodes: Dispatch<SetStateAction<TerminalTreeNode[]>>,
  setActiveNodeId: Dispatch<SetStateAction<string | null>>,
  setLoaded: Dispatch<SetStateAction<boolean>>
) {
  if (restoredRef.current) return
  if (workspace === undefined) {
    return scheduleWorkspaceFallback(restoredRef, setLoaded)
  }

  restoredRef.current = true
  applyRestoredWorkspace(workspace, nodesRef, activeNodeIdRef, setNodes, setActiveNodeId)
  setLoaded(true)
}

function scheduleWorkspaceFallback(
  restoredRef: MutableRefObject<boolean>,
  setLoaded: Dispatch<SetStateAction<boolean>>
) {
  const timeout = setTimeout(() => {
    if (!restoredRef.current) {
      restoredRef.current = true
      setLoaded(true)
    }
  }, 2000)
  return () => clearTimeout(timeout)
}

function applyRestoredWorkspace(
  workspace: PersistedTerminalWorkspace | null,
  nodesRef: MutableRefObject<TerminalTreeNode[]>,
  activeNodeIdRef: MutableRefObject<string | null>,
  setNodes: Dispatch<SetStateAction<TerminalTreeNode[]>>,
  setActiveNodeId: Dispatch<SetStateAction<string | null>>
): void {
  if (!workspace) return

  const restored = workspace.nodes.map(toTerminalTreeNode)
  setNodes(restored)
  nodesRef.current = restored
  setActiveNodeId(workspace.activeNodeId ?? null)
  activeNodeIdRef.current = workspace.activeNodeId ?? null
}

function toTerminalTreeNode(node: PersistedTerminalWorkspace['nodes'][number]): TerminalTreeNode {
  return {
    id: node.id,
    name: node.name,
    color: node.color ?? undefined,
    parentId: node.parentId ?? null,
    sortOrder: node.sortOrder,
    layout: node.layout as TerminalLayout,
  }
}

export function TerminalWorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useTerminalWorkspaceInternal()
  return <TerminalWorkspaceContext value={value}>{children}</TerminalWorkspaceContext>
}

export function useTerminalWorkspace(): UseTerminalWorkspaceReturn {
  const ctx = use(TerminalWorkspaceContext)
  if (!ctx) {
    throw new Error('useTerminalWorkspace must be used within a TerminalWorkspaceProvider')
  }
  return ctx
}

function useTerminalWorkspaceInternal(): UseTerminalWorkspaceReturn {
  const [nodes, setNodes] = useState<TerminalTreeNode[]>([])
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const nodesRef = useRef(nodes)
  const activeNodeIdRef = useRef(activeNodeId)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    activeNodeIdRef.current = activeNodeId
  }, [activeNodeId])

  // Convex
  const workspace = useQuery(api.terminalWorkspaces.getWorkspace)
  const saveWorkspaceMutation = useMutation(api.terminalWorkspaces.saveWorkspace)

  const clearSaveTimeout = useCallback(() => {
    const timeout = saveTimeoutRef.current
    if (timeout) {
      clearTimeout(timeout)
      saveTimeoutRef.current = null
    }
  }, [])

  // Load from Convex on first fetch — with timeout fallback so UI isn't blocked
  // if Convex hasn't deployed the new functions yet.
  const restoredRef = useRef(false)
  useEffect(
    () =>
      restoreTerminalWorkspace(
        workspace,
        restoredRef,
        nodesRef,
        activeNodeIdRef,
        setNodes,
        setActiveNodeId,
        setLoaded
      ),
    [workspace]
  )

  // Debounced save to Convex
  const persistToConvex = useCallback(
    (data: TerminalWorkspaceData) => {
      clearSaveTimeout()
      saveTimeoutRef.current = setTimeout(() => {
        const payload = data.nodes.map(n => ({
          id: n.id,
          name: n.name,
          color: n.color,
          parentId: n.parentId ?? undefined,
          sortOrder: n.sortOrder,
          layout: n.layout,
        }))
        saveWorkspaceMutation({
          nodes: payload,
          activeNodeId: data.activeNodeId ?? undefined,
        }).catch(err => {
          console.warn('Failed to persist terminal workspace:', err)
        })
      }, SAVE_DEBOUNCE_MS)
    },
    [saveWorkspaceMutation, clearSaveTimeout]
  )

  // Cleanup timer on unmount
  useEffect(() => clearSaveTimeout, [clearSaveTimeout])

  /** Apply a nodes update, sync ref + state + persist. */
  const applyUpdate = useCallback(
    (
      transform: (prev: TerminalTreeNode[]) => TerminalTreeNode[],
      newActiveNodeId?: string | null
    ) => {
      setNodes(prev => {
        const next = transform(prev)
        nodesRef.current = next
        const hasNewActiveNodeId = newActiveNodeId !== undefined
        const activeId = hasNewActiveNodeId ? newActiveNodeId : activeNodeIdRef.current
        if (hasNewActiveNodeId) {
          setActiveNodeId(activeId)
          activeNodeIdRef.current = activeId
        }
        persistToConvex({ nodes: next, activeNodeId: activeId })
        return next
      })
    },
    [persistToConvex]
  )

  // ─── Tree Operations ─────────────────────────────────────────────────

  const addNode = useCallback(
    (name: string, opts?: { color?: string; parentId?: string | null }): TerminalTreeNode => {
      const node = createTreeNode(name, {
        color: opts?.color,
        parentId: opts?.parentId,
      })
      applyUpdate(prev => [...prev, node], node.id)
      return node
    },
    [applyUpdate]
  )

  const renameNode = useCallback(
    (nodeId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      applyUpdate(prev => prev.map(n => (n.id === nodeId ? { ...n, name: trimmed } : n)))
    },
    [applyUpdate]
  )

  const recolorNode = useCallback(
    (nodeId: string, color: string | undefined) => {
      applyUpdate(prev => prev.map(n => (n.id === nodeId ? { ...n, color } : n)))
    },
    [applyUpdate]
  )

  const removeNodeFn = useCallback(
    (nodeId: string) => {
      const nodesToRemove = collectNodeAndDescendantIds(nodesRef.current, nodeId)
      killSessionsForNodes(nodesRef.current, nodesToRemove)
      const remaining = nodesRef.current.filter(n => !nodesToRemove.has(n.id))
      const newActive = resolveNextActiveNodeId(activeNodeIdRef.current, nodesToRemove, remaining)

      applyUpdate(() => remaining, newActive)
    },
    [applyUpdate]
  )

  const reorderNode = useCallback(
    (nodeId: string, newSortOrder: number) => {
      applyUpdate(prev => prev.map(n => (n.id === nodeId ? { ...n, sortOrder: newSortOrder } : n)))
    },
    [applyUpdate]
  )

  const selectNode = useCallback(
    (nodeId: string) => {
      setActiveNodeId(nodeId)
      activeNodeIdRef.current = nodeId
      persistToConvex({ nodes: nodesRef.current, activeNodeId: nodeId })
    },
    [persistToConvex]
  )

  // ─── Layout Operations ───────────────────────────────────────────────

  const splitPaneInNode = useCallback(
    (nodeId: string, paneId: string, direction: 'horizontal' | 'vertical') => {
      applyUpdate(prev =>
        prev.map(n => {
          if (n.id !== nodeId) return n
          const newLayout = splitPane(n.layout, paneId, direction)
          /* v8 ignore next */
          return newLayout ? { ...n, layout: newLayout } : n
        })
      )
    },
    [applyUpdate]
  )

  const closePaneInNode = useCallback(
    (nodeId: string, paneId: string) => {
      killTerminalSession(paneId)
      applyUpdate(prev =>
        prev.map(n => {
          if (n.id !== nodeId) return n
          const newLayout = removePane(n.layout, paneId)
          // If layout becomes null, reset to a fresh pane
          /* v8 ignore next */
          return { ...n, layout: newLayout ?? { type: 'pane', id: paneId, cwd: '' } }
        })
      )
    },
    [applyUpdate]
  )

  const updatePaneCwdInNode = useCallback(
    (nodeId: string, paneId: string, cwd: string) => {
      applyUpdate(prev =>
        prev.map(n => {
          if (n.id !== nodeId) return n
          return { ...n, layout: updatePaneCwd(n.layout, paneId, cwd) }
        })
      )
    },
    [applyUpdate]
  )

  const updateLayoutSizes = useCallback(
    (nodeId: string, layout: TerminalLayout) => {
      applyUpdate(prev => prev.map(n => (n.id === nodeId ? { ...n, layout } : n)))
    },
    [applyUpdate]
  )

  const movePaneToNode = useCallback(
    (sourcePaneId: string, sourceNodeId: string, targetNodeId: string) => {
      if (sourceNodeId === targetNodeId) return

      // Find source pane's cwd before removing it
      const sourceNode = nodesRef.current.find(n => n.id === sourceNodeId)
      if (!sourceNode) return
      /* v8 ignore start */
      const findPaneCwd = (layout: TerminalLayout, id: string): string => {
        if (layout.type === 'pane') return layout.id === id ? layout.cwd : ''
        for (const child of layout.children) {
          const cwd = findPaneCwd(child, id)
          if (cwd) return cwd
        }
        return ''
      }
      /* v8 ignore stop */
      const paneCwd = findPaneCwd(sourceNode.layout, sourcePaneId)

      applyUpdate(prev =>
        prev.map(n => {
          if (n.id === sourceNodeId) {
            const newLayout = removePane(n.layout, sourcePaneId)
            return {
              ...n,
              layout: newLayout ?? { type: 'pane', id: `pane-${crypto.randomUUID()}`, cwd: '' },
            }
          }
          /* v8 ignore next */
          if (n.id === targetNodeId) {
            // Append as a vertical split to the existing layout
            const newPane = { type: 'pane' as const, id: sourcePaneId, cwd: paneCwd }
            const newLayout: TerminalLayout = {
              type: 'split',
              direction: 'vertical',
              children: [n.layout, newPane],
              sizes: [50, 50],
            }
            return { ...n, layout: newLayout }
          }
          /* v8 ignore next */
          return n
        })
      )
    },
    [applyUpdate]
  )

  const activeNode = nodes.find(n => n.id === activeNodeId) ?? null

  return {
    nodes,
    activeNodeId,
    activeNode,
    loaded,
    addNode,
    renameNode,
    recolorNode,
    removeNode: removeNodeFn,
    reorderNode,
    selectNode,
    splitPaneInNode,
    closePaneInNode,
    updatePaneCwdInNode,
    updateLayoutSizes,
    movePaneToNode,
  }
}
