import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AutomationSidebarSection } from './AutomationSidebarSection'

const jobs = [
  {
    _id: 'job-exec',
    name: 'Build release',
    description: 'Run the release build',
    workerType: 'exec' as const,
  },
  {
    _id: 'job-ai',
    name: 'Summarize status',
    description: 'Generate a summary',
    workerType: 'ai' as const,
  },
  {
    _id: 'job-skill',
    name: 'Run skill',
    description: 'Execute a skill',
    workerType: 'skill' as const,
  },
]

const schedules = [
  { _id: 'schedule-1', name: 'Nightly sync', description: 'Sync every night', enabled: false },
]

describe('AutomationSidebarSection', () => {
  const onItemSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the top-level items and badge progress counts', () => {
    render(
      <AutomationSidebarSection
        jobs={[]}
        schedules={[]}
        selectedItem="automation-runs"
        onItemSelect={onItemSelect}
        counts={{ 'automation-runs': 3 }}
        badgeProgress={{
          'automation-runs': {
            progress: 75,
            color: '#22c55e',
            tooltip: '75% complete',
          },
        }}
      />
    )

    expect(screen.getByText('Jobs')).toBeTruthy()
    expect(screen.getByText('Schedules')).toBeTruthy()
    expect(screen.getByText('Runs')).toBeTruthy()
    expect(screen.getByTitle('75% complete')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('expands job groups and selects an individual job', () => {
    render(
      <AutomationSidebarSection
        jobs={jobs}
        schedules={[]}
        selectedItem={null}
        onItemSelect={onItemSelect}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand Jobs' }))

    expect(screen.getByRole('button', { name: 'Collapse Jobs' })).toBeTruthy()
    expect(screen.getByText('Shell Commands')).toBeTruthy()
    expect(screen.getByText('AI Prompts')).toBeTruthy()
    expect(screen.getByText('Claude Skills')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Shell Commands/ }))
    fireEvent.click(screen.getByText('Build release'))

    expect(onItemSelect).toHaveBeenCalledWith('job-detail:job-exec')
  })

  it('expands schedules, selects the section, and shows disabled schedules', () => {
    render(
      <AutomationSidebarSection
        jobs={[]}
        schedules={schedules}
        selectedItem={null}
        onItemSelect={onItemSelect}
      />
    )

    fireEvent.click(screen.getByText('Schedules').closest('button')!)

    expect(onItemSelect).toHaveBeenCalledWith('automation-schedules')
    expect(screen.getByRole('button', { name: 'Collapse Schedules' })).toBeTruthy()
    expect(screen.getByText('Nightly sync')).toBeTruthy()
    expect(screen.getByText('off')).toBeTruthy()

    fireEvent.click(screen.getByText('Nightly sync'))

    expect(onItemSelect).toHaveBeenCalledWith('schedule-detail:schedule-1')
  })

  it('selects runs from the top-level list', () => {
    render(
      <AutomationSidebarSection
        jobs={[]}
        schedules={[]}
        selectedItem={null}
        onItemSelect={onItemSelect}
      />
    )

    fireEvent.click(screen.getByText('Runs').closest('button')!)

    expect(onItemSelect).toHaveBeenCalledWith('automation-runs')
  })

  it('handles null jobs and schedules gracefully', () => {
    render(
      <AutomationSidebarSection
        jobs={null}
        schedules={null}
        selectedItem={null}
        onItemSelect={onItemSelect}
      />
    )
    // No disclosure buttons when jobs/schedules are null
    expect(screen.queryByRole('button', { name: /Expand Jobs/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Expand Schedules/ })).toBeNull()
  })

  it('shows count badge without progress ring when badgeProgress is absent', () => {
    render(
      <AutomationSidebarSection
        jobs={[]}
        schedules={[]}
        selectedItem={null}
        onItemSelect={onItemSelect}
        counts={{ 'automation-runs': 5 }}
      />
    )
    expect(screen.getByText('5')).toBeTruthy()
    // No progress ring tooltip
    expect(screen.queryByTitle(/complete/)).toBeNull()
  })

  it('highlights selected schedule and job items', () => {
    render(
      <AutomationSidebarSection
        jobs={jobs}
        schedules={[{ _id: 'sch-1', name: 'Daily', enabled: true }]}
        selectedItem="schedule-detail:sch-1"
        onItemSelect={onItemSelect}
      />
    )
    // Expand schedules
    fireEvent.click(screen.getByText('Schedules').closest('button')!)
    const scheduleBtn = screen.getByText('Daily').closest('button')!
    expect(scheduleBtn.className).toContain('selected')
    // Enabled schedule should not show "off"
    expect(screen.queryByText('off')).toBeNull()
  })

  it('highlights selected job item and uses name as fallback title', () => {
    render(
      <AutomationSidebarSection
        jobs={[{ _id: 'j1', name: 'My Job', workerType: 'exec' }]}
        schedules={[]}
        selectedItem="job-detail:j1"
        onItemSelect={onItemSelect}
      />
    )
    // Expand jobs, then expand Shell Commands
    fireEvent.click(screen.getByRole('button', { name: 'Expand Jobs' }))
    fireEvent.click(screen.getByText('Shell Commands'))
    const jobBtn = screen.getByText('My Job').closest('button')!
    expect(jobBtn.className).toContain('selected')
    // No description → title falls back to name
    expect(jobBtn.getAttribute('title')).toBe('My Job')
  })

  it('toggles jobs section closed when clicking main button', () => {
    render(
      <AutomationSidebarSection
        jobs={jobs}
        schedules={[]}
        selectedItem={null}
        onItemSelect={onItemSelect}
      />
    )
    // Open
    fireEvent.click(screen.getByText('Jobs').closest('button')!)
    expect(screen.getByText('Shell Commands')).toBeTruthy()
    // Close
    fireEvent.click(screen.getByText('Jobs').closest('button')!)
    expect(screen.queryByText('Shell Commands')).toBeNull()
  })
})
