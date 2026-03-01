import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Zap,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Building2,
  Crown,
  Briefcase,
  ShieldAlert,
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

interface OrgBudgetData {
  org: string
  budgetAmount: number | null
  preventFurtherUsage: boolean
  spent: number
  spentUnavailable: boolean
  useQuotaOverage: boolean
  billingMonth: number
  billingYear: number
  fetchedAt: number
}

interface OrgBudgetState {
  data: OrgBudgetData | null
  loading: boolean
  error: string | null
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

const OVERAGE_COST_PER_REQUEST = 0.04

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
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
  const [orgBudgets, setOrgBudgets] = useState<Record<string, OrgBudgetState>>({})

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
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
  }

  // Collect unique orgs from account config (deduplicated)
  const uniqueOrgs = useMemo(() => {
    const map = new Map<string, string>() // org → username
    for (const account of accounts) {
      if (account.org && !map.has(account.org)) {
        map.set(account.org, account.username)
      }
    }
    return map
  }, [accounts])

  const fetchBudget = useCallback(async (org: string, username?: string) => {
    setOrgBudgets(prev => ({
      ...prev,
      [org]: { data: prev[org]?.data ?? null, loading: true, error: null },
    }))
    try {
      const result = await window.github.getCopilotBudget(org, username)
      if (result.success && result.data) {
        setOrgBudgets(prev => ({
          ...prev,
          [org]: { data: result.data!, loading: false, error: null },
        }))
      } else {
        setOrgBudgets(prev => ({
          ...prev,
          [org]: { data: null, loading: false, error: result.error || 'Unknown error' },
        }))
      }
    } catch (error) {
      setOrgBudgets(prev => ({
        ...prev,
        [org]: {
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }))
    }
  }, [])

  // Fetch budgets when unique orgs are known
  useEffect(() => {
    for (const [org, username] of uniqueOrgs) {
      fetchBudget(org, username)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(uniqueOrgs.keys()).join(',')])

  // Auto-refresh on UTC month boundary (checks every 5 minutes)
  useEffect(() => {
    const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes
    const currentUTCMonth = () => {
      const now = new Date()
      return now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1)
    }

    const interval = setInterval(() => {
      const nowMonth = currentUTCMonth()
      // Check if any cached budget data is from a previous billing month
      const needsRefresh = Object.values(orgBudgets).some(state => {
        if (!state.data) return false
        const dataMonth = state.data.billingYear * 100 + state.data.billingMonth
        return dataMonth < nowMonth
      })

      if (needsRefresh) {
        // Billing cycle changed — force re-fetch everything
        for (const account of accounts) {
          fetchQuota(account.username)
        }
        for (const [org, username] of uniqueOrgs) {
          fetchBudget(org, username)
        }
      }
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, Array.from(uniqueOrgs.keys()).join(',')])

  // Compute per-org overage from account quota data (for orgs without billing API access)
  const orgOverageFromQuotas = useMemo(() => {
    const map = new Map<string, number>() // org → total overage cost
    for (const account of accounts) {
      const state = quotas[account.username]
      const premium = state?.data?.quota_snapshots?.premium_interactions
      if (!premium || !account.org) continue
      const overageByCount = Math.max(0, premium.overage_count)
      const overageByRemaining = Math.max(0, -premium.remaining)
      const overageRequests = Math.max(overageByCount, overageByRemaining)
      const cost = overageRequests * OVERAGE_COST_PER_REQUEST
      map.set(account.org, (map.get(account.org) ?? 0) + cost)
    }
    return map
  }, [accounts, quotas])

  const anyLoading = Object.values(quotas).some(s => s.loading)

  const aggregateTotals = Object.values(quotas).reduce(
    (acc, state) => {
      const premium = state.data?.quota_snapshots?.premium_interactions
      if (!premium) {
        return acc
      }

      const used = premium.entitlement - premium.remaining
      const overageByCount = Math.max(0, premium.overage_count)
      const overageByRemaining = Math.max(0, -premium.remaining)
      const overageRequests = Math.max(overageByCount, overageByRemaining)

      acc.totalUsed += used
      acc.totalOverageCost += overageRequests * OVERAGE_COST_PER_REQUEST
      return acc
    },
    { totalUsed: 0, totalOverageCost: 0 }
  )

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
            <h2>Copilot Usage</h2>
            <p className="usage-subtitle">
              Copilot premium request quota per account
            </p>
          </div>
        </div>
        <div className="usage-header-summary" aria-live="polite">
          <div className="usage-header-summary-item">
            <span className="usage-header-summary-value">{aggregateTotals.totalUsed.toLocaleString()}</span>
            <span className="usage-header-summary-label">Total Used</span>
          </div>
          <div className="usage-header-summary-divider" aria-hidden="true" />
          <div className="usage-header-summary-item">
            <span className="usage-header-summary-value">
              {formatCurrency(aggregateTotals.totalOverageCost)}
            </span>
            <span className="usage-header-summary-label">Total Overage</span>
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
            const overageByCount = Math.max(0, premium?.overage_count ?? 0)
            const overageByRemaining = Math.max(0, -(premium?.remaining ?? 0))
            const overageRequests = Math.max(overageByCount, overageByRemaining)
            const overageCost = overageRequests * OVERAGE_COST_PER_REQUEST

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
                        {overageRequests > 0 && (
                          <div className="usage-stat usage-stat-overage">
                            <span className="usage-stat-value">{formatCurrency(overageCost)}</span>
                            <span className="usage-stat-label">Overage Cost</span>
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

      {/* Org Budget Section */}
      {uniqueOrgs.size > 0 && (
        <div className="usage-budgets-section">
          <h3 className="usage-budgets-heading">
            <Building2 size={14} />
            Org Budgets
          </h3>
          <div className="usage-budgets-grid">
            {Array.from(uniqueOrgs.keys()).map(org => {
              const state = orgBudgets[org]
              const d = state?.data

              // Known spending limits for personal accounts (billing API not available)
              const PERSONAL_BUDGETS: Record<string, number> = { hemsoft: 50 }

              // When billing APIs are unavailable, use overage computed from quota data
              const quotaOverage = orgOverageFromQuotas.get(org) ?? 0
              const effectiveBudget = d?.budgetAmount ?? PERSONAL_BUDGETS[org.toLowerCase()] ?? null
              const displaySpent = d?.useQuotaOverage ? quotaOverage : (d?.spent ?? 0)
              const pct = effectiveBudget ? Math.min((displaySpent / effectiveBudget) * 100, 100) : null

              // "My share" overlay: personal overage from accounts in this org
              const myShare = !d?.useQuotaOverage ? quotaOverage : 0
              const mySharePct = effectiveBudget && myShare > 0
                ? Math.min((myShare / effectiveBudget) * 100, pct ?? 100)
                : null

              const barColor = pct === null ? '#4ec9b0'
                : pct >= 90 ? '#e85d5d'
                : pct >= 75 ? '#e89b3c'
                : pct >= 50 ? '#dcd34a'
                : '#4ec9b0'

              return (
                <div key={org} className="usage-budget-card">
                  <div className="usage-budget-card-header">
                    <span className="usage-budget-org-name">
                      <Building2 size={13} />
                      {org}
                    </span>
                    {state?.loading && <RefreshCw size={12} className="spin" />}
                    {d?.preventFurtherUsage && (
                      <span className="usage-budget-stop-badge" title="Usage stopped at limit">
                        <ShieldAlert size={11} />
                        Stop at limit
                      </span>
                    )}
                  </div>

                  {state?.error && !d && (
                    <p className="usage-budget-error">
                      {state.error.includes('enhanced billing') ? 'Not on enhanced billing' : 'Failed to load'}
                    </p>
                  )}

                  {d && (
                    <>
                      <div className="usage-budget-bar-track">
                        <div
                          className="usage-budget-bar-fill"
                          style={{ width: `${pct ?? 0}%`, background: barColor }}
                        />
                        {mySharePct !== null && mySharePct > 0 && (
                          <div
                            className="usage-budget-bar-myshare"
                            style={{ width: `${mySharePct}%` }}
                            title={`My share: ${formatCurrency(myShare)}`}
                          />
                        )}
                      </div>
                      <div className="usage-budget-amounts">
                        <span className="usage-budget-spent" style={{ color: barColor }}>
                          {formatCurrency(displaySpent)}{' '}
                          {d.useQuotaOverage ? 'overage' : 'spent'}
                        </span>
                        {myShare > 0 && !d.useQuotaOverage && (
                          <span className="usage-budget-myshare-label">
                            {formatCurrency(myShare)} mine
                          </span>
                        )}
                        {effectiveBudget !== null ? (
                          <span className="usage-budget-limit">
                            of {formatCurrency(effectiveBudget)}
                          </span>
                        ) : (
                          <span className="usage-budget-limit">
                            {d.useQuotaOverage ? 'from quota' : 'no budget set'}
                          </span>
                        )}
                      </div>
                      <div className="usage-budget-footer">
                        <span className="usage-budget-period">
                          {new Date(d.billingYear, d.billingMonth - 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                        </span>
                        <span className="usage-fetched-at">
                          {formatTime(d.fetchedAt)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
