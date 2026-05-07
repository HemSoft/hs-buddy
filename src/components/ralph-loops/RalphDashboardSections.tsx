import { FileCode2, Play, Plus, RefreshCw } from 'lucide-react'
import type { RalphRunInfo, RalphTemplateInfo } from '../../types/ralph'
import { RalphLoopCard } from './RalphLoopCard'

const BUILTIN_SCRIPTS = [
  {
    name: 'Ralph Loop',
    description: 'Full autonomous loop — issue triage, coding, PR creation, and review resolution',
    filename: 'ralph',
  },
  {
    name: 'Ralph PR',
    description: 'PR-only loop — create and shepherd a PR through review for a given prompt',
    filename: 'ralph-pr',
  },
  {
    name: 'Ralph Issues',
    description: 'Scan codebase and create GitHub Issues for findings',
    filename: 'ralph-issues',
  },
] as const

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

export function RalphDashboardHeader({
  isLaunchView,
  onRefresh,
  onToggleLaunchView,
}: {
  isLaunchView: boolean
  onRefresh: () => void
  onToggleLaunchView: () => void
}) {
  return (
    <div className="ralph-dashboard-header">
      <h2>Ralph Loops</h2>
      <div className="ralph-dashboard-actions">
        <button
          aria-label="Refresh"
          className="ralph-action-btn"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className={`ralph-action-btn ralph-primary ${isLaunchView ? 'active' : ''}`}
          onClick={onToggleLaunchView}
        >
          <Plus size={14} />
          New Loop
        </button>
      </div>
    </div>
  )
}

export function RalphDashboardErrorBanner({
  error,
  onDismiss,
}: {
  error: string | null
  onDismiss: () => void
}) {
  if (!error) {
    return null
  }

  return (
    <div className="ralph-error-banner">
      {error}
      <button aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  )
}

export function RalphDashboardAvailableScripts({
  templates,
  onLaunchScript,
}: {
  templates: RalphTemplateInfo[]
  onLaunchScript: (script: string) => void
}) {
  return (
    <section className="ralph-section">
      <h3 className="ralph-section-title">
        Available Scripts ({BUILTIN_SCRIPTS.length + templates.length})
      </h3>
      <div className="ralph-card-grid">
        {BUILTIN_SCRIPTS.map(script => (
          <ScriptCard
            key={script.filename}
            name={script.name}
            description={script.description}
            filename={script.filename}
            onLaunch={() => onLaunchScript(script.filename)}
          />
        ))}
        {templates.map(template => (
          <ScriptCard
            key={template.filename}
            name={template.name}
            description={describeTemplate(template.filename)}
            filename={template.filename}
            onLaunch={() => onLaunchScript(template.filename)}
          />
        ))}
      </div>
    </section>
  )
}

export function RalphDashboardRunSection({
  title,
  runs,
  onStop,
}: {
  title: string
  runs: RalphRunInfo[]
  onStop: (runId: string) => void
}) {
  if (runs.length === 0) {
    return null
  }

  return (
    <section className="ralph-section">
      <h3 className="ralph-section-title">
        {title} ({runs.length})
      </h3>
      <div className="ralph-card-grid">
        {runs.map(run => (
          <RalphLoopCard key={run.runId} run={run} onStop={onStop} />
        ))}
      </div>
    </section>
  )
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
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          if (event.key === ' ') {
            event.preventDefault()
          }
          onLaunch()
        }
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
