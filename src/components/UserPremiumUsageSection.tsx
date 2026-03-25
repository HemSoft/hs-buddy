import { useEffect, useReducer, useRef, useMemo, useState } from 'react'
import { Loader2, TrendingUp, AlertCircle, RefreshCw, Calendar, Clock } from 'lucide-react'
import {
  OVERAGE_COST_PER_REQUEST,
  formatCurrency,
  computeProjection,
  getQuotaColor,
  type QuotaData,
} from './copilot-usage/quotaUtils'
import { formatDistanceToNow } from '../utils/dateUtils'
import { useGitHubAccounts } from '../hooks/useConfig'
import './UserPremiumUsageSection.css'

interface UserPremiumUsageSectionProps {
  /** GitHub username to show premium usage for */
  username: string
  /** The org the user belongs to */
  org: string
}

// ── Quota mode (for configured accounts) ──

interface QuotaFetchState {
  data: QuotaData | null
  loading: boolean
  error: string | null
  fetchedAt: number | null
}

type QuotaAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: QuotaData; fetchedAt: number }
  | { type: 'FETCH_ERROR'; payload: string }

function quotaReducer(state: QuotaFetchState, action: QuotaAction): QuotaFetchState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { data: action.payload, loading: false, error: null, fetchedAt: action.fetchedAt }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload }
  }
}

const quotaCache = new Map<string, { data: QuotaData; fetchedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000

// ── Seat mode (for non-configured org members) ──

interface SeatData {
  login: string
  planType: string | null
  lastActivityAt: string | null
  lastActivityEditor: string | null
  createdAt: string | null
  pendingCancellation: string | null
}

interface SeatFetchState {
  data: SeatData | null | undefined // null = no seat, undefined = not loaded
  loading: boolean
  error: string | null
}

type SeatAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: SeatData | null }
  | { type: 'FETCH_ERROR'; payload: string }

function seatReducer(state: SeatFetchState, action: SeatAction): SeatFetchState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { data: action.payload, loading: false, error: null }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload }
  }
}

const seatCache = new Map<string, { data: SeatData | null; fetchedAt: number }>()

interface UserPremiumData {
  userMonthlyRequests: number
  userTodayRequests: number
  userMonthlyModels: Array<{ model: string; requests: number }>
  orgMonthlyRequests: number
  orgMonthlyNetCost: number
}

const premiumCache = new Map<string, { data: UserPremiumData; fetchedAt: number }>()

// ── Helpers ──

function formatResetDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function daysUntilReset(dateStr: string) {
  const resetDate = new Date(dateStr)
  const diff = resetDate.getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function formatPlanType(plan: string | null): string {
  if (!plan) return 'Unknown'
  const labels: Record<string, string> = {
    business: 'Business',
    enterprise: 'Enterprise',
    individual: 'Pro',
    individual_pro: 'Pro+',
    free: 'Free',
  }
  return labels[plan] ?? plan
}

function fetchPremiumData(
  org: string,
  targetUser: string,
  authUser: string | undefined,
  cacheKey: string,
  setPremium: (data: UserPremiumData | null) => void
) {
  const cached = premiumCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    setPremium(cached.data)
    return
  }

  window.github
    .getUserPremiumRequests(org, targetUser, authUser)
    .then(result => {
      if (result.success && result.data) {
        const data: UserPremiumData = {
          userMonthlyRequests: result.data.userMonthlyRequests,
          userTodayRequests: result.data.userTodayRequests,
          userMonthlyModels: result.data.userMonthlyModels,
          orgMonthlyRequests: result.data.orgMonthlyRequests,
          orgMonthlyNetCost: result.data.orgMonthlyNetCost,
        }
        premiumCache.set(cacheKey, { data, fetchedAt: Date.now() })
        setPremium(data)
      }
    })
    .catch(() => {/* best effort */})
}

// ── Full quota view (configured accounts) ──

