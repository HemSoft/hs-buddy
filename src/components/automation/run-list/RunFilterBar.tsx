import { Filter } from 'lucide-react'

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type StatusFilter = 'all' | RunStatus

interface RunFilterBarProps {
  statusFilter: StatusFilter
  totalCount: number
  statusCounts: Record<string, number>
  onFilterChange: (filter: StatusFilter) => void
}

const filterButtons: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
]

export function RunFilterBar({ statusFilter, totalCount, statusCounts, onFilterChange }: RunFilterBarProps) {
  return (
    <div className="run-filter-bar">
      <Filter size={14} className="filter-icon" />
      {filterButtons.map(({ label, value }) => {
        const count = value === 'all' ? totalCount : statusCounts[value as RunStatus] || 0
        return (
          <button
            key={value}
            className={`filter-btn ${statusFilter === value ? 'active' : ''} ${value !== 'all' ? `filter-${value}` : ''}`}
            onClick={() => onFilterChange(value)}
          >
            {label}
            {count > 0 && <span className="filter-count">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
