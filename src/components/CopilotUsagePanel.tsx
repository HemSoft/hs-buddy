import { useState, useEffect, useCallback } from 'react'
import {
  Zap,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Building2,
  Crown,
  Briefcase,
} from 'lucide-react'
import { useGitHubAccounts } from '../hooks/useConfig'
import './CopilotUsagePanel.css'

interface QuotaSnapshot {
  entitlement: number
  overage_count: number
  overage_permitted: boolean
  percent_remaining: number
  quota_id: string
  quota_remaining: number
  remaining: number
  unlimited: boolean
  timestamp_utc: string
}

interface QuotaData {
  login: string
  copilot_plan: string
  quota_reset_date: string
  quota_reset_date_utc: string
  organization_login_list: string[]
  quota_snapshots: {
    chat: QuotaSnapshot
    completions: QuotaSnapshot
    premium_interactions: QuotaSnapshot
  }
}

interface AccountQuotaState {
  data: QuotaData | null
  loading: boolean
  error: string | null
  fetchedAt: number | null
}

/** SVG circular progress ring */
function UsageRing({
  percentUsed,
  size = 100,
  strokeWidth = 8,
}: {
  percentUsed: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(percentUsed, 100) / 100) * circumference

  const getColor = (pct: number) => {
    if (pct >= 90) return '#e85d5d'
    if (pct >= 75) return '#e89b3c'
    if (pct >= 50) return '#dcd34a'
    return '#4ec9b0'
  }

  const color = getColor(percentUsed)

  return (
    <svg width={size} height={size} className="usage-ring">
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
      />
      {/* Center text */}
      <text
        x={size / 2}
        y={size / 2 - 4}
        textAnchor="middle"
        dominantBaseline="central"
        className="usage-ring-percent"
        fill={color}
      >
        {percentUsed.toFixed(1)}%
      </text>
      <text
        x={size / 2}
        y={size / 2 + 14}
        textAnchor="middle"
        dominantBaseline="central"
        className="usage-ring-label"
        fill="var(--text-secondary, #888)"
      >
        used
      </text>
    </svg>
  )
}

/** Format plan name for display */
function formatPlan(plan: string): string {
  const planNames: Record<string, string> = {
    enterprise: 'Enterprise',
    business: 'Business',
    individual_pro: 'Pro+',
    individual: 'Pro',
    free: 'Free',
  }
  return planNames[plan] || plan
}

/** Get plan icon */
function PlanIcon({ plan }: { plan: string }) {
  if (plan === 'enterprise') return <Building2 size={13} />
  if (plan === 'business') return <Briefcase size={13} />
  return <Crown size={13} />
}

