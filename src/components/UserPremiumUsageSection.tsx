import { useEffect, useReducer, useRef, useMemo, useState } from 'react'
import { Loader2, TrendingUp, AlertCircle, RefreshCw, Calendar, Clock } from 'lucide-react'
import {
  OVERAGE_COST_PER_REQUEST,
  formatCurrency,
  computeProjection,
  getQuotaColor,
  type QuotaData,
} from './copilot-usage/quotaUtils'
import { daysUntilReset, formatCopilotPlan, formatResetDate } from '../utils/copilotFormatUtils'
import { formatDistanceToNow } from '../utils/dateUtils'
import { useGitHubAccounts } from '../hooks/useConfig'
import { getErrorMessage } from '../utils/errorUtils'
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

/** @internal Reset module-level caches (used in tests) */
// eslint-disable-next-line react-refresh/only-export-components
export function _resetCaches() {
  quotaCache.clear()
  seatCache.clear()
  premiumCache.clear()
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
    .catch(() => {
      /* best effort */
    })
}

// ── Shared sub-components ──

function ModelBreakdown({ premium }: { premium: UserPremiumData }) {
  /* v8 ignore start */
  if (premium.userMonthlyModels.length === 0) return null
  /* v8 ignore stop */
  return (
    <div className="ud-prem-models">
      {premium.userMonthlyModels.slice(0, 6).map(m => {
        const pct =
          premium.userMonthlyRequests > 0 ? (m.requests / premium.userMonthlyRequests) * 100 : 0
        return (
          <div key={m.model} className="ud-prem-model">
            <div className="ud-prem-model-head">
              <span className="ud-prem-model-name">{m.model}</span>
              <span className="ud-prem-model-count">{m.requests.toLocaleString()}</span>
            </div>
            <div className="ud-prem-model-track">
              <div className="ud-prem-model-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OrgContextFooter({ premium }: { premium: UserPremiumData }) {
  /* v8 ignore start */
  if (premium.orgMonthlyRequests <= 0) return null
  /* v8 ignore stop */
  return (
    <div className="ud-prem-footer">
      <span className="ud-prem-footer-text">
        Org total: <strong>{premium.orgMonthlyRequests.toLocaleString()}</strong> requests
        {premium.orgMonthlyNetCost > 0 && (
          <>
            {' '}
            · <strong>{formatCurrency(premium.orgMonthlyNetCost)}</strong> net cost
          </>
        )}
      </span>
    </div>
  )
}

// ── Quota view metrics computation ──

interface QuotaViewMetrics {
  used: number
  total: number
  percentUsed: number
  overageRequests: number
  overageCost: number
  color: string
  resetDays: number
}

function computeQuotaViewMetrics(
  quotaPremium: NonNullable<QuotaData['quota_snapshots']['premium_interactions']>,
  resetDateUtc: string
): QuotaViewMetrics {
  const used = quotaPremium.entitlement - quotaPremium.remaining
  const total = quotaPremium.entitlement
  const percentUsed = total > 0 ? (used / total) * 100 : 0
  const overageByCount = Math.max(0, quotaPremium.overage_count ?? 0)
  /* v8 ignore start */
  const overageByRemaining = Math.max(0, -(quotaPremium.remaining ?? 0))
  /* v8 ignore stop */
  const overageRequests = Math.max(overageByCount, overageByRemaining)
  const overageCost = overageRequests * OVERAGE_COST_PER_REQUEST
  const color = getQuotaColor(percentUsed)
  const resetDays = daysUntilReset(resetDateUtc)
  return { used, total, percentUsed, overageRequests, overageCost, color, resetDays }
}

function QuotaBarAndStats({
  metrics,
  quotaPremium,
  projection,
}: {
  metrics: QuotaViewMetrics
  quotaPremium: NonNullable<QuotaData['quota_snapshots']['premium_interactions']>
  projection: ReturnType<typeof computeProjection>
}) {
  const { percentUsed, used, total, overageRequests, overageCost, color } = metrics
  return (
    <>
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
    </>
  )
}

function QuotaProjectionBanner({
  projection,
}: {
  projection: ReturnType<typeof computeProjection>
}) {
  if (!projection) return null
  return (
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
  )
}

// ── Quota / seat init helpers ──

function initQuotaState(username: string): QuotaFetchState {
  const cached = quotaCache.get(username)
  return {
    data: cached?.data ?? null,
    loading: false,
    error: null,
    fetchedAt: cached?.fetchedAt ?? null,
  }
}

function initSeatState(cacheKey: string): SeatFetchState {
  const cached = seatCache.get(cacheKey)
  return {
    data: cached?.data !== undefined ? cached.data : undefined,
    loading: false,
    error: null,
  }
}

function initPremiumFromCache(cacheKey: string): UserPremiumData | null {
  return premiumCache.get(cacheKey)?.data ?? null
}

// ── Error message sub-components ──

function QuotaErrorMessage({ error }: { error: string }) {
  return (
    <span>
      {error.includes('404') ? 'No Copilot subscription' : 'Failed to load premium usage'}
    </span>
  )
}

function SeatErrorMessage({ error }: { error: string }) {
  return (
    <span>
      {error.includes('404') ? 'Copilot billing not available' : 'Failed to load seat data'}
    </span>
  )
}

// ── Premium conditional sections ──

function QuotaPremiumSections({ premium }: { premium: UserPremiumData | null }) {
  if (!premium) return null
  return (
    <>
      {premium.userMonthlyModels.length > 0 && <ModelBreakdown premium={premium} />}
      {premium.orgMonthlyRequests > 0 && <OrgContextFooter premium={premium} />}
    </>
  )
}

function SeatPremiumContent({
  premium,
  loading,
  onRefresh,
}: {
  premium: UserPremiumData | null
  loading: boolean
  onRefresh: () => void
}) {
  if (!premium) return null
  return (
    <>
      <SeatHeroStats premium={premium} loading={loading} onRefresh={onRefresh} />
      {premium.userMonthlyModels.length > 0 && <ModelBreakdown premium={premium} />}
      {premium.orgMonthlyRequests > 0 && <OrgContextFooter premium={premium} />}
    </>
  )
}

// ── Full quota view (configured accounts) ──

function QuotaView({ username, org }: { username: string; org: string }) {
  const fetchRef = useRef(0)
  const [state, dispatch] = useReducer(quotaReducer, initQuotaState(username))

  // Premium model data (shared with SeatView)
  const premCacheKey = `${org}/${username}`
  const [premium, setPremium] = useState<UserPremiumData | null>(initPremiumFromCache(premCacheKey))

  const fetchPremium = () => fetchPremiumData(org, username, username, premCacheKey, setPremium)

  const fetchQuota = () => {
    const id = ++fetchRef.current
    dispatch({ type: 'FETCH_START' })
    window.github
      .getCopilotQuota(username)
      .then(result => {
        /* v8 ignore start */
        if (id !== fetchRef.current) return
        /* v8 ignore stop */
        if (result.success && result.data) {
          const now = Date.now()
          quotaCache.set(username, { data: result.data, fetchedAt: now })
          dispatch({ type: 'FETCH_SUCCESS', payload: result.data, fetchedAt: now })
        } else {
          dispatch({ type: 'FETCH_ERROR', payload: result.error || 'Failed to load' })
        }
      })
      .catch(err => {
        /* v8 ignore start */
        if (id === fetchRef.current) {
          /* v8 ignore stop */
          dispatch({ type: 'FETCH_ERROR', payload: getErrorMessage(err) })
        }
      })
  }

  const refreshAll = () => {
    fetchQuota()
    premiumCache.delete(premCacheKey)
    fetchPremium()
  }

  useEffect(() => {
    /* v8 ignore start */
    if (!username) return
    /* v8 ignore stop */
    const c = quotaCache.get(username)
    if (c && Date.now() - c.fetchedAt < CACHE_TTL) {
      dispatch({ type: 'FETCH_SUCCESS', payload: c.data, fetchedAt: c.fetchedAt })
    } else {
      fetchQuota()
    }
    fetchPremium()
  }, [username]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, error } = state

  if (!data) {
    if (loading) {
      return (
        <div className="ud-premium-loading">
          <Loader2 size={16} className="spin" />
          <span>Loading premium usage…</span>
        </div>
      )
    }
    if (error) {
      return (
        <div className="ud-premium-error">
          <AlertCircle size={14} />
          <QuotaErrorMessage error={error} />
        </div>
      )
    }
    return null
  }

  const quotaPremium = data.quota_snapshots?.premium_interactions
  if (!quotaPremium) return null

  const metrics = computeQuotaViewMetrics(quotaPremium, data.quota_reset_date_utc)
  const projection = computeProjection(quotaPremium, data.quota_reset_date_utc)

  return (
    <>
      <div className="ud-premium-header">
        <div className="ud-premium-header-left">
          <span className="ud-premium-pct" style={{ color: metrics.color }}>
            {metrics.percentUsed.toFixed(1)}%
          </span>
          <span className="ud-premium-used-label">used</span>
        </div>
        <div className="ud-premium-header-right">
          <span className="ud-premium-reset">
            <Calendar size={11} />
            Resets {formatResetDate(data.quota_reset_date_utc)}
            <span className="ud-premium-reset-days">({metrics.resetDays}d)</span>
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

      <QuotaBarAndStats metrics={metrics} quotaPremium={quotaPremium} projection={projection} />
      <QuotaProjectionBanner projection={projection} />

      <QuotaPremiumSections premium={premium} />
    </>
  )
}

// ── Seat-only view (non-configured org members) ──

function SeatView({
  org,
  memberLogin,
  authUsername,
}: {
  org: string
  memberLogin: string
  authUsername?: string
}) {
  const fetchRef = useRef(0)
  const cacheKey = `${org}/${memberLogin}`
  const [state, dispatch] = useReducer(seatReducer, initSeatState(cacheKey))

  // Per-user premium request data
  const [premium, setPremium] = useState<UserPremiumData | null>(initPremiumFromCache(cacheKey))

  const fetchSeat = () => {
    const id = ++fetchRef.current
    dispatch({ type: 'FETCH_START' })
    window.github
      .getCopilotMemberUsage(org, memberLogin, authUsername)
      .then(result => {
        /* v8 ignore start */
        if (id !== fetchRef.current) return
        /* v8 ignore stop */
        if (result.success) {
          seatCache.set(cacheKey, { data: result.data ?? null, fetchedAt: Date.now() })
          dispatch({ type: 'FETCH_SUCCESS', payload: result.data ?? null })
        } else {
          dispatch({ type: 'FETCH_ERROR', payload: result.error || 'Failed to load' })
        }
      })
      .catch(err => {
        /* v8 ignore start */
        if (id === fetchRef.current) {
          /* v8 ignore stop */
          dispatch({ type: 'FETCH_ERROR', payload: getErrorMessage(err) })
        }
      })
  }

  const fetchPremium = () => fetchPremiumData(org, memberLogin, authUsername, cacheKey, setPremium)

  useEffect(() => {
    const c = seatCache.get(cacheKey)
    /* v8 ignore start */
    if (c && Date.now() - c.fetchedAt < CACHE_TTL) {
      dispatch({ type: 'FETCH_SUCCESS', payload: c.data })
      /* v8 ignore stop */
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
        <SeatErrorMessage error={error} />
      </div>
    )
  }

  if (data === null) {
    return <div className="ud-premium-seat-none">No Copilot seat assigned</div>
  }

  if (data === undefined) return null

  return (
    <div className="ud-prem">
      <SeatPremiumContent premium={premium} loading={loading} onRefresh={refreshAll} />
      <SeatMetaPills data={data} />
    </div>
  )
}

function SeatHeroStats({
  premium,
  loading,
  onRefresh,
}: {
  premium: UserPremiumData
  loading: boolean
  onRefresh: () => void
}) {
  const orgPct =
    premium.orgMonthlyRequests > 0
      ? (premium.userMonthlyRequests / premium.orgMonthlyRequests) * 100
      : 0

  return (
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
      <button className="ud-prem-refresh" onClick={onRefresh} disabled={loading} title="Refresh">
        <RefreshCw size={12} className={loading ? 'spin' : ''} />
      </button>
    </div>
  )
}

function SeatMetaPills({ data }: { data: SeatData }) {
  return (
    <div className="ud-prem-meta">
      <span className="ud-prem-pill">{formatCopilotPlan(data.planType)}</span>
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
  const authAccount = useMemo(() => accounts.find(a => a.org === org)?.username, [accounts, org])

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
