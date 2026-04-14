import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TempoDashboardHeader } from './TempoDashboardHeader'

vi.mock('lucide-react', () => ({
  Calendar: () => <span data-testid="icon-calendar" />,
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Grid3X3: () => <span data-testid="icon-grid" />,
  List: () => <span data-testid="icon-list" />,
  Plus: () => <span data-testid="icon-plus" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
}))

const defaultProps = {
  monthLabel: 'April 2026',
  viewMode: 'grid' as const,
  monthLoading: false,
  todayKey: '2026-04-14',
  onPreviousMonth: vi.fn(),
  onCurrentMonth: vi.fn(),
  onNextMonth: vi.fn(),
  onSetViewMode: vi.fn(),
  onAddWorklog: vi.fn(),
  onRefresh: vi.fn(),
}

describe('TempoDashboardHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title', () => {
    render(<TempoDashboardHeader {...defaultProps} />)
    expect(screen.getByText('Tempo Tracking')).toBeInTheDocument()
  })

  it('renders month label', () => {
    render(<TempoDashboardHeader {...defaultProps} />)
    expect(screen.getByText('April 2026')).toBeInTheDocument()
  })

  it('calls onPreviousMonth when previous button is clicked', () => {
    render(<TempoDashboardHeader {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Previous month'))
    expect(defaultProps.onPreviousMonth).toHaveBeenCalledOnce()
  })

  it('calls onNextMonth when next button is clicked', () => {
    render(<TempoDashboardHeader {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(defaultProps.onNextMonth).toHaveBeenCalledOnce()
  })

  it('calls onCurrentMonth when month label button is clicked', () => {
    render(<TempoDashboardHeader {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Go to current month'))
    expect(defaultProps.onCurrentMonth).toHaveBeenCalledOnce()
  })

  it('highlights grid view when viewMode is grid', () => {
    render(<TempoDashboardHeader {...defaultProps} viewMode="grid" />)
    const gridBtn = screen.getByLabelText('Grid view')
    const listBtn = screen.getByLabelText('List view')
    expect(gridBtn.className).toContain('active')
    expect(listBtn.className).not.toContain('active')
  })

  it('highlights list view when viewMode is timeline', () => {
    render(<TempoDashboardHeader {...defaultProps} viewMode="timeline" />)
    const gridBtn = screen.getByLabelText('Grid view')
    const listBtn = screen.getByLabelText('List view')
    expect(gridBtn.className).not.toContain('active')
    expect(listBtn.className).toContain('active')
  })

  it('calls onSetViewMode with "grid" when grid button is clicked', () => {
    render(<TempoDashboardHeader {...defaultProps} viewMode="timeline" />)
    fireEvent.click(screen.getByLabelText('Grid view'))
    expect(defaultProps.onSetViewMode).toHaveBeenCalledWith('grid')
  })

  it('calls onSetViewMode with "timeline" when list button is clicked', () => {
    render(<TempoDashboardHeader {...defaultProps} viewMode="grid" />)
    fireEvent.click(screen.getByLabelText('List view'))
    expect(defaultProps.onSetViewMode).toHaveBeenCalledWith('timeline')
  })

  it('calls onAddWorklog with todayKey when Log Time is clicked', () => {
    render(<TempoDashboardHeader {...defaultProps} />)
    fireEvent.click(screen.getByText('Log Time'))
    expect(defaultProps.onAddWorklog).toHaveBeenCalledWith('2026-04-14')
  })

  it('calls onRefresh when refresh button is clicked', () => {
    render(<TempoDashboardHeader {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Refresh'))
    expect(defaultProps.onRefresh).toHaveBeenCalledOnce()
  })

  it('adds spinning class when monthLoading is true', () => {
    render(<TempoDashboardHeader {...defaultProps} monthLoading={true} />)
    const refreshBtn = screen.getByLabelText('Refresh')
    expect(refreshBtn.className).toContain('spinning')
  })

  it('does not add spinning class when monthLoading is false', () => {
    render(<TempoDashboardHeader {...defaultProps} monthLoading={false} />)
    const refreshBtn = screen.getByLabelText('Refresh')
    expect(refreshBtn.className).not.toContain('spinning')
  })
})
