import { useState, useEffect, useMemo, type ReactNode } from 'react'
import {
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileCode2,
  Play,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
} from 'lucide-react'
import { useToggleSet } from '../../hooks/useToggleSet'
import { useRalphLoops } from '../../hooks/useRalphLoops'
import type { RalphTemplateInfo, RalphRunInfo, RalphRunStatus } from '../../types/ralph'

interface RalphSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

const CORE_SCRIPTS = [
  { id: 'ralph', label: 'Ralph Loop', desc: 'Full autonomous loop' },
  { id: 'ralph-pr', label: 'Ralph PR', desc: 'PR-only loop' },
  { id: 'ralph-issues', label: 'Ralph Issues', desc: 'Scan & create issues' },
]

const MAX_RECENT_RUNS = 10

const RUN_STATUS_ICON: Record<RalphRunStatus, typeof Clock> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: AlertTriangle,
  orphaned: AlertTriangle,
}

function repoName(repoPath: string): string {
  const parts = repoPath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || repoPath
}

function timeAgo(epoch: number): string {
  const ms = Date.now() - epoch
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
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
  return { active, recent: recent.slice(0, MAX_RECENT_RUNS) }
}

/* ── Reusable collapsible section ────────────────────────────── */

function SidebarSection({
  id,
  icon,
  label,
  badge,
  expanded,
  onToggle,
  children,
}: {
  id: string
  icon: ReactNode
  label: string
  badge?: number
  expanded: boolean
  onToggle: (id: string) => void
  children: ReactNode
}) {
  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-header"
        role="button"
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') onToggle(id)
        }}
      >
        <div className="sidebar-section-title">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="sidebar-section-icon">{icon}</span>
          <span>{label}</span>
          {badge != null && badge > 0 && <span className="ralph-sidebar-badge">{badge}</span>}
        </div>
      </div>
      {expanded && <div className="sidebar-section-items">{children}</div>}
    </div>
  )
}

/* ── Script item (shared by Core Scripts + Templates) ────────── */

