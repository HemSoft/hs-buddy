import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MinusCircle,
  PlayCircle,
  XCircle,
} from 'lucide-react'
import type { PRChecksSummary } from '../api/github'
import { usePRPanelData } from '../hooks/usePRPanelData'
import type { PRDetailInfo } from '../utils/prDetailView'
import { formatDistanceToNow, formatDateFull } from '../utils/dateUtils'
import { PanelLoadingState, PanelErrorState } from './shared/PanelStates'
import './PRChecksPanel.css'

interface PRChecksPanelProps {
  pr: PRDetailInfo
}

type CheckTone = 'success' | 'failure' | 'pending' | 'neutral'

const FAILURE_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'startup_failure',
  'action_required',
  'cancelled',
  'stale',
])

const NEUTRAL_CONCLUSIONS = new Set(['neutral', 'skipped'])

function resolveConclusion(conclusion: string | null | undefined): string {
  return conclusion ?? ''
}

function resolveCompletedCheckTone(conclusion: string | null | undefined): {
  label: string
  tone: CheckTone
  icon: typeof CheckCircle2
} {
  const resolved = resolveConclusion(conclusion)
  if (resolved === 'success') {
    return { label: 'Passed', tone: 'success', icon: CheckCircle2 }
  }
  if (FAILURE_CONCLUSIONS.has(resolved)) {
    /* v8 ignore start */
    return { label: resolved.replace(/_/g, ' '), tone: 'failure', icon: XCircle }
    /* v8 ignore stop */
  }
  if (NEUTRAL_CONCLUSIONS.has(resolved)) {
    return { label: resolved, tone: 'neutral', icon: MinusCircle }
  }
  return { label: resolved || 'Completed', tone: 'neutral', icon: MinusCircle }
}

function getCheckRunStatus(run: PRChecksSummary['checkRuns'][number]): {
  label: string
  tone: CheckTone
  icon: typeof CheckCircle2
} {
  if (run.status !== 'completed') {
    return {
      label: run.status === 'in_progress' ? 'In progress' : 'Queued',
      tone: 'pending',
      icon: PlayCircle,
    }
  }
  return resolveCompletedCheckTone(run.conclusion)
}

type StatusContextEntry = { label: string; tone: CheckTone; icon: typeof CheckCircle2 }
const STATUS_CONTEXT_ENTRIES: Record<string, StatusContextEntry> = {
  success: { label: 'Passed', tone: 'success', icon: CheckCircle2 },
  failure: { label: 'Failed', tone: 'failure', icon: XCircle },
  error: { label: 'Error', tone: 'failure', icon: XCircle },
  pending: { label: 'Pending', tone: 'pending', icon: Clock3 },
}

function getStatusContextState(state: string): StatusContextEntry {
  return Object.hasOwn(STATUS_CONTEXT_ENTRIES, state)
    ? STATUS_CONTEXT_ENTRIES[state]
    : { label: state, tone: 'neutral' as CheckTone, icon: MinusCircle }
}

const OVERALL_STATE_LABELS: Record<string, string> = {
  passing: 'Passing',
  failing: 'Failing',
  pending: 'Pending',
  neutral: 'Neutral',
}

function getOverallStateLabel(state: PRChecksSummary['overallState']): string {
  return Object.hasOwn(OVERALL_STATE_LABELS, state) ? OVERALL_STATE_LABELS[state] : 'No checks'
}

