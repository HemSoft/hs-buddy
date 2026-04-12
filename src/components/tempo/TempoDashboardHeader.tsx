import { Calendar, ChevronLeft, ChevronRight, Grid3X3, List, Plus, RefreshCw } from 'lucide-react'

interface TempoDashboardHeaderProps {
  monthLabel: string
  viewMode: 'grid' | 'timeline'
  monthLoading: boolean
  todayKey: string
  onPreviousMonth: () => void
  onCurrentMonth: () => void
  onNextMonth: () => void
  onSetViewMode: (viewMode: 'grid' | 'timeline') => void
  onAddWorklog: (date: string) => void
  onRefresh: () => void
}

export function TempoDashboardHeader({
  monthLabel,
  viewMode,
  monthLoading,
  todayKey,
  onPreviousMonth,
  onCurrentMonth,
  onNextMonth,
  onSetViewMode,
  onAddWorklog,
  onRefresh,
}: TempoDashboardHeaderProps) {
  return (
    <div className="tempo-header">
      <div className="tempo-header-left">
        <h2>Tempo Tracking</h2>
      </div>
      <div className="tempo-header-center">
        <button
          className="tempo-nav-btn"
          onClick={onPreviousMonth}
          title="Previous month"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <button className="tempo-month-label" onClick={onCurrentMonth} title="Go to current month">
          <Calendar size={14} />
          <span>{monthLabel}</span>
        </button>
        <button
          className="tempo-nav-btn"
          onClick={onNextMonth}
          title="Next month"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="tempo-header-right">
        <div className="tempo-view-toggle">
          <button
            className={`tempo-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => onSetViewMode('grid')}
            title="Grid view"
            aria-label="Grid view"
          >
            <Grid3X3 size={14} />
          </button>
          <button
            className={`tempo-view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => onSetViewMode('timeline')}
            title="List view"
            aria-label="List view"
          >
            <List size={14} />
          </button>
        </div>
        <button
          className="tempo-action-btn"
          onClick={() => onAddWorklog(todayKey)}
          title="New worklog"
        >
          <Plus size={14} />
          <span>Log Time</span>
        </button>
        <button
          className={`tempo-action-btn tempo-refresh ${monthLoading ? 'spinning' : ''}`}
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  )
}