function QuotaView({ username, org }: { username: string; org: string }) {
  const fetchRef = useRef(0)
  const cached = quotaCache.get(username)
  const [state, dispatch] = useReducer(quotaReducer, {
    data: cached?.data ?? null,
    loading: false,
    error: null,
    fetchedAt: cached?.fetchedAt ?? null,
  })

  // Premium model data (shared with SeatView)
  const premCacheKey = `${org}/${username}`
  const [premium, setPremium] = useState<UserPremiumData | null>(premiumCache.get(premCacheKey)?.data ?? null)

  const fetchPremium = () => fetchPremiumData(org, username, username, premCacheKey, setPremium)

  const fetchQuota = () => {
    const id = ++fetchRef.current
    dispatch({ type: 'FETCH_START' })
    window.github
      .getCopilotQuota(username)
      .then(result => {
        if (id !== fetchRef.current) return
        if (result.success && result.data) {
          const now = Date.now()
          quotaCache.set(username, { data: result.data, fetchedAt: now })
          dispatch({ type: 'FETCH_SUCCESS', payload: result.data, fetchedAt: now })
        } else {
          dispatch({ type: 'FETCH_ERROR', payload: result.error || 'Failed to load' })
        }
      })
      .catch(err => {
        if (id === fetchRef.current) {
          dispatch({ type: 'FETCH_ERROR', payload: err instanceof Error ? err.message : String(err) })
        }
      })
  }

  const refreshAll = () => {
    fetchQuota()
    premiumCache.delete(premCacheKey)
    fetchPremium()
  }

  useEffect(() => {
    if (!username) return
    const c = quotaCache.get(username)
    if (c && Date.now() - c.fetchedAt < CACHE_TTL) {
      dispatch({ type: 'FETCH_SUCCESS', payload: c.data, fetchedAt: c.fetchedAt })
    } else {
      fetchQuota()
    }
    fetchPremium()
  }, [username]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, error } = state
  const quotaPremium = data?.quota_snapshots?.premium_interactions

  if (loading && !data) {
    return (
      <div className="ud-premium-loading">
        <Loader2 size={16} className="spin" />
        <span>Loading premium usage…</span>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="ud-premium-error">
        <AlertCircle size={14} />
        <span>{error.includes('404') ? 'No Copilot subscription' : 'Failed to load premium usage'}</span>
      </div>
    )
  }

  if (!data || !quotaPremium) return null

  const used = quotaPremium.entitlement - quotaPremium.remaining
  const total = quotaPremium.entitlement
  const percentUsed = total > 0 ? (used / total) * 100 : 0
  const overageByCount = Math.max(0, quotaPremium.overage_count ?? 0)
  const overageByRemaining = Math.max(0, -(quotaPremium.remaining ?? 0))
  const overageRequests = Math.max(overageByCount, overageByRemaining)
  const overageCost = overageRequests * OVERAGE_COST_PER_REQUEST
  const color = getQuotaColor(percentUsed)
  const projection = computeProjection(quotaPremium, data.quota_reset_date_utc)
  const resetDays = daysUntilReset(data.quota_reset_date_utc)

  return (
    <>
      <div className="ud-premium-header">
        <div className="ud-premium-header-left">
          <span className="ud-premium-pct" style={{ color }}>
            {percentUsed.toFixed(1)}%
          </span>
          <span className="ud-premium-used-label">used</span>
        </div>
        <div className="ud-premium-header-right">
          <span className="ud-premium-reset">
            <Calendar size={11} />
            Resets {formatResetDate(data.quota_reset_date_utc)}
            <span className="ud-premium-reset-days">({resetDays}d)</span>
          </span>
          <button
            className="ud-premium-refresh-btn"
            onClick={refreshAll}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="ud-premium-bar-track">
        <div
          className="ud-premium-bar-fill"
          style={{ width: `${Math.min(percentUsed, 100)}%`, background: color }}
        />
        {projection && projection.projectedPercent > percentUsed && (
          <div
            className="ud-premium-bar-projected"
            style={{
              left: `${Math.min(percentUsed, 100)}%`,
              width: `${Math.min(projection.projectedPercent - percentUsed, 100 - Math.min(percentUsed, 100))}%`,
            }}
          />
        )}
      </div>

      <div className="ud-premium-stats">
        <div className="ud-premium-stat">
          <span className="ud-premium-stat-value">{used.toLocaleString()}</span>
          <span className="ud-premium-stat-label">Used</span>
        </div>
        <div className="ud-premium-stat">
          <span className="ud-premium-stat-value">{quotaPremium.remaining.toLocaleString()}</span>
          <span className="ud-premium-stat-label">Remaining</span>
        </div>
        <div className="ud-premium-stat">
          <span className="ud-premium-stat-value">{total.toLocaleString()}</span>
          <span className="ud-premium-stat-label">Entitlement</span>
        </div>
        {overageRequests > 0 && (
          <div className="ud-premium-stat ud-premium-stat-overage">
            <span className="ud-premium-stat-value">{formatCurrency(overageCost)}</span>
            <span className="ud-premium-stat-label">Overage</span>
          </div>
        )}
      </div>

      {projection && (
        <div className="ud-premium-projection">
          <TrendingUp size={12} />
          <span className="ud-premium-projection-label">Projected:</span>
          <span className="ud-premium-projection-value">
            {projection.projectedTotal.toLocaleString()}
          </span>
          <span className="ud-premium-projection-divider">·</span>
          <span className="ud-premium-projection-rate">
            {Math.round(projection.dailyRate).toLocaleString()}/day
          </span>
          {projection.projectedOverage > 0 && (
            <>
              <span className="ud-premium-projection-divider">·</span>
              <span className="ud-premium-projection-overage">
                {formatCurrency(projection.projectedOverageCost)} est. overage
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Model breakdown with proportional bars ── */}
      {premium && premium.userMonthlyModels.length > 0 && (
        <div className="ud-prem-models">
          {premium.userMonthlyModels.slice(0, 6).map(m => {
            const pct = premium.userMonthlyRequests > 0
              ? (m.requests / premium.userMonthlyRequests) * 100
              : 0
            return (
              <div key={m.model} className="ud-prem-model">
                <div className="ud-prem-model-head">
                  <span className="ud-prem-model-name">{m.model}</span>
                  <span className="ud-prem-model-count">{m.requests.toLocaleString()}</span>
                </div>
                <div className="ud-prem-model-track">
                  <div
                    className="ud-prem-model-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Org context footer ── */}
      {premium && premium.orgMonthlyRequests > 0 && (
        <div className="ud-prem-footer">
          <span className="ud-prem-footer-text">
            Org total: <strong>{premium.orgMonthlyRequests.toLocaleString()}</strong> requests
            {premium.orgMonthlyNetCost > 0 && (
              <> · <strong>{formatCurrency(premium.orgMonthlyNetCost)}</strong> net cost</>
            )}
          </span>
        </div>
      )}
    </>
  )
}

// ── Seat-only view (non-configured org members) ──

function SeatView({ org, memberLogin, authUsername }: { org: string; memberLogin: string; authUsername?: string }) {
  const fetchRef = useRef(0)
  const cacheKey = `${org}/${memberLogin}`
  const cached = seatCache.get(cacheKey)
  const [state, dispatch] = useReducer(seatReducer, {
    data: cached?.data !== undefined ? cached.data : undefined,
    loading: false,
    error: null,
  })

  // Per-user premium request data
  const [premium, setPremium] = useState<UserPremiumData | null>(premiumCache.get(cacheKey)?.data ?? null)

  const fetchSeat = () => {
    const id = ++fetchRef.current
    dispatch({ type: 'FETCH_START' })
    window.github
      .getCopilotMemberUsage(org, memberLogin, authUsername)
      .then(result => {
        if (id !== fetchRef.current) return
        if (result.success) {
          seatCache.set(cacheKey, { data: result.data ?? null, fetchedAt: Date.now() })
          dispatch({ type: 'FETCH_SUCCESS', payload: result.data ?? null })
        } else {
          dispatch({ type: 'FETCH_ERROR', payload: result.error || 'Failed to load' })
        }
      })
      .catch(err => {
        if (id === fetchRef.current) {
          dispatch({ type: 'FETCH_ERROR', payload: err instanceof Error ? err.message : String(err) })
        }
      })
  }

  const fetchPremium = () => fetchPremiumData(org, memberLogin, authUsername, cacheKey, setPremium)

  useEffect(() => {
    const c = seatCache.get(cacheKey)
    if (c && Date.now() - c.fetchedAt < CACHE_TTL) {
      dispatch({ type: 'FETCH_SUCCESS', payload: c.data })
    } else {
      fetchSeat()
    }
    fetchPremium()
  }, [org, memberLogin, authUsername]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = () => {
    fetchSeat()
    premiumCache.delete(cacheKey)
    fetchPremium()
  }

  const { data, loading, error } = state

  if (loading && data === undefined) {
    return (
      <div className="ud-premium-loading">
        <Loader2 size={16} className="spin" />
        <span>Loading Copilot seat info…</span>
      </div>
    )
  }

  if (error && data === undefined) {
    return (
      <div className="ud-premium-error">
        <AlertCircle size={14} />
        <span>{error.includes('404') ? 'Copilot billing not available' : 'Failed to load seat data'}</span>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="ud-premium-seat-none">
        No Copilot seat assigned
      </div>
    )
  }

  if (data === undefined) return null

  const orgPct = premium && premium.orgMonthlyRequests > 0
    ? ((premium.userMonthlyRequests / premium.orgMonthlyRequests) * 100)
    : 0

  return (
    <div className="ud-prem">
      {/* ── Hero stats row ── */}
      {premium && (
        <div className="ud-prem-hero">
          <div className="ud-prem-hero-stat ud-prem-hero-stat--primary">
            <span className="ud-prem-hero-value">{premium.userMonthlyRequests.toLocaleString()}</span>
            <span className="ud-prem-hero-label">this month</span>
          </div>
          <div className="ud-prem-hero-divider" />
          <div className="ud-prem-hero-stat">
            <span className="ud-prem-hero-value">{premium.userTodayRequests.toLocaleString()}</span>
            <span className="ud-prem-hero-label">today</span>
          </div>
          <div className="ud-prem-hero-divider" />
          <div className="ud-prem-hero-stat">
            <span className="ud-prem-hero-value">{orgPct.toFixed(1)}%</span>
            <span className="ud-prem-hero-label">of org</span>
          </div>
          <button
            className="ud-prem-refresh"
            onClick={refreshAll}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
          </button>
        </div>
      )}

      {/* ── Seat metadata pills ── */}
      <div className="ud-prem-meta">
        <span className="ud-prem-pill">{formatPlanType(data.planType)}</span>
        {data.lastActivityAt && (
          <span className="ud-prem-pill ud-prem-pill--muted">
            <Clock size={10} />
            {formatDistanceToNow(data.lastActivityAt)}
          </span>
        )}
        {data.lastActivityEditor && (
          <span className="ud-prem-pill ud-prem-pill--muted">
            {data.lastActivityEditor.replace(/\/.*$/, '')}
          </span>
        )}
        {data.pendingCancellation && (
          <span className="ud-prem-pill ud-prem-pill--warn">
            Cancelling {new Date(data.pendingCancellation).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* ── Model breakdown with proportional bars ── */}
      {premium && premium.userMonthlyModels.length > 0 && (
        <div className="ud-prem-models">
          {premium.userMonthlyModels.slice(0, 6).map(m => {
            const pct = premium.userMonthlyRequests > 0
              ? (m.requests / premium.userMonthlyRequests) * 100
              : 0
            return (
              <div key={m.model} className="ud-prem-model">
                <div className="ud-prem-model-head">
                  <span className="ud-prem-model-name">{m.model}</span>
                  <span className="ud-prem-model-count">{m.requests.toLocaleString()}</span>
                </div>
                <div className="ud-prem-model-track">
                  <div
                    className="ud-prem-model-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Org context footer ── */}
      {premium && premium.orgMonthlyRequests > 0 && (
        <div className="ud-prem-footer">
          <span className="ud-prem-footer-text">
            Org total: <strong>{premium.orgMonthlyRequests.toLocaleString()}</strong> requests
            {premium.orgMonthlyNetCost > 0 && (
              <> · <strong>{formatCurrency(premium.orgMonthlyNetCost)}</strong> net cost</>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Main component ──

export function UserPremiumUsageSection({ username, org }: UserPremiumUsageSectionProps) {
  const { accounts } = useGitHubAccounts()

  const isConfigured = useMemo(
    () => accounts.some(a => a.username === username),
    [accounts, username]
  )

  // Find an account with a token for this org (for seat API auth)
  const authAccount = useMemo(
    () => accounts.find(a => a.org === org)?.username,
    [accounts, org]
  )

  return (
    <div className="ud-premium-section">
      {isConfigured ? (
        <QuotaView username={username} org={org} />
      ) : (
        <SeatView org={org} memberLogin={username} authUsername={authAccount} />
      )}
    </div>
  )
}
