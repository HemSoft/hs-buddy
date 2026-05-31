import { lazy, Suspense } from 'react'
import { Columns2, Rows2, X } from 'lucide-react'
import { useTerminalWorkspace } from '../../hooks/useTerminalWorkspace'
import type { TerminalLayout, TerminalPaneLayout, TerminalSplitLayout } from './types'
import { collectPaneIds } from './types'
import './TerminalWorkspaceView.css'

const TerminalPane = lazy(() =>
  import('../terminal/TerminalPane').then(module => ({ default: module.TerminalPane }))
)

function TerminalWorkspaceEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="terminal-workspace-empty">
      <button type="button" className="terminal-workspace-empty-action" onClick={onCreate}>
        New Project
      </button>
    </div>
  )
}

function TerminalPaneCell({
  layout,
  nodeId,
  canClose,
  onSplit,
  onClose,
  onCwdChange,
}: {
  layout: TerminalPaneLayout
  nodeId: string
  canClose: boolean
  onSplit: (nodeId: string, paneId: string, direction: 'horizontal' | 'vertical') => void
  onClose: (nodeId: string, paneId: string) => void
  onCwdChange: (nodeId: string, paneId: string, cwd: string) => void
}) {
  return (
    <div className="terminal-workspace-pane">
      <div className="terminal-workspace-pane-toolbar">
        <button
          type="button"
          className="terminal-workspace-tool"
          title="Split right"
          aria-label="Split terminal right"
          onClick={() => onSplit(nodeId, layout.id, 'horizontal')}
        >
          <Columns2 size={13} />
        </button>
        <button
          type="button"
          className="terminal-workspace-tool"
          title="Split down"
          aria-label="Split terminal down"
          onClick={() => onSplit(nodeId, layout.id, 'vertical')}
        >
          <Rows2 size={13} />
        </button>
        <button
          type="button"
          className="terminal-workspace-tool"
          title="Close pane"
          aria-label="Close terminal pane"
          disabled={!canClose}
          onClick={() => onClose(nodeId, layout.id)}
        >
          <X size={13} />
        </button>
      </div>
      <Suspense fallback={<div className="terminal-workspace-loading">Loading terminal…</div>}>
        <TerminalPane
          key={layout.id}
          viewKey={layout.id}
          cwd={layout.cwd || undefined}
          onCwdChange={cwd => onCwdChange(nodeId, layout.id, cwd)}
        />
      </Suspense>
    </div>
  )
}

function TerminalSplit({
  layout,
  nodeId,
  paneCount,
  onSplit,
  onClose,
  onCwdChange,
}: {
  layout: TerminalSplitLayout
  nodeId: string
  paneCount: number
  onSplit: (nodeId: string, paneId: string, direction: 'horizontal' | 'vertical') => void
  onClose: (nodeId: string, paneId: string) => void
  onCwdChange: (nodeId: string, paneId: string, cwd: string) => void
}) {
  return (
    <div className={`terminal-workspace-split ${layout.direction}`}>
      {layout.children.map((child, index) => (
        <div
          key={child.type === 'pane' ? child.id : `${layout.direction}-${index}`}
          className="terminal-workspace-split-child"
          style={{ flexBasis: `${layout.sizes[index] ?? 100 / layout.children.length}%` }}
        >
          <TerminalLayoutView
            layout={child}
            nodeId={nodeId}
            paneCount={paneCount}
            onSplit={onSplit}
            onClose={onClose}
            onCwdChange={onCwdChange}
          />
        </div>
      ))}
    </div>
  )
}

function TerminalLayoutView({
  layout,
  nodeId,
  paneCount,
  onSplit,
  onClose,
  onCwdChange,
}: {
  layout: TerminalLayout
  nodeId: string
  paneCount: number
  onSplit: (nodeId: string, paneId: string, direction: 'horizontal' | 'vertical') => void
  onClose: (nodeId: string, paneId: string) => void
  onCwdChange: (nodeId: string, paneId: string, cwd: string) => void
}) {
  if (layout.type === 'pane') {
    return (
      <TerminalPaneCell
        layout={layout}
        nodeId={nodeId}
        canClose={paneCount > 1}
        onSplit={onSplit}
        onClose={onClose}
        onCwdChange={onCwdChange}
      />
    )
  }

  return (
    <TerminalSplit
      layout={layout}
      nodeId={nodeId}
      paneCount={paneCount}
      onSplit={onSplit}
      onClose={onClose}
      onCwdChange={onCwdChange}
    />
  )
}

export function TerminalWorkspaceView() {
  const { activeNode, addNode, selectNode, splitPaneInNode, closePaneInNode, updatePaneCwdInNode } =
    useTerminalWorkspace()

  if (!activeNode) {
    return (
      <TerminalWorkspaceEmpty
        onCreate={() => {
          const node = addNode('Project 1')
          selectNode(node.id)
        }}
      />
    )
  }

  const paneCount = collectPaneIds(activeNode.layout).length

  return (
    <div className="terminal-workspace">
      <div className="terminal-workspace-header">
        <div className="terminal-workspace-title">
          {activeNode.color && (
            <span
              className="terminal-workspace-color-dot"
              style={{ backgroundColor: activeNode.color }}
            />
          )}
          <span>{activeNode.name}</span>
        </div>
      </div>
      <div className="terminal-workspace-body">
        <TerminalLayoutView
          layout={activeNode.layout}
          nodeId={activeNode.id}
          paneCount={paneCount}
          onSplit={splitPaneInNode}
          onClose={closePaneInNode}
          onCwdChange={updatePaneCwdInNode}
        />
      </div>
    </div>
  )
}
