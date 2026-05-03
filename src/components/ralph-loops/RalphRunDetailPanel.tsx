import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Square,
  AlertCircle,
} from 'lucide-react'
import type { RalphRunInfo, RalphRunStatus, RalphRunPhase, RalphRunStats } from '../../types/ralph'
import './RalphRunDetailPanel.css'

interface RalphRunDetailPanelProps {
  runId: string
}

const STATUS_CONFIG: Record<
  RalphRunStatus,
  { label: string; className: string; icon: typeof Clock }
> = {
  pending: { label: 'Pending', className: 'ralph-status-pending', icon: Clock },
  running: { label: 'Running', className: 'ralph-status-running', icon: Loader2 },
  completed: { label: 'Completed', className: 'ralph-status-completed', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'ralph-status-failed', icon: XCircle },
  cancelled: { label: 'Cancelled', className: 'ralph-status-cancelled', icon: AlertTriangle },
  orphaned: { label: 'Orphaned', className: 'ralph-status-orphaned', icon: AlertTriangle },
}

const PHASE_LABELS: Record<RalphRunPhase, string> = {
  initializing: 'Initializing…',
  iterating: 'Iterating',
  scanning: 'Scanning',
  'pr-handoff': 'PR Handoff',
  'pr-resolving': 'PR Review Cycle',
  completed: 'Done',
  failed: 'Failed',
}

const LOG_POLL_MS = 2_000

function isActive(status: RalphRunStatus): boolean {
  return status === 'running' || status === 'pending'
}

function formatDuration(startedAt: number, completedAt: number | null): string {
  const end = completedAt ?? Date.now()
  const ms = end - startedAt
  const secs = Math.floor(ms / 1_000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function repoName(repoPath: string): string {
  const parts = repoPath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || repoPath
}

function RunHeader({ run, onStop }: { run: RalphRunInfo; onStop: (id: string) => void }) {
  const cfg = STATUS_CONFIG[run.status]
  const StatusIcon = cfg.icon

  return (
    <div className="ralph-run-detail-header">
      <div className="ralph-run-detail-header-left">
        <h2>{repoName(run.config.repoPath)}</h2>
        <span className={`ralph-run-detail-status ${cfg.className}`}>
          <StatusIcon size={12} className={run.status === 'running' ? 'ralph-spin' : ''} />
          {cfg.label}
        </span>
      </div>
      {run.status === 'running' && (
        <button className="ralph-action-btn" onClick={() => onStop(run.runId)} title="Stop loop">
          <Square size={12} />
          Stop
        </button>
      )}
    </div>
  )
}

function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : /* v8 ignore next */ 0
  return (
    <div className="ralph-run-progress-row">
      <span className="ralph-run-progress-label">{label}</span>
      <div className="ralph-run-progress-bar">
        <div className="ralph-run-progress-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="ralph-run-progress-value">
        {current}/{total}
      </span>
    </div>
  )
}

function StatItem({
  value,
  label,
  wide,
}: {
  value: number | string | null | undefined
  label: string
  wide?: boolean
}) {
  if (!value) return null
  return (
    <div className={`ralph-run-stat${wide ? ' ralph-run-stat-wide' : ''}`}>
      <span className="ralph-run-stat-value">{value}</span>
      <span className="ralph-run-stat-label">{label}</span>
    </div>
  )
}

function StatsGrid({ stats }: { stats: RalphRunStats }) {
  if (stats.checks <= 0 && stats.agentTurns <= 0 && stats.scanIterations <= 0) return null
  return (
    <div className="ralph-run-stats-grid">
      <StatItem value={stats.scanIterations} label="Scans" />
      <StatItem value={stats.issuesCreated} label="Issues Created" />
      <StatItem value={stats.checks} label="Checks" />
      <StatItem value={stats.agentTurns} label="Agent Turns" />
      <StatItem value={stats.reviews} label="Reviews" />
      <StatItem value={stats.copilotPRs} label="Copilot PRs" />
      <StatItem value={stats.totalCost} label={`${stats.totalPremium} premium`} wide />
    </div>
  )
}

function ProgressSection({ run }: { run: RalphRunInfo }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!isActive(run.status)) return
    const timer = setInterval(() => setTick(t => t + 1), 1_000)
    return () => clearInterval(timer)
  }, [run.status])

  const model = run.config.model || 'default'
  const branch = run.config.branch || '(auto)'
  const phase = PHASE_LABELS[run.phase]
  const duration = formatDuration(run.startedAt, run.completedAt)
  const stats = run.stats

  return (
    <div className="ralph-run-detail-card">
      <h3>Progress</h3>
      <div className="ralph-run-progress-meta">
        <span>
          Model: <strong>{model}</strong>
        </span>
        <span>
          Branch: <strong>{branch}</strong>
        </span>
      </div>
      {run.totalIterations != null && run.totalIterations > 0 && (
        <ProgressBar
          current={run.currentIteration}
          total={run.totalIterations}
          label={`Iteration`}
        />
      )}
      <StatsGrid stats={stats} />
      <div className="ralph-run-progress-meta ralph-run-progress-footer">
        <span>{phase}</span>
        <span>{duration}</span>
        {run.exitCode != null && <span>Exit: {run.exitCode}</span>}
      </div>
    </div>
  )
}

