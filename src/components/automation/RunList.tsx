import { useState, useMemo } from 'react'
import {
  History, Clock, CheckCircle, XCircle, Loader,
  ChevronDown, ChevronRight, Ban, Trash2, Terminal, Brain, Zap,
  Play, User, Calendar, RefreshCw, Filter,
} from 'lucide-react'
import { useRecentRuns, useRunMutations } from '../../hooks/useConvex'
import { formatDistanceToNow, format } from '../../utils/dateUtils'
import './RunList.css'

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
type TriggerType = 'manual' | 'schedule' | 'api'

interface RunWithJob {
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

type StatusFilter = 'all' | RunStatus

export function RunList() {
  const runs = useRecentRuns(100)
  const { cancel, cleanup } = useRunMutations()
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const toggleRow = (runId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(runId)) {
        next.delete(runId)
      } else {
        next.add(runId)
      }
      return next
    })
  }

  const handleCancel = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await cancel({ id: runId as any })
    } catch (error) {
      console.error('Failed to cancel run:', error)
    }
  }

  const handleCleanup = async () => {
    if (confirm('Delete all completed and failed runs older than 7 days?')) {
      try {
        const result = await cleanup({ olderThanDays: 7 })
        console.log(`Cleaned up ${result.deleted} old runs`)
      } catch (error) {
        console.error('Failed to cleanup runs:', error)
      }
    }
  }

  const filteredRuns = useMemo(() => {
    if (!runs) return []
    if (statusFilter === 'all') return runs as RunWithJob[]
    return (runs as RunWithJob[]).filter(r => r.status === statusFilter)
  }, [runs, statusFilter])

  // Count runs by status for filter badges
  const statusCounts = useMemo(() => {
    if (!runs) return {} as Record<RunStatus, number>
    const counts: Record<string, number> = {}
    for (const run of runs as RunWithJob[]) {
      counts[run.status] = (counts[run.status] || 0) + 1
    }
    return counts
  }, [runs])

  const getStatusIcon = (status: RunStatus) => {
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

  const getStatusLabel = (status: RunStatus): string => {
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const getTriggerIcon = (triggeredBy: TriggerType) => {
    switch (triggeredBy) {
      case 'manual':
        return <User size={12} className="trigger-icon" />
      case 'schedule':
        return <Calendar size={12} className="trigger-icon" />
      case 'api':
        return <RefreshCw size={12} className="trigger-icon" />
    }
  }

  const getWorkerIcon = (workerType: 'exec' | 'ai' | 'skill') => {
    switch (workerType) {
      case 'exec':
        return <Terminal size={14} className="worker-icon worker-exec" />
      case 'ai':
        return <Brain size={14} className="worker-icon worker-ai" />
      case 'skill':
        return <Zap size={14} className="worker-icon worker-skill" />
    }
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  const formatOutput = (output: unknown): string => {
    if (output === null || output === undefined) return ''
    if (typeof output === 'string') return output
    try {
      return JSON.stringify(output, null, 2)
    } catch {
      return String(output)
    }
  }

  if (runs === undefined) {
    return (
      <div className="run-list">
        <div className="run-list-loading">
          <div className="loading-spinner" />
          <span>Loading runs...</span>
        </div>
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="run-list">
        <div className="run-list-empty">
          <History size={48} strokeWidth={1.5} />
          <h3>No Runs Yet</h3>
          <p>Runs will appear here when you execute jobs manually or via schedules.</p>
        </div>
      </div>
    )
  }

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Running', value: 'running' },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed', value: 'failed' },
    { label: 'Cancelled', value: 'cancelled' },
  ]

  return (
    <div className="run-list">
      <div className="run-list-header">
        <h2>Runs</h2>
        <div className="run-list-header-actions">
          <button
            className="btn-icon"
            onClick={handleCleanup}
            title="Cleanup old runs (7+ days)"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Status Filter Bar */}
      <div className="run-filter-bar">
        <Filter size={14} className="filter-icon" />
        {filterButtons.map(({ label, value }) => {
          const count = value === 'all'
            ? (runs as RunWithJob[]).length
            : statusCounts[value as RunStatus] || 0
          return (
            <button
              key={value}
              className={`filter-btn ${statusFilter === value ? 'active' : ''} ${value !== 'all' ? `filter-${value}` : ''}`}
              onClick={() => setStatusFilter(value)}
            >
              {label}
              {count > 0 && <span className="filter-count">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Run Items */}
      <div className="run-list-content">
        {filteredRuns.length === 0 && (
          <div className="run-list-no-results">
            <p>No {statusFilter} runs found.</p>
          </div>
        )}

        {filteredRuns.map((run: RunWithJob) => {
          const isExpanded = expandedRows.has(run._id)
          const hasDetails = run.output !== undefined || run.error !== undefined || run.input !== undefined
          const canCancel = run.status === 'pending' || run.status === 'running'

          return (
            <div
              key={run._id}
              className={`run-card run-status-${run.status}`}
            >
              {/* Main Row */}
              <div
                className="run-card-header"
                onClick={() => hasDetails && toggleRow(run._id)}
                style={{ cursor: hasDetails ? 'pointer' : 'default' }}
              >
                <div className="run-card-expand">
                  {hasDetails ? (
                    isExpanded
                      ? <ChevronDown size={14} />
                      : <ChevronRight size={14} />
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
                        {getWorkerIcon(run.job.workerType)}
                        <span className="run-job-name">{run.job.name}</span>
                      </>
                    ) : (
                      <span className="run-job-name deleted">Deleted Job</span>
                    )}
                    {run.schedule && (
                      <span className="run-schedule-badge">
                        via {run.schedule.name}
                      </span>
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
                      onClick={(e) => handleCancel(run._id, e)}
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
        })}
      </div>
    </div>
  )
}
