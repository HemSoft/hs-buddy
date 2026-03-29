import { useEffect, useMemo } from 'react'
import { MessageSquare, RefreshCw, Database, HardDrive } from 'lucide-react'
import { useCopilotSessions } from '../../hooks/useCopilotSessions'
import type { SessionSummary } from '../../types/copilotSession'
import './SessionExplorer.css'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  if (date >= weekAgo) return 'This Week'
  return 'Older'
}

function groupByDate(sessions: SessionSummary[]): { label: string; items: SessionSummary[] }[] {
  const order = ['Today', 'Yesterday', 'This Week', 'Older']
  const groups: Record<string, SessionSummary[]> = {}
  for (const s of sessions) {
    const label = getDateGroup(s.modifiedAt)
    if (!groups[label]) groups[label] = []
    groups[label].push(s)
  }
  return order.filter(l => groups[l]?.length).map(label => ({ label, items: groups[label] }))
}

function SessionListItem({ session, onSelect }: { session: SessionSummary; onSelect: (filePath: string) => void }) {
  const displayTitle = getDisplayTitle(session)
  const showPromptPreview = session.title && session.firstPrompt && session.firstPrompt !== session.title

  return (
    <div className="session-list-item" onClick={() => onSelect(session.filePath)}>
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
  const groups = useMemo(() => groupByDate(sessions), [sessions])

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
            <div className="session-stat-label"><HardDrive size={12} /> Total Size</div>
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
        {groups.map(group => (
          <div key={group.label} className="session-date-group">
            <div className="session-date-group-label">{group.label}</div>
            {group.items.map(s => (
              <SessionListItem key={s.filePath} session={s} onSelect={onSelectSession} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
