import { useReducer, useCallback, useState, useEffect } from 'react'
import { RefreshCw, Plus, Play, FileCode2 } from 'lucide-react'
import { useRalphLoops } from '../../hooks/useRalphLoops'
import { RalphLoopCard } from './RalphLoopCard'
import { RalphLaunchForm } from './RalphLaunchForm'
import type { RalphRunInfo, RalphTemplateInfo } from '../../types/ralph'
import './RalphDashboard.css'

type ViewMode = 'grid' | 'launch'

interface PRLaunchData {
  prNumber: number
  repository: string
  org: string
  repoPath: string
}

interface IssueLaunchData {
  issueNumber: number
  issueTitle: string
  issueBody: string
  repository: string
  org: string
  repoPath: string
}

interface DashboardState {
  viewMode: ViewMode
  error: string | null
  selectedScript: string | null
  prLaunchData: PRLaunchData | null
  issueLaunchData: IssueLaunchData | null
}

type DashboardAction =
  | {
      type: 'setView'
      mode: ViewMode
      script?: string
      prLaunchData?: PRLaunchData
      issueLaunchData?: IssueLaunchData
    }
  | { type: 'setError'; error: string | null }

function reducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'setView':
      return {
        ...state,
        viewMode: action.mode,
        selectedScript: action.script ?? null,
        prLaunchData: action.prLaunchData ?? null,
        issueLaunchData: action.issueLaunchData ?? null,
      }
    case 'setError':
      return { ...state, error: action.error }
  }
}

function partitionRuns(runs: RalphRunInfo[]): {
  active: RalphRunInfo[]
  recent: RalphRunInfo[]
} {
  const active: RalphRunInfo[] = []
  const recent: RalphRunInfo[] = []
  for (const run of runs) {
    if (run.status === 'running' || run.status === 'pending') {
      active.push(run)
    } else {
      recent.push(run)
    }
  }
  return { active, recent }
}

interface RalphDashboardProps {
  onOpenTab?: (viewId: string) => void
}