export function CopilotUsagePanel() {
  const { accounts } = useGitHubAccounts()
  const [quotas, setQuotas] = useState<Record<string, AccountQuotaState>>({})

  const fetchQuota = useCallback(async (username: string) => {
    setQuotas(prev => ({
      ...prev,
      [username]: { data: prev[username]?.data ?? null, loading: true, error: null, fetchedAt: prev[username]?.fetchedAt ?? null },
    }))

    try {
      const result = await window.github.getCopilotQuota(username)
      if (result.success && result.data) {
        setQuotas(prev => ({
          ...prev,
          [username]: { data: result.data!, loading: false, error: null, fetchedAt: Date.now() },
        }))
      } else {
        setQuotas(prev => ({
          ...prev,
          [username]: { data: null, loading: false, error: result.error || 'Unknown error', fetchedAt: null },
        }))
      }
    } catch (error) {
      setQuotas(prev => ({
        ...prev,
        [username]: {
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          fetchedAt: null,
        },
      }))
    }
  }, [])

  // Fetch quota for all accounts on mount
  useEffect(() => {
    const usernames = accounts.map(a => a.username)
    for (const username of usernames) {
      fetchQuota(username)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map(a => a.username).join(',')])

  const refreshAll = () => {
    for (const account of accounts) {
      fetchQuota(account.username)
    }
  }

  const anyLoading = Object.values(quotas).some(s => s.loading)

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  const formatResetDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const daysUntilReset = (dateStr: string) => {
    const resetDate = new Date(dateStr)
    const now = new Date()
    const diff = resetDate.getTime() - now.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  return (
    <div className="copilot-usage-panel">
      <div className="usage-header">
        <div className="usage-header-left">
          <div className="usage-header-icon">
            <Zap size={20} />
          </div>
          <div>
            <h2>Premium Usage</h2>
            <p className="usage-subtitle">
              Copilot premium request quota per account
            </p>
          </div>
        </div>
        <button
          className="usage-refresh-btn"
          onClick={refreshAll}
          disabled={anyLoading}
          title="Refresh usage data"
        >
          <RefreshCw size={14} className={anyLoading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Per-account quota cards */}
      <div className="usage-accounts-grid">
        {accounts.length === 0 ? (
          <div className="usage-empty">
            <AlertCircle size={24} />
            <p>No GitHub accounts configured.</p>
            <p className="usage-empty-hint">Add accounts in Settings → Accounts</p>
          </div>
        ) : (
          accounts.map(account => {
            const state = quotas[account.username]
            const data = state?.data
            const premium = data?.quota_snapshots?.premium_interactions
            const percentUsed = premium ? 100 - premium.percent_remaining : 0
            const used = premium ? premium.entitlement - premium.remaining : 0
            const total = premium?.entitlement ?? 0

            return (
              <div key={account.username} className="usage-account-card">
                {state?.loading && !data && (
                  <div className="usage-account-loading">
                    <RefreshCw size={16} className="spin" />
                    <span>Loading...</span>
                  </div>
                )}

                {state?.error && !data && (
                  <div className="usage-account-error">
                    <AlertCircle size={16} />
                    <div>
                      <strong>{account.username}</strong>
                      <p>{state.error.includes('404') ? 'No Copilot subscription' : 'Failed to load'}</p>
                    </div>
                  </div>
                )}

                {data && premium && (
                  <>
                    {/* Card header */}
                    <div className="usage-account-header">
                      <div className="usage-account-identity">
                        <span className="usage-account-name">{data.login}</span>
                        <span className="usage-account-plan">
                          <PlanIcon plan={data.copilot_plan} />
                          {formatPlan(data.copilot_plan)}
                        </span>
                      </div>
                      {state.loading && <RefreshCw size={12} className="spin" />}
                    </div>

                    {/* Ring + stats */}
                    <div className="usage-account-body">
                      <UsageRing percentUsed={percentUsed} size={110} strokeWidth={9} />
                      <div className="usage-account-stats">
                        <div className="usage-stat">
                          <span className="usage-stat-value">{used.toLocaleString()}</span>
                          <span className="usage-stat-label">Used</span>
                        </div>
                        <div className="usage-stat">
                          <span className="usage-stat-value">{premium.remaining.toLocaleString()}</span>
                          <span className="usage-stat-label">Remaining</span>
                        </div>
                        <div className="usage-stat">
                          <span className="usage-stat-value">{total.toLocaleString()}</span>
                          <span className="usage-stat-label">Entitlement</span>
                        </div>
                        {premium.overage_count > 0 && (
                          <div className="usage-stat usage-stat-overage">
                            <span className="usage-stat-value">{premium.overage_count.toLocaleString()}</span>
                            <span className="usage-stat-label">Overage</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="usage-account-footer">
                      <div className="usage-account-reset">
                        Resets {formatResetDate(data.quota_reset_date_utc)}
                        <span className="usage-reset-days">
                          ({daysUntilReset(data.quota_reset_date_utc)}d)
                        </span>
                      </div>
                      <div className="usage-account-links">
                        {state.fetchedAt && (
                          <span className="usage-fetched-at">
                            {formatTime(state.fetchedAt)}
                          </span>
                        )}
                        <button
                          className="usage-link-btn"
                          onClick={() =>
                            window.shell.openExternal('https://github.com/settings/copilot')
                          }
                          title="Open Copilot settings on GitHub"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Org membership (subtle) */}
                    {data.organization_login_list.length > 0 && (
                      <div className="usage-account-orgs">
                        <Building2 size={11} />
                        <span>{data.organization_login_list.join(', ')}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
