import { useEffect, useMemo, useState } from 'react'
import {
  MessageSquare,
  RefreshCw,
  Database,
  HardDrive,
  FolderOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useCopilotSessions } from '../../hooks/useCopilotSessions'
import type { SessionSummary } from '../../types/copilotSession'
import { DAY } from '../../utils/dateUtils'
import './SessionExplorer.css'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDisplayTitle(session: SessionSummary): string {
  if (session.title) return session.title
  if (session.firstPrompt) {
    const text = session.firstPrompt.slice(0, 80)
    return text.length < session.firstPrompt.length ? text + '…' : text
  }
  return `Session ${session.sessionId.slice(0, 8)}`
}

function getDateGroup(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - DAY)
  const weekAgo = new Date(today.getTime() - 7 * DAY)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  if (date >= weekAgo) return 'This Week'
  return 'Older'
}

interface DateGroup {
  label: string
  items: SessionSummary[]
}
interface WorkspaceGroup {
  name: string
  hash: string
  dateGroups: DateGroup[]
  sessionCount: number
  latestModified: number
}

function groupByWorkspaceThenDate(sessions: SessionSummary[]): WorkspaceGroup[] {
  const dateOrder = ['Today', 'Yesterday', 'This Week', 'Older']

  // Group sessions by workspace
  const byWorkspace = new Map<string, SessionSummary[]>()
  for (const s of sessions) {
    const key = s.workspaceHash
    if (!byWorkspace.has(key)) byWorkspace.set(key, [])
    byWorkspace.get(key)!.push(s)
  }

  // Build workspace groups with date sub-groups
  const groups: WorkspaceGroup[] = []
  for (const [hash, wsSessions] of byWorkspace) {
    const name = wsSessions[0].workspaceName || `(unnamed — ${hash.slice(0, 8)})`
    const latestModified = Math.max(...wsSessions.map(s => s.modifiedAt))

    // Sub-group by date
    const byDate: Record<string, SessionSummary[]> = {}
    for (const s of wsSessions) {
      const label = getDateGroup(s.modifiedAt)
      /* v8 ignore start */
      if (!byDate[label]) byDate[label] = []
      /* v8 ignore stop */
      byDate[label].push(s)
    }
    const dateGroups = dateOrder
      .filter(l => byDate[l]?.length)
      .map(label => ({ label, items: byDate[label] }))

    groups.push({ name, hash, dateGroups, sessionCount: wsSessions.length, latestModified })
  }

  // Sort workspaces by most recent activity
  groups.sort((a, b) => b.latestModified - a.latestModified)
  return groups
}

function SessionListItem({
  session,
  onSelect,
}: {
  session: SessionSummary
  onSelect: (filePath: string) => void
}) {
  const displayTitle = getDisplayTitle(session)
  const showPromptPreview =
    session.title && session.firstPrompt && session.firstPrompt !== session.title

  return (
    <button type="button" className="session-list-item" onClick={() => onSelect(session.filePath)}>
      <MessageSquare size={16} className="session-list-item-icon" />
      <div className="session-list-item-content">
        <div className="session-list-item-title">{displayTitle}</div>
        {showPromptPreview && (
          <div className="session-list-item-prompt">{session.firstPrompt.slice(0, 100)}</div>
        )}
        <div className="session-list-item-meta">
          <span>{formatDate(session.modifiedAt)}</span>
          {session.requestCount > 0 && <span>{session.requestCount} requests</span>}
          <span>{formatSize(session.sizeBytes)}</span>
        </div>
      </div>
    </button>
  )
}

function WorkspaceSection({
  group,
  onSelect,
  expanded,
  onToggle,
}: {
  group: WorkspaceGroup
  onSelect: (filePath: string) => void
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="session-workspace-group">
      <button type="button" className="session-workspace-header" onClick={onToggle}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FolderOpen size={14} className="session-workspace-icon" />
        <span className="session-workspace-name">{group.name}</span>
        <span className="session-workspace-count">{group.sessionCount}</span>
      </button>
      {expanded && (
        <div className="session-workspace-body">
          {group.dateGroups.map(dg => (
            <div key={dg.label} className="session-date-group">
              <div className="session-date-group-label">{dg.label}</div>
              {dg.items.map(s => (
                <SessionListItem key={s.filePath} session={s} onSelect={onSelect} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface SessionExplorerProps {
  onSelectSession: (filePath: string) => void
}

export function SessionExplorer({ onSelectSession }: SessionExplorerProps) {
  const { sessions, totalCount, isLoading, error, scan } = useCopilotSessions()

  useEffect(() => {
    scan()
  }, [scan])

  const totalSize = sessions.reduce((sum, s) => sum + s.sizeBytes, 0)
  const workspaceGroups = useMemo(() => groupByWorkspaceThenDate(sessions), [sessions])
  const defaultExpandedHashes = useMemo(
    () => new Set(workspaceGroups.slice(0, 3).map(group => group.hash)),
    [workspaceGroups]
  )
  const [expandedHashes, setExpandedHashes] = useState<Set<string>>(new Set())

  useEffect(() => {
    setExpandedHashes(prev => {
      const next = new Set(prev)
      let changed = false
      const availableHashes = new Set(workspaceGroups.map(group => group.hash))

      for (const hash of defaultExpandedHashes) {
        if (!next.has(hash)) {
          next.add(hash)
          changed = true
        }
      }

      for (const hash of next) {
        if (!availableHashes.has(hash)) {
          next.delete(hash)
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [defaultExpandedHashes, workspaceGroups])

  const toggleWorkspace = (hash: string) => {
    setExpandedHashes(prev => {
      const next = new Set(prev)
      if (next.has(hash)) {
        next.delete(hash)
      } else {
        next.add(hash)
      }
      return next
    })
  }

  return (
    <div className="session-explorer">
      <div className="session-explorer-header">
        <h2>Session Explorer</h2>
        <button className="session-explorer-refresh" onClick={scan} disabled={isLoading}>
          <RefreshCw size={14} /> {isLoading ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {error && <div className="session-error">{error}</div>}

      {sessions.length > 0 && (
        <div className="session-stats-row">
          <div className="session-stat-card">
            <div className="session-stat-label">Sessions</div>
            <div className="session-stat-value">{totalCount}</div>
          </div>
          <div className="session-stat-card">
            <div className="session-stat-label">
              <FolderOpen size={12} /> Projects
            </div>
            <div className="session-stat-value">{workspaceGroups.length}</div>
          </div>
          <div className="session-stat-card">
            <div className="session-stat-label">
              <HardDrive size={12} /> Total Size
            </div>
            <div className="session-stat-value">{formatSize(totalSize)}</div>
          </div>
        </div>
      )}

      <div className="session-list">
        {sessions.length === 0 && !isLoading && !error && (
          <div className="session-empty">
            <Database size={24} className="session-empty-icon" />
            <p>No Copilot sessions found.</p>
            <p>Click Scan to search VS Code workspace storage.</p>
          </div>
        )}
        {workspaceGroups.map(group => (
          <WorkspaceSection
            key={group.hash}
            group={group}
            onSelect={onSelectSession}
            expanded={expandedHashes.has(group.hash)}
            onToggle={() => toggleWorkspace(group.hash)}
          />
        ))}
      </div>
    </div>
  )
}
