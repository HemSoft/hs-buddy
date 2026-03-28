import { useEffect } from 'react'
import { MessageSquare, RefreshCw, Database, Cpu, Wrench } from 'lucide-react'
import { useCopilotSessions } from '../../hooks/useCopilotSessions'
import type { CopilotSession, SessionTotals } from '../../types/copilotSession'
import './SessionExplorer.css'

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatsRow({ totals }: { totals: SessionTotals }) {
  return (
    <div className="session-stats-row">
      <div className="session-stat-card">
        <div className="session-stat-label">Sessions</div>
        <div className="session-stat-value">{totals.totalSessions}</div>
      </div>
      <div className="session-stat-card">
        <div className="session-stat-label">Requests</div>
        <div className="session-stat-value">{totals.totalRequests.toLocaleString()}</div>
      </div>
      <div className="session-stat-card">
        <div className="session-stat-label">Tokens</div>
        <div className="session-stat-value">{formatTokenCount(totals.totalPromptTokens + totals.totalOutputTokens)}</div>
      </div>
      <div className="session-stat-card">
        <div className="session-stat-label">Tool Calls</div>
        <div className="session-stat-value">{totals.totalToolCalls.toLocaleString()}</div>
      </div>
    </div>
  )
}

function BreakdownSection({ title, items, icon }: { title: string; items: Record<string, number>; icon: React.ReactNode }) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = entries[0][1]

  return (
    <div className="session-breakdown">
      <h3>{icon} {title}</h3>
      {entries.slice(0, 10).map(([name, count]) => (
        <div key={name} className="session-breakdown-row">
          <span className="session-breakdown-label">{name}</span>
          <div className="session-breakdown-bar">
            <div className="session-breakdown-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="session-breakdown-value">{count}</span>
        </div>
      ))}
    </div>
  )
}

function SessionListItem({ session, onSelect }: { session: CopilotSession; onSelect: (id: string) => void }) {
  return (
    <div className="session-list-item" onClick={() => onSelect(session.sessionId)}>
      <MessageSquare size={16} className="session-list-item-icon" />
      <div className="session-list-item-content">
        <div className="session-list-item-title">{session.title}</div>
        <div className="session-list-item-meta">
          <span>{formatDate(session.startTime)}</span>
          {session.model && <span>{session.model.name || session.model.id}</span>}
          <span>{session.requestCount} req</span>
        </div>
      </div>
      <div className="session-list-item-tokens">
        {formatTokenCount(session.totalPromptTokens + session.totalOutputTokens)} tokens
      </div>
    </div>
  )
}

interface SessionExplorerProps {
  onSelectSession: (sessionId: string) => void
}

export function SessionExplorer({ onSelectSession }: SessionExplorerProps) {
  const { sessions, totals, isLoading, error, scan } = useCopilotSessions()

  useEffect(() => {
    scan()
  }, [scan])

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
        <>
          <StatsRow totals={totals} />
          <BreakdownSection title="Models" items={totals.modelUsage} icon={<Cpu size={13} />} />
          <BreakdownSection title="Tools" items={totals.toolUsage} icon={<Wrench size={13} />} />
        </>
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
          <SessionListItem key={s.sessionId} session={s} onSelect={onSelectSession} />
        ))}
      </div>
    </div>
  )
}
