export type TerminalPaneLayout = {
  type: 'pane'
  id: string
  cwd: string
}

export type TerminalSplitLayout = {
  type: 'split'
  direction: 'horizontal' | 'vertical'
  children: TerminalLayout[]
  sizes: number[]
}

export type TerminalLayout = TerminalPaneLayout | TerminalSplitLayout

export type TerminalTreeNode = {
  id: string
  name: string
  color?: string
  parentId: string | null
  sortOrder: number
  layout: TerminalLayout
}

export type TerminalWorkspaceData = {
  nodes: TerminalTreeNode[]
  activeNodeId: string | null
}

function createPane(cwd = ''): TerminalPaneLayout {
  return {
    type: 'pane',
    id: `pane-${crypto.randomUUID()}`,
    cwd,
  }
}

export function createTreeNode(
  name: string,
  opts: { color?: string; parentId?: string | null; cwd?: string } = {}
): TerminalTreeNode {
  return {
    id: `terminal-node-${crypto.randomUUID()}`,
    name,
    color: opts.color,
    parentId: opts.parentId ?? null,
    sortOrder: Date.now(),
    layout: createPane(opts.cwd),
  }
}

export function collectPaneIds(layout: TerminalLayout): string[] {
  if (layout.type === 'pane') return [layout.id]
  return layout.children.flatMap(collectPaneIds)
}

export function updatePaneCwd(layout: TerminalLayout, paneId: string, cwd: string): TerminalLayout {
  if (layout.type === 'pane') {
    return layout.id === paneId ? { ...layout, cwd } : layout
  }
  return {
    ...layout,
    children: layout.children.map(child => updatePaneCwd(child, paneId, cwd)),
  }
}

export function splitPane(
  layout: TerminalLayout,
  paneId: string,
  direction: 'horizontal' | 'vertical'
): TerminalLayout | null {
  if (layout.type === 'pane') {
    if (layout.id !== paneId) return layout
    return {
      type: 'split',
      direction,
      children: [layout, createPane(layout.cwd)],
      sizes: [50, 50],
    }
  }

  let changed = false
  const children = layout.children.map(child => {
    const next = splitPane(child, paneId, direction)
    if (next !== child) changed = true
    /* v8 ignore next */
    return next ?? child
  })
  return changed ? { ...layout, children } : layout
}

export function removePane(layout: TerminalLayout, paneId: string): TerminalLayout | null {
  if (layout.type === 'pane') {
    return layout.id === paneId ? null : layout
  }

  const children = layout.children
    .map(child => removePane(child, paneId))
    .filter((child): child is TerminalLayout => child !== null)

  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return {
    ...layout,
    children,
    sizes: children.map((_, index) => layout.sizes[index] ?? 100 / children.length),
  }
}
