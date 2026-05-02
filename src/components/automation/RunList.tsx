import { useState, useMemo } from 'react'
import { History, Trash2 } from 'lucide-react'
import { useRecentRuns, useRunMutations } from '../../hooks/useConvex'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../ConfirmDialog'
import type { Id } from '../../../convex/_generated/dataModel'
import { RunCard, type RunWithJob } from './run-list/RunCard'
import { RunFilterBar, type StatusFilter } from './run-list/RunFilterBar'
import { ViewModeToggle } from '../shared/ViewModeToggle'
import { useViewMode } from '../../hooks/useViewMode'
import { getStatusIcon, getStatusLabel } from '../shared/statusDisplay'
import { getWorkerIcon } from './job-list/jobRowUtils'
import { formatDistanceToNow, formatDuration } from '../../utils/dateUtils'
import './RunList.css'
import '../shared/ListView.css'

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export function RunList() {
  const runs = useRecentRuns(100)
  const { cancel, cleanup } = useRunMutations()
  const [expandedRows, setExpandedRows] = useState(new Set<string>())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useViewMode('run-list')

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
      await cancel({ id: runId as Id<'runs'> })
    } catch (error: unknown) {
      console.error('Failed to cancel run:', error)
    }
  }

  const { confirm, confirmDialog } = useConfirm()

  const handleCleanup = async () => {
    const confirmed = await confirm({
      message: 'Delete all completed and failed runs older than 7 days?',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (confirmed) {
      try {
        const result = await cleanup({ olderThanDays: 7 })
        console.log(`Cleaned up ${result.deleted} old runs`)
      } catch (error: unknown) {
        /* v8 ignore start */
        console.error('Failed to cleanup runs:', error)
        /* v8 ignore stop */
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

  return (
    <>
      <div className="run-list">
        <div className="run-list-header">
          <h2>Runs</h2>
          <div className="run-list-header-actions">
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            <button className="btn-icon" onClick={handleCleanup} title="Cleanup old runs (7+ days)">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <RunFilterBar
          statusFilter={statusFilter}
          totalCount={(runs as RunWithJob[]).length}
          statusCounts={statusCounts}
          onFilterChange={setStatusFilter}
        />

        <div className="run-list-content">
          {filteredRuns.length === 0 && (
            <div className="run-list-no-results">
              <p>No {statusFilter} runs found.</p>
            </div>
          )}

          {viewMode === 'list' ? (
            <table className="list-view-table">
              <thead>
                <tr>
                  <th className="col-status"></th>
                  <th className="col-title">Name</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Triggered</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run: RunWithJob) => (
                  <tr key={run._id} onClick={() => toggleRow(run._id)}>
                    <td className="col-status">{getStatusIcon(run.status)}</td>
                    <td className="col-title">
                      {run.job ? (
                        <>
                          {getWorkerIcon(run.job.workerType, 14)} {run.job.name}
                        </>
                      ) : (
                        <span style={{ opacity: 0.5 }}>Deleted Job</span>
                      )}
                      {run.schedule && (
                        <span className="run-schedule-badge" style={{ marginLeft: 6 }}>
                          via {run.schedule.name}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`run-status-badge status-${run.status}`}>
                        {getStatusLabel(run.status)}
                      </span>
                    </td>
                    <td className="col-date">
                      {run.duration !== undefined ? formatDuration(run.duration) : '—'}
                    </td>
                    <td className="col-date">{formatDistanceToNow(run.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              {filteredRuns.map((run: RunWithJob) => (
                <RunCard
                  key={run._id}
                  run={run}
                  isExpanded={!!(expandedRows as Set<string>).has(run._id)}
                  onToggle={toggleRow}
                  onCancel={handleCancel}
                />
              ))}
            </>
          )}
        </div>
      </div>
      {/* v8 ignore start */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
      {/* v8 ignore stop */}
    </>
  )
}
