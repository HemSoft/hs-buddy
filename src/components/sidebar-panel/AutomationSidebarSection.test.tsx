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
})