export function RalphDashboard({ onOpenTab }: RalphDashboardProps) {
  const { runs, loading, error: hookError, launch, stop, refresh } = useRalphLoops()
  const [state, dispatch] = useReducer(reducer, {
    viewMode: 'grid',
    error: null,
    selectedScript: null,
    prLaunchData: null,
    issueLaunchData: null,
  })
  const [templates, setTemplates] = useState<RalphTemplateInfo[]>([])

  useEffect(() => {
    window.ralph
      .listTemplates()
      .then(result => {
        if (Array.isArray(result)) setTemplates(result)
      })
      .catch(() => {})
  }, [])

  // Listen for sidebar script selection events
  useEffect(() => {
    const handler = (e: Event) => {
      const script = (e as CustomEvent<string>).detail
      dispatch({ type: 'setView', mode: 'launch', script })
    }
    window.addEventListener('ralph:select-script', handler)
    return () => window.removeEventListener('ralph:select-script', handler)
  }, [])

  // Listen for PR detail "Start Ralph Review" action
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<PRLaunchData>).detail
      dispatch({ type: 'setView', mode: 'launch', script: 'ralph-pr', prLaunchData: data })
    }
    window.addEventListener('ralph:launch-pr-review', handler)
    return () => window.removeEventListener('ralph:launch-pr-review', handler)
  }, [])

  // Listen for Issue detail "Start Ralph Loop" action
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<IssueLaunchData>).detail
      dispatch({ type: 'setView', mode: 'launch', script: 'ralph', issueLaunchData: data })
    }
    window.addEventListener('ralph:launch-from-issue', handler)
    return () => window.removeEventListener('ralph:launch-from-issue', handler)
  }, [])

  const handleStop = useCallback(
    async (runId: string) => {
      const result = await stop(runId)
      if (!result.success) {
        dispatch({ type: 'setError', error: result.error ?? 'Stop failed' })
      }
    },
    [stop]
  )

  const handleLaunched = useCallback(
    (runId?: string) => {
      dispatch({ type: 'setView', mode: 'grid' })
      if (runId && onOpenTab) onOpenTab(`ralph-run:${runId}`)
    },
    [onOpenTab]
  )

  const { active, recent } = partitionRuns(runs)
  const displayError = state.error ?? hookError

  if (loading) {
    return (
      <div className="ralph-dashboard ralph-loading">
        <RefreshCw size={20} className="ralph-spin" />
        <span>Loading loops…</span>
      </div>
    )
  }

  return (
    <div className="ralph-dashboard">
      <div className="ralph-dashboard-header">
        <h2>Ralph Loops</h2>
        <div className="ralph-dashboard-actions">
          <button className="ralph-action-btn" onClick={refresh} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            className={`ralph-action-btn ralph-primary ${state.viewMode === 'launch' ? 'active' : ''}`}
            onClick={() =>
              dispatch({
                type: 'setView',
                mode: state.viewMode === 'launch' ? 'grid' : 'launch',
              })
            }
          >
            <Plus size={14} />
            New Loop
          </button>
        </div>
      </div>

      <div className="ralph-dashboard-body">
        {displayError && (
          <div className="ralph-error-banner">
            {displayError}
            <button onClick={() => dispatch({ type: 'setError', error: null })}>×</button>
          </div>
        )}

        {state.viewMode === 'launch' && (
          <RalphLaunchForm
            initialScript={state.selectedScript}
            initialPR={state.prLaunchData}
            initialIssue={state.issueLaunchData}
            onLaunch={async config => {
              const result = await launch(config)
              if (result.success) handleLaunched(result.runId)
              return result
            }}
          />
        )}

        {/* Available Scripts */}
        {(templates.length > 0 || !loading) && (
          <section className="ralph-section">
            <h3 className="ralph-section-title">Available Scripts ({3 + templates.length})</h3>
            <div className="ralph-card-grid">
              <ScriptCard
                name="Ralph Loop"
                description="Full autonomous loop — issue triage, coding, PR creation, and review resolution"
                filename="ralph"
                onLaunch={() => dispatch({ type: 'setView', mode: 'launch', script: 'ralph' })}
              />
              <ScriptCard
                name="Ralph PR"
                description="PR-only loop — create and shepherd a PR through review for a given prompt"
                filename="ralph-pr"
                onLaunch={() => dispatch({ type: 'setView', mode: 'launch', script: 'ralph-pr' })}
              />
              <ScriptCard
                name="Ralph Issues"
                description="Scan codebase and create GitHub Issues for findings"
                filename="ralph-issues"
                onLaunch={() =>
                  dispatch({ type: 'setView', mode: 'launch', script: 'ralph-issues' })
                }
              />
              {templates.map(t => (
                <ScriptCard
                  key={t.filename}
                  name={t.name}
                  description={describeTemplate(t.filename)}
                  filename={t.filename}
                  onLaunch={() => dispatch({ type: 'setView', mode: 'launch', script: t.filename })}
                />
              ))}
            </div>
          </section>
        )}

        {active.length > 0 && (
          <section className="ralph-section">
            <h3 className="ralph-section-title">Active ({active.length})</h3>
            <div className="ralph-card-grid">
              {active.map(run => (
                <RalphLoopCard key={run.runId} run={run} onStop={handleStop} />
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="ralph-section">
            <h3 className="ralph-section-title">Recent ({recent.length})</h3>
            <div className="ralph-card-grid">
              {recent.map(run => (
                <RalphLoopCard key={run.runId} run={run} onStop={handleStop} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Script Card ──────────────────────────────────────────────────

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  'ralph-improve-crap-score.ps1':
    'Reduce CRAP scores by improving test coverage and reducing complexity',
  'ralph-improve-quality.ps1': 'Improve overall code quality — linting, best practices, clean code',
  'ralph-improve-react-doctor-score.ps1': 'Fix React anti-patterns flagged by react-doctor',
  'ralph-improve-scorecard-score.ps1': 'Improve org-metrics engineering scorecard score',
  'ralph-improve-test-coverage.ps1': 'Add missing unit tests to increase code coverage',
  'ralph-simplisticate.ps1': 'Simplify complex code — reduce cyclomatic complexity and nesting',
  'ralph-run-all.ps1': 'Run all improvement scripts in sequence across a repo',
}

function describeTemplate(filename: string): string {
  return TEMPLATE_DESCRIPTIONS[filename] ?? 'Template improvement loop'
}

function ScriptCard({
  name,
  description,
  filename,
  onLaunch,
}: {
  name: string
  description: string
  filename: string
  onLaunch: () => void
}) {
  return (
    <div
      className="ralph-script-card"
      role="button"
      tabIndex={0}
      onClick={onLaunch}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onLaunch()
      }}
    >
      <div className="ralph-script-card-header">
        <FileCode2 size={16} className="ralph-script-icon" />
        <span className="ralph-script-name">{name}</span>
      </div>
      <p className="ralph-script-desc">{description}</p>
      <div className="ralph-script-card-footer">
        <span className="ralph-script-filename">{filename}</span>
        <Play size={12} />
      </div>
    </div>
  )
}
