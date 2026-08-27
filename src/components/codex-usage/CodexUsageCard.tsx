import { AlertCircle, ExternalLink, Sparkles } from 'lucide-react'
import type { CodexUsageWindow } from '../../types/codexUsage'
import type { GitHubAccount } from '../../types/config'
import type { CodexUsageState } from '../../hooks/useCodexUsage'
import { UsageRing } from '../copilot-usage/UsageRing'

function formatPlan(planType: string | null): string {
  if (!planType) return 'ChatGPT / Codex'
  const normalized = planType.toLowerCase() === 'prolite' ? 'pro' : planType
  return `ChatGPT / Codex · ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

function formatReset(resetAt: string): string {
  const reset = new Date(resetAt)
  const remainingMs = reset.getTime() - Date.now()
  if (remainingMs <= 0) return 'Resets now'

  const totalMinutes = Math.max(1, Math.floor(remainingMs / 60_000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  const relative =
    days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  const exact = reset.toLocaleString(undefined, {
    weekday: days > 0 ? 'short' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  })
  return `Resets in ${relative} · ${exact}`
}

function CodexWindow({ window, prominent }: { window: CodexUsageWindow; prominent: boolean }) {
  const usageBody = prominent ? (
    <div className="usage-account-body codex-weekly-body">
      <div className="codex-weekly-rings">
        <UsageRing percentUsed={window.usedPercent} label="used" size={96} />
        <UsageRing percentUsed={window.projectedPercent} label="projected use" size={96} />
      </div>
      <div className="usage-account-stats codex-weekly-stats">
        <div className="usage-stat">
          <span className="usage-stat-value">{window.remainingPercent.toFixed(1)}%</span>
          <span className="usage-stat-label">Remaining</span>
        </div>
      </div>
    </div>
  ) : (
    <div className="usage-account-body">
      <UsageRing
        percentUsed={window.usedPercent}
        projectedPercent={window.projectedPercent}
        size={84}
      />
      <div className="usage-account-stats">
        <div className="usage-stat">
          <span className="usage-stat-value">{window.remainingPercent.toFixed(1)}%</span>
          <span className="usage-stat-label">Remaining</span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-value">{window.projectedPercent.toFixed(1)}%</span>
          <span className="usage-stat-label">Projected use</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className={`codex-window${prominent ? ' codex-window-prominent' : ''}`}>
      <div className="codex-window-heading">
        <strong>{window.label}</strong>
        {prominent ? <span>Primary</span> : null}
      </div>
      {usageBody}
      <div className="usage-account-reset">{formatReset(window.resetAt)}</div>
    </div>
  )
}

function CodexUsageContent({
  account,
  state,
}: {
  account: GitHubAccount
  state: CodexUsageState | undefined
}) {
  if (!state || (state.loading && !state.data)) {
    return <div className="usage-account-loading">Loading Codex allowance…</div>
  }
  if (state.error && !state.data) {
    return (
      <div className="usage-account-error">
        <AlertCircle size={16} />
        <span>{state.error}</span>
      </div>
    )
  }
  if (!state.data) return null

  return (
    <>
      <div className="usage-account-header">
        <div className="usage-account-identity">
          <Sparkles size={18} />
          <div>
            <div className="usage-account-name">{account.username} · Codex allowance</div>
            <div className="usage-account-plan">{formatPlan(state.data.planType)}</div>
          </div>
        </div>
      </div>
      {state.error ? (
        <div className="usage-account-warning" role="status">
          <AlertCircle size={14} />
          <span>Showing the last successful response. {state.error}</span>
        </div>
      ) : null}
      <div className="codex-window-list">
        {state.data.windows.map(window => (
          <CodexWindow
            key={`${window.kind}-${window.durationSeconds}`}
            window={window}
            prominent={window.kind === 'weekly'}
          />
        ))}
      </div>
      <div className="usage-account-footer">
        <span className="usage-account-reset">
          Updated {new Date(state.data.fetchedAt).toLocaleTimeString()}
        </span>
        <button
          type="button"
          className="usage-account-link"
          onClick={() => window.shell.openExternal('https://chatgpt.com/codex/settings/usage')}
        >
          Usage settings <ExternalLink size={12} />
        </button>
      </div>
    </>
  )
}

export function CodexUsageCard({
  account,
  state,
}: {
  account: GitHubAccount
  state: CodexUsageState | undefined
}) {
  return (
    <div className="usage-account-card codex-usage-card" data-account={account.username}>
      <CodexUsageContent account={account} state={state} />
    </div>
  )
}
