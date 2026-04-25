import {
  Clock,
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
import type { MouseEvent } from 'react'
import { formatDistanceToNow, format, formatDuration } from '../../../utils/dateUtils'
import { getWorkerIcon } from '../job-list/jobRowUtils'
import { getStatusIcon, getStatusLabel } from '../../shared/statusDisplay'
import { formatOutput } from './runCardUtils'

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

interface RunCardProps {
  run: RunWithJob
  isExpanded: boolean
  onToggle: (runId: string) => void
  onCancel: (runId: string, e: MouseEvent) => void
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

function ExpandIcon({ hasDetails, isExpanded }: { hasDetails: boolean; isExpanded: boolean }) {
  if (!hasDetails) return <span className="expand-spacer" />
  return isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
}

function RunCardHeader({
  run,
  hasDetails,
  isExpanded,
  canCancel,
  onToggle,
  onCancel,
}: {
  run: RunWithJob
  hasDetails: boolean
  isExpanded: boolean
  canCancel: boolean
  onToggle: (runId: string) => void
  onCancel: (runId: string, e: MouseEvent) => void
}) {
  return (
    <div className="run-card-header">
      <button
        type="button"
        className="run-card-main"
        onClick={() => hasDetails && onToggle(run._id)}
        disabled={!hasDetails}
      >
        <span className="run-card-expand">
          <ExpandIcon hasDetails={hasDetails} isExpanded={isExpanded} />
        </span>

        <span className="run-card-status">{getStatusIcon(run.status)}</span>

        <span className="run-card-info">
          <span className="run-card-title">
            {run.job ? (
              <>
                {getWorkerIcon(run.job.workerType, 14)}
                <span className="run-job-name">{run.job.name}</span>
              </>
            ) : (
              <span className="run-job-name deleted">Deleted Job</span>
            )}
            {run.schedule && <span className="run-schedule-badge">via {run.schedule.name}</span>}
          </span>

          <span className="run-card-meta">
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
          </span>
        </span>
      </button>

      <div className="run-card-actions">
        {canCancel && (
          <button
            className="btn-icon-sm btn-danger"
            onClick={e => onCancel(run._id, e)}
            title="Cancel Run"
          >
            <Ban size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function RunCardDetails({ run }: { run: RunWithJob }) {
  return (
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
  )
}

export function RunCard({ run, isExpanded, onToggle, onCancel }: RunCardProps) {
  const hasDetails = run.output !== undefined || run.error !== undefined || run.input !== undefined
  const canCancel = run.status === 'pending' || run.status === 'running'

  return (
    <div className={`run-card run-status-${run.status}`}>
      <RunCardHeader
        run={run}
        hasDetails={hasDetails}
        isExpanded={isExpanded}
        canCancel={canCancel}
        onToggle={onToggle}
        onCancel={onCancel}
      />
      {isExpanded && hasDetails && <RunCardDetails run={run} />}
    </div>
  )
}
