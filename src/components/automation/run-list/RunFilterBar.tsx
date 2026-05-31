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

function getFilterButtonCount(
  value: StatusFilter,
  totalCount: number,
  statusCounts: Record<string, number>
): number {
  if (value === 'all') return totalCount
  return statusCounts[value as RunStatus] || 0
}

function getFilterButtonClassName(statusFilter: StatusFilter, value: StatusFilter): string {
  const stateClass = statusFilter === value ? 'active' : ''
  const variantClass = value === 'all' ? '' : `filter-${value}`
  return `filter-btn ${stateClass} ${variantClass}`.trim()
}

function FilterCount({ count }: { count: number }) {
  if (count <= 0) return null
  return <span className="filter-count">{count}</span>
}

function FilterButton({
  label,
  value,
  statusFilter,
  totalCount,
  statusCounts,
  onFilterChange,
}: {
  label: string
  value: StatusFilter
  statusFilter: StatusFilter
  totalCount: number
  statusCounts: Record<string, number>
  onFilterChange: (filter: StatusFilter) => void
}) {
  const count = getFilterButtonCount(value, totalCount, statusCounts)
  const className = getFilterButtonClassName(statusFilter, value)

  return (
    <button type="button" className={className} onClick={() => onFilterChange(value)}>
      {label}
      <FilterCount count={count} />
    </button>
  )
}

export function RunFilterBar({
  statusFilter,
  totalCount,
  statusCounts,
  onFilterChange,
}: RunFilterBarProps) {
  return (
    <div className="run-filter-bar">
      <Filter size={14} className="filter-icon" />
      {filterButtons.map(({ label, value }) => (
        <FilterButton
          key={value}
          label={label}
          value={value}
          statusFilter={statusFilter}
          totalCount={totalCount}
          statusCounts={statusCounts}
          onFilterChange={onFilterChange}
        />
      ))}
    </div>
  )
}
