import type { RalphRunInfo, RalphRunStatus, RalphRunPhase } from '../../types/ralph'
import { Square, CheckCircle2, XCircle, AlertTriangle, Loader2, Clock } from 'lucide-react'

interface RalphLoopCardProps {
  run: RalphRunInfo
  onStop: (runId: string) => void
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

function formatDuration(startedAt: number, completedAt: number | null): string {
  const end = completedAt ?? Date.now()
  const ms = end - startedAt
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function repoName(repoPath: string): string {
  const parts = repoPath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || repoPath
}

function CardMeta({ run }: { run: RalphRunInfo }) {
  return (
    <div className="ralph-card-meta">
      <span className="ralph-card-script">{run.config.scriptType}</span>
      {run.config.model && <span className="ralph-card-model">{run.config.model}</span>}
      <span className="ralph-card-phase">{PHASE_LABELS[run.phase]}</span>
    </div>
  )
}

function CardFooter({
  run,
  isActive,
  onStop,
}: {
  run: RalphRunInfo
  isActive: boolean
  onStop: (id: string) => void
}) {
  return (
    <div className="ralph-card-footer">
      <span className="ralph-card-duration">{formatDuration(run.startedAt, run.completedAt)}</span>
      {isActive && (
        <button className="ralph-stop-btn" onClick={() => onStop(run.runId)} title="Stop loop">
          <Square size={12} />
          Stop
        </button>
      )}
      {run.error && (
        <span className="ralph-card-error" title={run.error}>
          {run.error.slice(0, 60)}
        </span>
      )}
    </div>
  )
}

export function RalphLoopCard({ run, onStop }: RalphLoopCardProps) {
  const statusCfg = STATUS_CONFIG[run.status]
  const StatusIcon = statusCfg.icon
  const isActive = run.status === 'running' || run.status === 'pending'
  const progress =
    run.totalIterations != null && run.totalIterations > 0
      ? Math.round((run.currentIteration / run.totalIterations) * 100)
      : null

  return (
    <div className={`ralph-loop-card ${statusCfg.className}`}>
      <div className="ralph-card-header">
        <div className="ralph-card-repo">
          <span className="ralph-card-repo-name">{repoName(run.config.repoPath)}</span>
          {run.config.branch && <span className="ralph-card-branch">{run.config.branch}</span>}
        </div>
        <div className="ralph-card-status">
          <StatusIcon size={14} className={run.status === 'running' ? 'ralph-spin' : ''} />
          <span>{statusCfg.label}</span>
        </div>
      </div>

      <div className="ralph-card-body">
        <CardMeta run={run} />

        {isActive && progress !== null && (
          <div className="ralph-progress-bar">
            <div className="ralph-progress-fill" style={{ width: `${progress}%` }} />
            <span className="ralph-progress-label">
              {run.currentIteration}/{run.totalIterations}
            </span>
          </div>
        )}

        <CardFooter run={run} isActive={isActive} onStop={onStop} />
      </div>
    </div>
  )
}