function classifyLogLine(line: string): string {
  if (/^={2,}/.test(line)) return 'log-header'
  if (/^[═─]{3,}/.test(line)) return 'log-separator'
  if (/^\s+Round \d+/i.test(line) || /^\s+Totals\s*\(/i.test(line)) return 'log-section'
  if (/^\[[\w-]+\]\s*\[\d{4}-/.test(line)) return 'log-timestamp'
  if (/^\s+(Changes|Requests|Tokens|Cost|Elapsed)\s/.test(line)) return 'log-stat'
  if (/^\s*\|/.test(line)) return 'log-command'
  if (/CI is now running|Action taken|Waiting|in progress/i.test(line)) return 'log-info'
  return ''
}

function LogViewer({ run }: { run: RalphRunInfo }) {
  const logEndRef = useRef<HTMLDivElement>(null)
  const active = isActive(run.status)

  useEffect(() => {
    if (active && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [run.logBuffer.length, active])

  return (
    <div className="ralph-run-detail-log">
      <h3>Log Output ({run.logBuffer.length} lines)</h3>
      <div className="ralph-run-detail-log-content">
        {run.logBuffer.length === 0 ? (
          <span className="ralph-run-detail-log-empty">No output yet…</span>
        ) : (
          <>
            {run.logBuffer.map((line, i) => {
              const cls = classifyLogLine(line)
              return (
                <div key={i} className={cls || undefined}>
                  {line || '\u00A0'}
                </div>
              )
            })}
            <div ref={logEndRef} />
          </>
        )}
      </div>
    </div>
  )
}

export function RalphRunDetailPanel({ runId }: RalphRunDetailPanelProps) {
  const [run, setRun] = useState<RalphRunInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchRun = useCallback(async () => {
    try {
      const result = await window.ralph.getStatus(runId)
      if (!mountedRef.current) return
      setRun(result)
      if (!result) setError('Run not found')
    } catch (err: unknown) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load run')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    mountedRef.current = true
    fetchRun()
    return () => {
      mountedRef.current = false
    }
  }, [fetchRun])

  useEffect(() => {
    const handleUpdate = (...args: unknown[]) => {
      if (!mountedRef.current) return
      const updated = args[0] as RalphRunInfo
      if (updated.runId === runId) setRun(updated)
    }
    window.ralph.onStatusChange(handleUpdate)
    return () => {
      window.ralph.offStatusChange(handleUpdate)
    }
  }, [runId])

  useEffect(() => {
    if (!run || !isActive(run.status)) return
    const timer = setInterval(fetchRun, LOG_POLL_MS)
    return () => clearInterval(timer)
  }, [run?.status, fetchRun]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = useCallback(
    async (id: string) => {
      try {
        await window.ralph.stop(id)
        fetchRun()
      } catch (_: unknown) {
        /* stop errors handled by main process */
      }
    },
    [fetchRun]
  )

  if (loading) {
    return (
      <div className="ralph-run-detail">
        <div className="ralph-run-detail-loading">
          <Loader2 size={18} className="ralph-spin" />
          Loading run…
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="ralph-run-detail">
        <div className="ralph-run-detail-empty">
          <AlertCircle size={32} />
          <span>{/* v8 ignore start */ error || 'Run not found' /* v8 ignore stop */}</span>
          <span className="ralph-run-detail-runid">{runId}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="ralph-run-detail">
      <RunHeader run={run} onStop={handleStop} />

      <ProgressSection run={run} />

      {run.error && <div className="ralph-run-detail-error">{run.error}</div>}

      <LogViewer run={run} />
    </div>
  )
}
