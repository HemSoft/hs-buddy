import {
  Clock,
  CheckCircle,
  XCircle,
  Loader,
  ChevronDown,
  ChevronRight,
  Ban,
  Play,
  User,
  Calendar,
  RefreshCw,
} from 'lucide-react'
import { formatDistanceToNow, format } from '../../../utils/dateUtils'
import { getWorkerIcon } from '../job-list/JobRow'

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
type TriggerType = 'manual' | 'schedule' | 'api'

export interface RunWithJob {
  _id: string
  _creationTime: number
  jobId: string
  scheduleId?: string
  status: RunStatus
  triggeredBy: TriggerType
  input?: unknown
  output?: unknown
  error?: string
  startedAt: number
  completedAt?: number
  duration?: number
  job?: {
    _id: string
    name: string
    workerType: 'exec' | 'ai' | 'skill'
  }
  schedule?: {
    _id: string
    name: string
  }
}

export interface RunCardProps {
  run: RunWithJob
  isExpanded: boolean
  onToggle: (runId: string) => void
  onCancel: (runId: string, e: React.MouseEvent) => void
}

function getStatusIcon(status: RunStatus) {
  switch (status) {
    case 'pending':
      return <Clock size={14} className="status-icon status-pending" />
    case 'running':
      return <Loader size={14} className="status-icon status-running" />
    case 'completed':
      return <CheckCircle size={14} className="status-icon status-completed" />
    case 'failed':
      return <XCircle size={14} className="status-icon status-failed" />
    case 'cancelled':
      return <Ban size={14} className="status-icon status-cancelled" />
  }
}

function getStatusLabel(status: RunStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getTriggerIcon(triggeredBy: TriggerType) {
  switch (triggeredBy) {
    case 'manual':
      return <User size={12} className="trigger-icon" />
    case 'schedule':
      return <Calendar size={12} className="trigger-icon" />
    case 'api':
      return <RefreshCw size={12} className="trigger-icon" />
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function formatOutput(output: unknown): string {
  if (output === null || output === undefined) return ''
  if (typeof output === 'string') return output
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RunCard({ run, isExpanded, onToggle, onCancel }: any) {
  const hasDetails = run.output !== undefined || run.error !== undefined || run.input !== undefined
  const canCancel = run.status === 'pending' || run.status === 'running'

  return (
    <div className={`run-card run-status-${run.status}`}>
      {/* Main Row */}
      <div
        className="run-card-header"
        onClick={() => hasDetails && onToggle(run._id)}
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
      >
        <div className="run-card-expand">
          {hasDetails ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="expand-spacer" />
          )}
        </div>

        <div className="run-card-status">
          {getStatusIcon(run.status)}
        </div>

        <div className="run-card-info">
          <div className="run-card-title">
            {run.job ? (
              <>
                {getWorkerIcon(run.job.workerType, 14)}
                <span className="run-job-name">{run.job.name}</span>
              </>
            ) : (
              <span className="run-job-name deleted">Deleted Job</span>
            )}
            {run.schedule && (
              <span className="run-schedule-badge">via {run.schedule.name}</span>
            )}
          </div>

          <div className="run-card-meta">
            <span className="run-meta-item" title={format(run.startedAt, 'yyyy-MM-dd HH:mm:ss')}>
              {getTriggerIcon(run.triggeredBy)}
              {formatDistanceToNow(run.startedAt)}
            </span>
            {run.duration !== undefined && (
              <span className="run-meta-item">
                <Clock size={12} />
                {formatDuration(run.duration)}
              </span>
            )}
            {run.status === 'running' && (
              <span className="run-meta-item running-indicator">
                <Loader size={12} className="spin" />
                Running...
              </span>
            )}
            <span className={`run-status-badge status-${run.status}`}>
              {getStatusLabel(run.status)}
            </span>
          </div>
        </div>

        <div className="run-card-actions">
          {canCancel && (
            <button
              className="btn-icon-sm btn-danger"
              onClick={(e) => onCancel(run._id, e)}
              title="Cancel Run"
            >
              <Ban size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && hasDetails && (
        <div className="run-card-details">
          {run.error && (
            <div className="run-detail-section error-section">
              <div className="detail-section-header">
                <XCircle size={14} />
                <span>Error</span>
              </div>
              <pre className="detail-content error">{run.error}</pre>
            </div>
          )}

          {run.output !== undefined && (
            <div className="run-detail-section output-section">
              <div className="detail-section-header">
                <Play size={14} />
                <span>Output</span>
              </div>
              <pre className="detail-content output">{formatOutput(run.output)}</pre>
            </div>
          )}

          {run.input !== undefined && (
            <div className="run-detail-section input-section">
              <div className="detail-section-header">
                <ChevronRight size={14} />
                <span>Input</span>
              </div>
              <pre className="detail-content">{formatOutput(run.input)}</pre>
            </div>
          )}

          <div className="run-detail-footer">
            <span>Started: {format(run.startedAt, 'MMM d, yyyy h:mm:ss a')}</span>
            {run.completedAt && (
              <span>Completed: {format(run.completedAt, 'MMM d, yyyy h:mm:ss a')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