function ScriptItem({
  id,
  label,
  icon,
  selected,
  desc,
  onSelect,
}: {
  id: string
  label: string
  icon: ReactNode
  selected: boolean
  desc?: string
  onSelect: (id: string) => void
}) {
  return (
    <div
      className={`ralph-sidebar-item ralph-sidebar-script ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(id)
      }}
      title={desc}
    >
      {icon}
      <span>{label}</span>
    </div>
  )
}

function buildDefaultRunName(run: RalphRunInfo, repo: string): string {
  return `${repo} · ${run.runId.slice(0, 6)}`
}

function buildPullRequestRunName(run: RalphRunInfo, repo: string): string {
  /* v8 ignore next -- defensive guard; prNumber always set for PR runs */
  if (run.config.prNumber == null) {
    return buildDefaultRunName(run, repo)
  }
  return `${repo} #${run.config.prNumber}`
}

function buildTemplateRunName(run: RalphRunInfo, repo: string): string {
  /* v8 ignore next -- defensive guard; templateScript always set for template runs */
  if (!run.config.templateScript) {
    return buildDefaultRunName(run, repo)
  }
  const tpl = run.config.templateScript.replace(/\.ps1$/i, '').replace(/^ralph-/, '')
  return `${repo} · ${tpl}`
}

const RUN_NAME_BUILDERS: Partial<Record<RalphRunInfo['config']['scriptType'], (run: RalphRunInfo, repo: string) => string>> = {
  'ralph-pr': buildPullRequestRunName,
  'ralph-issues': (_run, repo) => `${repo} · issues`,
  template: buildTemplateRunName,
}

function runDisplayName(run: RalphRunInfo): string {
  const repo = repoName(run.config.repoPath)
  const builder = RUN_NAME_BUILDERS[run.config.scriptType]
  if (builder) {
    return builder(run, repo)
  }
  return buildDefaultRunName(run, repo)
}

function isActiveRun(run: RalphRunInfo): boolean {
  return run.status === 'running' || run.status === 'pending'
}

function activeRunDetail(run: RalphRunInfo): string {
  if (run.totalIterations) {
    return `${run.currentIteration}/${run.totalIterations}`
  }
  return run.phase
}

function runDetail(run: RalphRunInfo): string {
  if (isActiveRun(run)) {
    return activeRunDetail(run)
  }
  return timeAgo(run.completedAt ?? run.updatedAt)
}

/* ── Run item (for Runs section) ─────────────────────────────── */

function RunItem({
  run,
  selected,
  onClick,
}: {
  run: RalphRunInfo
  selected: boolean
  onClick: () => void
}) {
  const Icon = RUN_STATUS_ICON[run.status]

  return (
    <div
      className={`ralph-sidebar-item ralph-sidebar-run ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
      title={`${run.config.scriptType} — ${run.status}`}
    >
      <Icon size={12} className={run.status === 'running' ? 'ralph-spin' : ''} />
      <span className="ralph-sidebar-run-label">{runDisplayName(run)}</span>
      <span className="ralph-sidebar-run-detail">{runDetail(run)}</span>
    </div>
  )
}

/* ── Runs section content ────────────────────────────────────── */

function RunsList({
  activeRuns,
  recentRuns,
  selectedItem,
  onItemSelect,
}: {
  activeRuns: RalphRunInfo[]
  recentRuns: RalphRunInfo[]
  selectedItem: string | null
  onItemSelect: (id: string) => void
}) {
  if (activeRuns.length === 0 && recentRuns.length === 0) {
    return <div className="ralph-sidebar-empty">No runs yet</div>
  }
  return (
    <>
      {activeRuns.map(run => (
        <RunItem
          key={run.runId}
          run={run}
          selected={selectedItem === `ralph-run:${run.runId}`}
          onClick={() => onItemSelect(`ralph-run:${run.runId}`)}
        />
      ))}
      {recentRuns.length > 0 && (
        <>
          <div className="ralph-sidebar-subheader">Completed</div>
          {recentRuns.map(run => (
            <RunItem
              key={run.runId}
              run={run}
              selected={selectedItem === `ralph-run:${run.runId}`}
              onClick={() => onItemSelect(`ralph-run:${run.runId}`)}
            />
          ))}
        </>
      )}
    </>
  )
}

/* ── Main sidebar component ──────────────────────────────────── */

export function RalphSidebar({ onItemSelect, selectedItem }: RalphSidebarProps) {
  const expanded = useToggleSet(['scripts'])
  const [templates, setTemplates] = useState<RalphTemplateInfo[]>([])
  const [activeScript, setActiveScript] = useState<string | null>(null)
  const { runs } = useRalphLoops()
  const { active: activeRuns, recent: recentRuns } = useMemo(() => partitionRuns(runs), [runs])

  useEffect(() => {
    if (activeRuns.length > 0 || recentRuns.length > 0) expanded.add('runs')
  }, [activeRuns.length, recentRuns.length, expanded])

  useEffect(() => { window.ralph.listTemplates().then(r => { if (Array.isArray(r)) setTemplates(r) }).catch(() => {}) }, [])

  const selectScript = (id: string) => {
    setActiveScript(id)
    window.dispatchEvent(new CustomEvent('ralph:select-script', { detail: id }))
    onItemSelect('ralph-dashboard')
  }
  const goToDashboard = () => { setActiveScript(null); onItemSelect('ralph-dashboard') }
  const dashClass = `ralph-sidebar-item ${selectedItem === 'ralph-dashboard' && !activeScript ? 'selected' : ''}`

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header"><h2>RALPH LOOPS</h2></div>
      <div className="sidebar-panel-content">
        <div className={dashClass} role="button" tabIndex={0} onClick={goToDashboard}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') goToDashboard() }}>
          <LayoutGrid size={14} /><span>Dashboard</span>
        </div>
        <SidebarSection id="core" icon={<Terminal size={16} />} label="Core Scripts"
          expanded={expanded.has('core')} onToggle={expanded.toggle}>
          {CORE_SCRIPTS.map(s => (
            <ScriptItem key={s.id} id={s.id} label={s.label} icon={<Play size={12} />}
              selected={activeScript === s.id} desc={s.desc} onSelect={selectScript} />
          ))}
        </SidebarSection>
        <SidebarSection id="scripts" icon={<FileCode2 size={16} />} label="Templates"
          badge={templates.length} expanded={expanded.has('scripts')} onToggle={expanded.toggle}>
          {templates.length === 0 ? (
            <div className="ralph-sidebar-empty">No templates found</div>
          ) : (
            templates.map(t => (
              <ScriptItem key={t.filename} id={t.filename} label={t.name} icon={<FileCode2 size={12} />}
                selected={activeScript === t.filename} desc={t.filename} onSelect={selectScript} />
            ))
          )}
        </SidebarSection>
        <SidebarSection id="runs" icon={<Activity size={16} />} label="Runs"
          badge={activeRuns.length} expanded={expanded.has('runs')} onToggle={expanded.toggle}>
          <RunsList activeRuns={activeRuns} recentRuns={recentRuns}
            selectedItem={selectedItem} onItemSelect={onItemSelect} />
        </SidebarSection>
      </div>
    </div>
  )
}
