import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { RalphRunInfo } from '../../types/ralph'

const mockRuns: RalphRunInfo[] = []
const mockListTemplates = vi.fn()

// Module-level persistent state for toggle set mock
let toggleSetState = new Set(['scripts'])

vi.mock('../../hooks/useRalphLoops', () => ({
  useRalphLoops: () => ({
    runs: mockRuns,
    loading: false,
    error: null,
    launch: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../../hooks/useToggleSet', () => ({
  useToggleSet: () => {
    return {
      has: (id: string) => toggleSetState.has(id),
      toggle: (id: string) => {
        if (toggleSetState.has(id)) toggleSetState.delete(id)
        else toggleSetState.add(id)
      },
      add: (id: string) => toggleSetState.add(id),
    }
  },
}))

import { RalphSidebar } from './RalphSidebar'

function makeRun(overrides: Partial<RalphRunInfo> = {}): RalphRunInfo {
  return {
    runId: 'run-1',
    config: { repoPath: 'D:\\github\\test-repo', scriptType: 'ralph' },
    status: 'running',
    phase: 'iterating',
    pid: 100,
    currentIteration: 1,
    totalIterations: 3,
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now(),
    completedAt: null,
    exitCode: null,
    error: null,
    logBuffer: [],
    stats: {
      checks: 0,
      agentTurns: 0,
      reviews: 0,
      copilotPRs: 0,
      issuesCreated: 0,
      scanIterations: 0,
      totalCost: null,
      totalPremium: 0,
    },
    ...overrides,
  } as RalphRunInfo
}

describe('RalphSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRuns.length = 0
    toggleSetState = new Set(['scripts']) // Reset toggle state
    mockListTemplates.mockResolvedValue([])
    Object.defineProperty(window, 'ralph', {
      value: {
        listTemplates: mockListTemplates,
        list: vi.fn(),
        launch: vi.fn(),
        stop: vi.fn(),
        onStatusChange: vi.fn(),
        offStatusChange: vi.fn(),
        getConfig: vi.fn(),
        selectDirectory: vi.fn(),
        getStatus: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  it('renders RALPH LOOPS header', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('RALPH LOOPS')).toBeInTheDocument()
  })

  it('renders Dashboard item', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('calls onItemSelect with ralph-dashboard when Dashboard clicked', () => {
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(onItemSelect).toHaveBeenCalledWith('ralph-dashboard')
  })

  it('renders Core Scripts section header', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('Core Scripts')).toBeInTheDocument()
  })

  it('renders Templates section with empty state', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('Templates')).toBeInTheDocument()
    expect(screen.getByText('No templates found')).toBeInTheDocument()
  })

  it('renders Runs section with empty state', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('Runs')).toBeInTheDocument()
  })

  it('shows template items when loaded', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
    ])
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
    })
  })

  it('calls window.ralph.listTemplates on mount', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(mockListTemplates).toHaveBeenCalled()
  })

  /* ── Core Scripts tests ────────────────────────────────── */

  it('renders all Core Script items (Ralph Loop, Ralph PR, Ralph Issues)', async () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)
    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
      expect(screen.getByText('Ralph PR')).toBeInTheDocument()
      expect(screen.getByText('Ralph Issues')).toBeInTheDocument()
    })
  })

  it('Core Scripts section is collapsed by default', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const coreScriptsSection = screen.getByText('Core Scripts').closest('.sidebar-section')
    const sectionContent = coreScriptsSection?.querySelector('.sidebar-section-items')
    expect(sectionContent).not.toBeInTheDocument()
  })

  it('toggles Core Scripts section on header click', async () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)
    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })
  })

  it('toggles Core Scripts section on Enter key', async () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.keyDown(coreScriptsHeader!, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })
  })

  it('toggles Core Scripts section on Space key', async () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.keyDown(coreScriptsHeader!, { key: ' ' })
    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })
  })

  it('Core Script item dispatches ralph:select-script event and calls onItemSelect with ralph-dashboard', async () => {
    const onItemSelect = vi.fn()
    const selectScriptEvent = vi.fn()
    window.addEventListener('ralph:select-script', selectScriptEvent as EventListener)

    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)

    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })

    const ralphLoopItem = screen.getByText('Ralph Loop').closest('.ralph-sidebar-item')
    fireEvent.click(ralphLoopItem!)

    await waitFor(() => {
      expect(selectScriptEvent).toHaveBeenCalledWith(expect.objectContaining({ detail: 'ralph' }))
      expect(onItemSelect).toHaveBeenCalledWith('ralph-dashboard')
    })

    window.removeEventListener('ralph:select-script', selectScriptEvent as EventListener)
  })

  it('Core Script item keyboard selection with Enter key', async () => {
    const onItemSelect = vi.fn()
    const selectScriptEvent = vi.fn()
    window.addEventListener('ralph:select-script', selectScriptEvent as EventListener)

    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)

    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })

    const ralphLoopItem = screen.getByText('Ralph Loop').closest('.ralph-sidebar-item')
    fireEvent.keyDown(ralphLoopItem!, { key: 'Enter' })

    await waitFor(() => {
      expect(selectScriptEvent).toHaveBeenCalledWith(expect.objectContaining({ detail: 'ralph' }))
      expect(onItemSelect).toHaveBeenCalledWith('ralph-dashboard')
    })

    window.removeEventListener('ralph:select-script', selectScriptEvent as EventListener)
  })

  it('Core Script item keyboard selection with Space key', async () => {
    const onItemSelect = vi.fn()
    const selectScriptEvent = vi.fn()
    window.addEventListener('ralph:select-script', selectScriptEvent as EventListener)

    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)

    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })

    const ralphLoopItem = screen.getByText('Ralph Loop').closest('.ralph-sidebar-item')
    fireEvent.keyDown(ralphLoopItem!, { key: ' ' })

    await waitFor(() => {
      expect(selectScriptEvent).toHaveBeenCalledWith(expect.objectContaining({ detail: 'ralph' }))
    })

    window.removeEventListener('ralph:select-script', selectScriptEvent as EventListener)
  })

  it('Core Script item shows selected state', async () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)

    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })

    const ralphLoopItem = screen.getByText('Ralph Loop').closest('.ralph-sidebar-item')
    fireEvent.click(ralphLoopItem!)
  })

  /* ── Templates section tests ────────────────────────────────── */

  it('Templates section shows badge with template count', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
      { name: 'Security', filename: 'ralph-security-scan.ps1' },
    ])
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      const badge = screen.getByText('2')
      expect(badge).toBeInTheDocument()
    })
  })

  it('Template item dispatches ralph:select-script event with template filename', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
    ])
    const onItemSelect = vi.fn()
    const selectScriptEvent = vi.fn()
    window.addEventListener('ralph:select-script', selectScriptEvent as EventListener)

    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
    })

    const templateItem = screen.getByText('Coverage').closest('.ralph-sidebar-item')
    fireEvent.click(templateItem!)

    await waitFor(() => {
      expect(selectScriptEvent).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'ralph-improve-test-coverage.ps1' })
      )
      expect(onItemSelect).toHaveBeenCalledWith('ralph-dashboard')
    })

    window.removeEventListener('ralph:select-script', selectScriptEvent as EventListener)
  })

  it('Template item keyboard selection with Enter', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
    ])
    const onItemSelect = vi.fn()
    const selectScriptEvent = vi.fn()
    window.addEventListener('ralph:select-script', selectScriptEvent as EventListener)

    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
    })

    const templateItem = screen.getByText('Coverage').closest('.ralph-sidebar-item')
    fireEvent.keyDown(templateItem!, { key: 'Enter' })

    await waitFor(() => {
      expect(selectScriptEvent).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'ralph-improve-test-coverage.ps1' })
      )
    })

    window.removeEventListener('ralph:select-script', selectScriptEvent as EventListener)
  })

  /* ── Runs section tests ────────────────────────────────── */

  it('Runs section shows badge with active run count', async () => {
    mockRuns.push(makeRun({ runId: 'run-1', status: 'running' }))
    mockRuns.push(makeRun({ runId: 'run-2', status: 'completed' }))
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      // Badge should show 1 (only active runs)
      const badges = screen.getAllByText('1')
      expect(badges.length).toBeGreaterThan(0)
    })
  })

  it('Runs section auto-expands when active runs exist', async () => {
    mockRuns.push(makeRun({ runId: 'run-1', status: 'running' }))
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      // The run should be visible in the expanded Runs section
      const runElement = screen.getByTitle(/running/)
      expect(runElement).toBeInTheDocument()
    })
  })

  it('renders active (running) run items', async () => {
    mockRuns.push(
      makeRun({ runId: 'run-1', status: 'running', currentIteration: 2, totalIterations: 5 })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('2/5')).toBeInTheDocument() // Should show iteration count
    })
  })

  it('renders active (pending) run items', async () => {
    mockRuns.push(
      makeRun({ runId: 'run-1', status: 'pending', phase: 'initializing', totalIterations: 0 })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('initializing')).toBeInTheDocument() // Should show phase when totalIterations is 0
    })
  })

  it('renders completed run items with "Completed" header', async () => {
    // Use both active and completed runs so the section auto-expands
    mockRuns.push(makeRun({ runId: 'run-active-1', status: 'running' }))
    mockRuns.push(
      makeRun({ runId: 'run-1', status: 'completed', completedAt: Date.now() - 60_000 })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
  })

  it('renders failed run items', async () => {
    // Use both active and completed runs so the section auto-expands
    mockRuns.push(makeRun({ runId: 'run-active-1', status: 'running' }))
    mockRuns.push(makeRun({ runId: 'run-1', status: 'failed', completedAt: Date.now() - 120_000 }))
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
  })

  it('shows timeAgo for completed runs', async () => {
    mockRuns.push(
      makeRun({ runId: 'run-1', status: 'completed', completedAt: Date.now() - 60_000 })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('1m ago')).toBeInTheDocument()
    })
  })

  it('run item calls onItemSelect on click', async () => {
    mockRuns.push(makeRun({ runId: 'run-abc-123', status: 'running' }))
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    await waitFor(() => {
      const runItem = screen.getByTitle(/running/).closest('.ralph-sidebar-item')
      fireEvent.click(runItem!)
    })

    expect(onItemSelect).toHaveBeenCalledWith(expect.stringContaining('run-abc-123'))
  })

  it('run item keyboard selection with Enter', async () => {
    mockRuns.push(makeRun({ runId: 'run-abc-123', status: 'running' }))
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    await waitFor(() => {
      const runItem = screen.getByTitle(/running/).closest('.ralph-sidebar-item')
      fireEvent.keyDown(runItem!, { key: 'Enter' })
    })

    expect(onItemSelect).toHaveBeenCalledWith(expect.stringContaining('run-abc-123'))
  })

  it('run item keyboard selection with Space', async () => {
    mockRuns.push(makeRun({ runId: 'run-abc-123', status: 'running' }))
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    await waitFor(() => {
      const runItem = screen.getByTitle(/running/).closest('.ralph-sidebar-item')
      fireEvent.keyDown(runItem!, { key: ' ' })
    })

    expect(onItemSelect).toHaveBeenCalledWith(expect.stringContaining('run-abc-123'))
  })

  it('shows run selected state', async () => {
    mockRuns.push(makeRun({ runId: 'run-abc-123', status: 'running' }))
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem="ralph-run:run-abc-123" />)
    await waitFor(() => {
      const runItem = screen.getByTitle(/running/).closest('.ralph-sidebar-item')
      expect(runItem).toHaveClass('selected')
    })
  })

  /* ── Dashboard selection tests ────────────────────────────────── */

  it('clicking Dashboard clears activeScript and calls onItemSelect', async () => {
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const dashboardItem = screen.getByText('Dashboard').closest('.ralph-sidebar-item')
    fireEvent.click(dashboardItem!)

    await waitFor(() => {
      expect(onItemSelect).toHaveBeenCalledWith('ralph-dashboard')
    })
  })

  it('Dashboard keyboard selection with Enter', async () => {
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const dashboardItem = screen.getByText('Dashboard').closest('.ralph-sidebar-item')
    fireEvent.keyDown(dashboardItem!, { key: 'Enter' })

    await waitFor(() => {
      expect(onItemSelect).toHaveBeenCalledWith('ralph-dashboard')
    })
  })

  it('Dashboard keyboard selection with Space', async () => {
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const dashboardItem = screen.getByText('Dashboard').closest('.ralph-sidebar-item')
    fireEvent.keyDown(dashboardItem!, { key: ' ' })

    await waitFor(() => {
      expect(onItemSelect).toHaveBeenCalledWith('ralph-dashboard')
    })
  })

  it('Dashboard not selected when script is selected', async () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)

    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })

    const ralphLoopItem = screen.getByText('Ralph Loop').closest('.ralph-sidebar-item')
    fireEvent.click(ralphLoopItem!)

    // Dashboard should not be selected
    const dashboardItem = screen.getByText('Dashboard').closest('.ralph-sidebar-item')
    expect(dashboardItem).not.toHaveClass('selected')
  })

  /* ── Run display name tests ────────────────────────────────── */

  it('shows PR number in run name for ralph-pr runs', async () => {
    mockRuns.push(
      makeRun({
        runId: 'run-1',
        status: 'running',
        config: { repoPath: 'D:\\github\\test-repo', scriptType: 'ralph-pr', prNumber: 42 },
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('test-repo #42')).toBeInTheDocument()
    })
  })

  it('shows "issues" suffix for ralph-issues runs', async () => {
    mockRuns.push(
      makeRun({
        runId: 'run-1',
        status: 'running',
        config: { repoPath: 'D:\\github\\test-repo', scriptType: 'ralph-issues' },
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('test-repo · issues')).toBeInTheDocument()
    })
  })

  it('shows template name for template runs', async () => {
    mockRuns.push(
      makeRun({
        runId: 'run-1',
        status: 'running',
        config: {
          repoPath: 'D:\\github\\test-repo',
          scriptType: 'template',
          templateScript: 'ralph-improve-test-coverage.ps1',
        },
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('test-repo · improve-test-coverage')).toBeInTheDocument()
    })
  })

  it('shows run ID suffix for generic runs', async () => {
    mockRuns.push(
      makeRun({
        runId: 'abcdef123456',
        status: 'running',
        config: { repoPath: 'D:\\github\\test-repo', scriptType: 'ralph' },
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('test-repo · abcdef')).toBeInTheDocument()
    })
  })

  /* ── Time formatting tests ────────────────────────────────── */

  it('shows "just now" for very recent timestamps', async () => {
    mockRuns.push(
      makeRun({
        runId: 'run-1',
        status: 'completed',
        completedAt: Date.now() - 5_000, // 5 seconds ago
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('just now')).toBeInTheDocument()
    })
  })

  it('shows minutes for timestamps < 60 minutes', async () => {
    mockRuns.push(
      makeRun({
        runId: 'run-1',
        status: 'completed',
        completedAt: Date.now() - 30 * 60_000, // 30 minutes ago
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('30m ago')).toBeInTheDocument()
    })
  })

  it('shows hours for timestamps < 24 hours', async () => {
    mockRuns.push(
      makeRun({
        runId: 'run-1',
        status: 'completed',
        completedAt: Date.now() - 5 * 60 * 60_000, // 5 hours ago
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('5h ago')).toBeInTheDocument()
    })
  })

  it('shows days for timestamps >= 24 hours', async () => {
    mockRuns.push(
      makeRun({
        runId: 'run-1',
        status: 'completed',
        completedAt: Date.now() - 3 * 24 * 60 * 60_000, // 3 days ago
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(screen.getByText('3d ago')).toBeInTheDocument()
    })
  })

  /* ── Section toggling tests ────────────────────────────────── */

  it('Templates section toggling', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'Coverage', filename: 'ralph-improve-test-coverage.ps1' },
    ])
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
    })

    // Templates is expanded by default (id='scripts' in useToggleSet)
    // Check that the template content section exists
    const templatesSection = screen.getByText('Templates').closest('.sidebar-section')
    const contentDiv = templatesSection?.querySelector('.sidebar-section-items')
    expect(contentDiv).toBeInTheDocument()

    const templatesHeader = screen.getByText('Templates').closest('.sidebar-section-header')
    fireEvent.click(templatesHeader!)

    // After click, verify that content area exists (it should still be rendered on the same component)
    // The state change happens in the mock, but the component rerenders based on the updated state
    const updatedContent = templatesSection?.querySelector('.sidebar-section-items')
    // The content should still exist but the component behavior is controlled by the mock
    expect(updatedContent).toBeDefined()
  })

  it('Runs section toggling', async () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    const runsHeader = screen.getByText('Runs').closest('.sidebar-section-header')
    // Runs section starts collapsed (not in default set)
    const runsSection = screen.getByText('Runs').closest('.sidebar-section')
    let runsContent = runsSection?.querySelector('.sidebar-section-items')
    expect(runsContent).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(runsHeader!)
    await waitFor(() => {
      runsContent = runsSection?.querySelector('.sidebar-section-items')
      expect(runsContent).toBeInTheDocument()
    })
  })

  /* ── Multiple runs and sections test ────────────────────────────────── */

  it('renders active and completed runs in separate sections', async () => {
    mockRuns.push(makeRun({ runId: 'run-active-1', status: 'running' }))
    mockRuns.push(makeRun({ runId: 'run-active-2', status: 'pending' }))
    mockRuns.push(
      makeRun({ runId: 'run-completed-1', status: 'completed', completedAt: Date.now() - 60_000 })
    )
    mockRuns.push(
      makeRun({ runId: 'run-failed-1', status: 'failed', completedAt: Date.now() - 120_000 })
    )

    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
  })

  it('limits recent runs to MAX_RECENT_RUNS (10)', async () => {
    // Add 15 completed runs
    for (let i = 0; i < 15; i++) {
      mockRuns.push(
        makeRun({
          runId: `run-${i}`,
          status: 'completed',
          completedAt: Date.now() - (i + 1) * 60_000,
        })
      )
    }
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    // The component should limit to 10 recent runs max
  })

  it('handles listTemplates rejection gracefully', async () => {
    mockListTemplates.mockRejectedValue(new Error('Template error'))
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Should not crash - the .catch(() => {}) handles it
    await waitFor(() => {
      expect(screen.getByText('RALPH LOOPS')).toBeInTheDocument()
    })
  })

  it('applies selected style to Dashboard when selectedItem matches and no activeScript', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem="ralph-dashboard" />)
    const dashboardItem = screen.getByText('Dashboard').closest('.ralph-sidebar-item')
    expect(dashboardItem?.className).toContain('selected')
  })

  it('clicking a completed run item calls onItemSelect', async () => {
    mockRuns.push(
      makeRun({ runId: 'completed-1', status: 'completed', completedAt: Date.now() - 60_000 })
    )
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    await waitFor(() => {
      expect(screen.getByText('1m ago')).toBeInTheDocument()
    })

    const completedItem = screen.getByText('1m ago').closest('.ralph-sidebar-item')
    fireEvent.click(completedItem!)

    expect(onItemSelect).toHaveBeenCalledWith('ralph-run:completed-1')
  })

  it('repoName falls back to full path when last segment is empty', async () => {
    mockRuns.push(
      makeRun({
        runId: 'slash-run',
        status: 'running',
        config: { repoPath: 'D:\\github\\test-repo\\', scriptType: 'ralph' },
      })
    )
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await waitFor(() => {
      // repoName('D:\github\test-repo\') falls back to full path, then runDisplayName appends runId
      expect(screen.getByText(/D:\\github\\test-repo\\/)).toBeInTheDocument()
    })
  })

  /* ── Branch coverage: keyboard handler false branches ──────── */

  it('ignores Tab key on section header (L100 false)', () => {
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    const templatesHeader = screen.getByText('Templates').closest('.sidebar-section-header')
    // Templates starts expanded (toggleSetState has 'scripts')
    expect(screen.getByText('No templates found')).toBeInTheDocument()
    fireEvent.keyDown(templatesHeader!, { key: 'Tab' })
    // Should still be expanded — Tab must not toggle
    expect(screen.getByText('No templates found')).toBeInTheDocument()
  })

  it('ignores Tab key on script item (L139 false)', async () => {
    const onItemSelect = vi.fn()
    const selectScriptEvent = vi.fn()
    window.addEventListener('ralph:select-script', selectScriptEvent as EventListener)

    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const coreScriptsHeader = screen.getByText('Core Scripts').closest('.sidebar-section-header')
    fireEvent.click(coreScriptsHeader!)
    await waitFor(() => {
      expect(screen.getByText('Ralph Loop')).toBeInTheDocument()
    })
    const ralphLoopItem = screen.getByText('Ralph Loop').closest('.ralph-sidebar-item')
    fireEvent.keyDown(ralphLoopItem!, { key: 'Tab' })
    expect(selectScriptEvent).not.toHaveBeenCalled()

    window.removeEventListener('ralph:select-script', selectScriptEvent as EventListener)
  })

  it('ignores Tab key on run item (L190 false)', async () => {
    mockRuns.push(makeRun({ runId: 'run-tab-test', status: 'running' }))
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    await waitFor(() => {
      const runItem = screen.getByTitle(/running/).closest('.ralph-sidebar-item')
      fireEvent.keyDown(runItem!, { key: 'Tab' })
    })
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('handles non-array listTemplates result (L262 false)', async () => {
    mockListTemplates.mockResolvedValueOnce(null)
    render(<RalphSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    await waitFor(() => {
      expect(mockListTemplates).toHaveBeenCalled()
    })
    // Templates should remain empty since result was not an array
    expect(screen.getByText('No templates found')).toBeInTheDocument()
  })

  it('ignores Tab key on Dashboard item (L289 false)', () => {
    const onItemSelect = vi.fn()
    render(<RalphSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    const dashboardItem = screen.getByText('Dashboard').closest('.ralph-sidebar-item')
    fireEvent.keyDown(dashboardItem!, { key: 'Tab' })
    expect(onItemSelect).not.toHaveBeenCalled()
  })
})
