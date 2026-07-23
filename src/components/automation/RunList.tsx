import { Fragment, useState, useMemo } from 'react'
import { History, Trash2 } from 'lucide-react'
import { useRecentRuns, useRunMutations } from '../../hooks/useConvex'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../ConfirmDialog'
import type { Id } from '../../../convex/_generated/dataModel'
import { RunCard, RunCardDetails, type RunWithJob } from './run-list/RunCard'
import { RunFilterBar, type StatusFilter } from './run-list/RunFilterBar'
import { ViewModeToggle } from '../shared/ViewModeToggle'
import { useViewMode } from '../../hooks/useViewMode'
import { getStatusIcon, getStatusLabel } from '../shared/statusDisplay'
import { getWorkerIcon } from './job-list/jobRowUtils'
import { formatDistanceToNow, formatDuration } from '../../utils/dateUtils'
import './RunList.css'
import '../shared/ListView.css'

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

function getFilteredRuns(runs: RunWithJob[] | undefined, statusFilter: StatusFilter): RunWithJob[] {
  if (!runs) return []
  if (statusFilter === 'all') return runs
  return runs.filter(run => run.status === statusFilter)
}

function getStatusCounts(runs: RunWithJob[] | undefined): Record<RunStatus, number> {
  if (!runs) return {} as Record<RunStatus, number>
  const counts: Record<string, number> = {}
  for (const run of runs) {
    counts[run.status] = (counts[run.status] || 0) + 1
  }
  return counts as Record<RunStatus, number>
}

function RunListLoadingState() {
  return (
    <div className="run-list">
      <div className="run-list-loading">
        <div className="loading-spinner" />
        <span>Loading runs…</span>
      </div>
    </div>
  )
}

function RunListEmptyState() {
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

function RunListRowTitle({ run }: { run: RunWithJob }) {
  return (
    <>
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
    </>
  )
}

function getRunTitleText(run: RunWithJob): string {
  return run.job?.name ?? 'Deleted Job'
}

function hasRunDetails(run: RunWithJob): boolean {
  return run.output !== undefined || run.error !== undefined || run.input !== undefined
}

function RunListRowToggle({
  run,
  isExpanded,
  onToggle,
}: {
  run: RunWithJob
  isExpanded: boolean
  onToggle: (runId: string) => void
}) {
  if (!hasRunDetails(run)) {
    return <RunListRowTitle run={run} />
  }

  const detailsId = `run-list-details-${run._id}`

  return (
    <button
      type="button"
      className="run-row-toggle"
      aria-expanded={isExpanded}
      aria-controls={detailsId}
      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${getRunTitleText(run)}`}
      onClick={() => {
        onToggle(run._id)
      }}
    >
      <RunListRowTitle run={run} />
    </button>
  )
}

function RunListTable({
  filteredRuns,
  expandedRows,
  onToggle,
}: {
  filteredRuns: RunWithJob[]
  expandedRows: Set<string>
  onToggle: (runId: string) => void
}) {
  return (
    <table className="list-view-table">
      <thead>
        <tr>
          <th className="col-status" aria-label="Run status"></th>
          <th className="col-title">Name</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Triggered</th>
        </tr>
      </thead>
      <tbody>
        {filteredRuns.map(run => {
          const isExpanded = expandedRows.has(run._id)
          return (
            <Fragment key={run._id}>
              <tr>
                <td className="col-status">{getStatusIcon(run.status)}</td>
                <td className="col-title">
                  <RunListRowToggle run={run} isExpanded={isExpanded} onToggle={onToggle} />
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
              {isExpanded && hasRunDetails(run) && (
                <tr className="run-list-details-row">
                  <td id={`run-list-details-${run._id}`} colSpan={5}>
                    <RunCardDetails run={run} />
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function RunCardsView({
  filteredRuns,
  expandedRows,
  onToggle,
  onCancel,
}: {
  filteredRuns: RunWithJob[]
  expandedRows: Set<string>
  onToggle: (runId: string) => void
  onCancel: (runId: string, e: React.MouseEvent) => void
}) {
  return (
    <>
      {filteredRuns.map(run => (
        <RunCard
          key={run._id}
          run={run}
          isExpanded={expandedRows.has(run._id)}
          onToggle={onToggle}
          onCancel={onCancel}
        />
      ))}
    </>
  )
}

function RunListNoResults({ statusFilter }: { statusFilter: StatusFilter }) {
  if (statusFilter === 'all') return null
  return (
    <div className="run-list-no-results">
      <p>No {statusFilter} runs found.</p>
    </div>
  )
}

function RunListContent({
  filteredRuns,
  statusFilter,
  viewMode,
  expandedRows,
  onToggle,
  onCancel,
}: {
  filteredRuns: RunWithJob[]
  statusFilter: StatusFilter
  viewMode: string
  expandedRows: Set<string>
  onToggle: (runId: string) => void
  onCancel: (runId: string, e: React.MouseEvent) => void
}) {
  return (
    <div className="run-list-content">
      <RunListNoResults statusFilter={statusFilter} />
      {viewMode === 'list' ? (
        <RunListTable filteredRuns={filteredRuns} expandedRows={expandedRows} onToggle={onToggle} />
      ) : (
        <RunCardsView
          filteredRuns={filteredRuns}
          expandedRows={expandedRows}
          onToggle={onToggle}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

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
        console.error('Failed to cleanup runs:', error)
      }
    }
  }

  const filteredRuns = useMemo(
    () => getFilteredRuns(runs as RunWithJob[] | undefined, statusFilter),
    [runs, statusFilter]
  )

  const statusCounts = useMemo(() => getStatusCounts(runs as RunWithJob[] | undefined), [runs])

  if (runs === undefined) {
    return <RunListLoadingState />
  }

  if (runs.length === 0) {
    return <RunListEmptyState />
  }

  return (
    <>
      <div className="run-list">
        <div className="run-list-header">
          <h2>Runs</h2>
          <div className="run-list-header-actions">
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            <button
              aria-label="Cleanup old runs (7+ days)"
              type="button"
              className="btn-icon"
              onClick={handleCleanup}
              title="Cleanup old runs (7+ days)"
            >
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

        <RunListContent
          filteredRuns={filteredRuns}
          statusFilter={statusFilter}
          viewMode={viewMode}
          expandedRows={expandedRows as Set<string>}
          onToggle={toggleRow}
          onCancel={handleCancel}
        />
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  )
}
