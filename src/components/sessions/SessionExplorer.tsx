import { useEffect } from 'react'
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

function SessionListItem({ session, onSelect }: { session: SessionSummary; onSelect: (filePath: string) => void }) {
  return (
    <div className="session-list-item" onClick={() => onSelect(session.filePath)}>
      <MessageSquare size={16} className="session-list-item-icon" />
      <div className="session-list-item-content">
        <div className="session-list-item-title">{session.sessionId.slice(0, 8)}…</div>
        <div className="session-list-item-meta">
          <span>{formatDate(session.modifiedAt)}</span>
          <span>{session.workspaceHash.slice(0, 8)}…</span>
        </div>
      </div>
      <div className="session-list-item-tokens">
        {formatSize(session.sizeBytes)}
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
        {sessions.map(s => (
          <SessionListItem key={s.filePath} session={s} onSelect={onSelectSession} />
        ))}
      </div>
    </div>
  )
}
