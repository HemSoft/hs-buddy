import { useState, useMemo } from 'react'
import { History, Trash2 } from 'lucide-react'
import { useRecentRuns, useRunMutations } from '../../hooks/useConvex'
import type { Id } from '../../../convex/_generated/dataModel'
import { RunCard, type RunWithJob } from './run-list/RunCard'
import { RunFilterBar, type StatusFilter } from './run-list/RunFilterBar'
import './RunList.css'

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export function RunList() {
  const runs = useRecentRuns(100)
  const { cancel, cleanup } = useRunMutations()
  const [expandedRows, setExpandedRows] = useState(new Set<string>())
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
      await cancel({ id: runId as Id<'runs'> })
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

        {filteredRuns.map((run: RunWithJob) => (
          <RunCard
            key={run._id}
            run={run}
            isExpanded={!!(expandedRows as Set<string>).has(run._id)}
            onToggle={toggleRow}
            onCancel={handleCancel}
          />
        ))}
      </div>
    </div>
  )
}