function CheckRunRow({ run }: { run: PRChecksSummary['checkRuns'][number] }) {
  const status = getCheckRunStatus(run)
  const StatusIcon = status.icon
  const runUrl = run.detailsUrl
  const finishedAt = run.completedAt || run.startedAt
  return (
    <div className="pr-checks-row">
      <div className="pr-checks-row-main">
        <div className={`pr-checks-badge tone-${status.tone}`}>
          <StatusIcon size={14} />
          <span>{status.label}</span>
        </div>
        <div className="pr-checks-row-copy">
          <div className="pr-checks-row-title">{run.name}</div>
          <div className="pr-checks-row-subtitle">
            <span>{run.appName || 'GitHub App'}</span>
            {finishedAt && (
              <>
                <span className="pr-checks-dot">•</span>
                <span title={formatDateFull(finishedAt)}>{formatDistanceToNow(finishedAt)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      {runUrl && (
        <button
          className="pr-checks-link"
          type="button"
          onClick={() => window.shell.openExternal(runUrl)}
        >
          Details
        </button>
      )}
    </div>
  )
}

function StatusContextRow({
  statusContext,
}: {
  statusContext: PRChecksSummary['statusContexts'][number]
}) {
  const status = getStatusContextState(statusContext.state)
  const StatusIcon = status.icon
  const updatedAt = statusContext.updatedAt || statusContext.createdAt
  return (
    <div className="pr-checks-row">
      <div className="pr-checks-row-main">
        <div className={`pr-checks-badge tone-${status.tone}`}>
          <StatusIcon size={14} />
          <span>{status.label}</span>
        </div>
        <div className="pr-checks-row-copy">
          <div className="pr-checks-row-title">{statusContext.context}</div>
          <div className="pr-checks-row-subtitle">
            <span>{statusContext.description || 'No description provided'}</span>
            {updatedAt && (
              <>
                <span className="pr-checks-dot">•</span>
                <span title={formatDateFull(updatedAt)}>{formatDistanceToNow(updatedAt)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      {statusContext.targetUrl && (
        <button
          className="pr-checks-link"
          type="button"
          onClick={() => window.shell.openExternal(statusContext.targetUrl!)}
        >
          Details
        </button>
      )}
    </div>
  )
}

export function PRChecksPanel({ pr }: PRChecksPanelProps) {
  const {
    data: checks,
    error,
    refresh,
    cacheKey,
  } = usePRPanelData<PRChecksSummary>(
    pr,
    'pr-checks',
    /* v8 ignore start */
    (client, owner, repo, prNumber) => client.fetchPRChecks(owner, repo, prNumber)
    /* v8 ignore stop */
  )

  if (error) {
    return (
      <PanelErrorState
        title="Failed to load checks"
        error={error}
        onRetry={cacheKey ? refresh : undefined}
      />
    )
  }

  if (!checks) {
    return <PanelLoadingState message="Loading checks…" size={28} />
  }

  return (
    <div className="pr-checks-container">
      <div className="pr-checks-summary-grid">
        <div className={`pr-checks-summary-card tone-${checks.overallState}`}>
          <div className="pr-checks-summary-label">Overall</div>
          <div className="pr-checks-summary-value">{getOverallStateLabel(checks.overallState)}</div>
        </div>
        <div className="pr-checks-summary-card">
          <div className="pr-checks-summary-label">Total</div>
          <div className="pr-checks-summary-value">{checks.totalCount}</div>
        </div>
        <div className="pr-checks-summary-card tone-passing">
          <div className="pr-checks-summary-label">Passing</div>
          <div className="pr-checks-summary-value">{checks.successfulCount}</div>
        </div>
        <div className="pr-checks-summary-card tone-failing">
          <div className="pr-checks-summary-label">Failing</div>
          <div className="pr-checks-summary-value">{checks.failedCount}</div>
        </div>
        <div className="pr-checks-summary-card tone-pending">
          <div className="pr-checks-summary-label">Pending</div>
          <div className="pr-checks-summary-value">{checks.pendingCount}</div>
        </div>
      </div>

      <div className="pr-checks-headline-row">
        <div className="pr-checks-headline-meta">
          <span className="pr-checks-headline-label">Head SHA</span>
          <code className="pr-checks-headline-sha">{checks.headSha.slice(0, 12)}</code>
        </div>
        <button
          className="pr-checks-open-btn"
          onClick={() => window.shell.openExternal(`${pr.url}/checks`)}
        >
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>

      {checks.totalCount === 0 && (
        <div className="pr-checks-empty-state">
          <AlertCircle size={28} />
          <p>No checks or commit statuses were reported for this pull request.</p>
        </div>
      )}

      <div className="pr-checks-section">
        <div className="pr-checks-section-title">Check Runs</div>
        {checks.checkRuns.length === 0 ? (
          <div className="pr-checks-empty">No GitHub check runs</div>
        ) : (
          <div className="pr-checks-list">
            {checks.checkRuns.map(run => (
              <CheckRunRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>

      <div className="pr-checks-section">
        <div className="pr-checks-section-title">Commit Statuses</div>
        {checks.statusContexts.length === 0 ? (
          <div className="pr-checks-empty">No legacy commit status contexts</div>
        ) : (
          <div className="pr-checks-list">
            {checks.statusContexts.map(ctx => (
              <StatusContextRow key={ctx.id} statusContext={ctx} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
