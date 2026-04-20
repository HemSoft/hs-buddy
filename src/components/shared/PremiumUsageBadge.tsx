import { useEffect, useReducer, useRef } from 'react'
import { Zap } from 'lucide-react'
import { getQuotaColor } from '../copilot-usage/quotaUtils'

import './PremiumUsageBadge.css'

interface PremiumUsageBadgeProps {
  /** GitHub username to fetch quota for */
  username: string
  /** Optional className */
  className?: string
}

interface QuotaCache {
  percentUsed: number
  remaining: number
  entitlement: number
  fetchedAt: number
}

type PremiumUsageState =
  | { status: 'idle'; data: QuotaCache | null }
  | { status: 'loading'; data: null }
  | { status: 'done'; data: QuotaCache }
  | { status: 'error'; data: null }

type PremiumUsageAction =
  | { type: 'reset' }
  | { type: 'loading' }
  | { type: 'done'; data: QuotaCache }
  | { type: 'error' }

// Module-level cache so switching back to an account doesn't re-fetch
const quotaCache = new Map<string, QuotaCache>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function premiumUsageReducer(
  _state: PremiumUsageState,
  action: PremiumUsageAction
): PremiumUsageState {
  switch (action.type) {
    case 'reset':
      return { status: 'idle', data: null }
    case 'loading':
      return { status: 'loading', data: null }
    case 'done':
      return { status: 'done', data: action.data }
    case 'error':
      return { status: 'error', data: null }
  }
}

function createInitialState(username: string): PremiumUsageState {
  const cached = quotaCache.get(username)
  return cached ? { status: 'done', data: cached } : { status: 'idle', data: null }
}

/**
 * Compact inline badge showing Copilot premium usage for a GitHub account.
 * Renders a tiny progress bar with percentage - designed to sit next to an AccountPicker.
 */
export function PremiumUsageBadge({ username, className }: PremiumUsageBadgeProps) {
  const [state, dispatch] = useReducer(premiumUsageReducer, username, createInitialState)
  const fetchRef = useRef(0)

  useEffect(() => {
    if (!username) {
      dispatch({ type: 'reset' })
      return
    }

    // Use cache if fresh
    const cached = quotaCache.get(username)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      dispatch({ type: 'done', data: cached })
      return
    }

    const id = ++fetchRef.current
    dispatch({ type: 'loading' })

    window.github
      .getCopilotQuota(username)
      .then(result => {
        /* v8 ignore start */
        if (id !== fetchRef.current) return // stale
        /* v8 ignore stop */
        if (result.success && result.data) {
          const p = result.data.quota_snapshots.premium_interactions
          const entry: QuotaCache = {
            percentUsed: 100 - p.percent_remaining,
            remaining: p.remaining,
            entitlement: p.entitlement,
            fetchedAt: Date.now(),
          }
          quotaCache.set(username, entry)
          dispatch({ type: 'done', data: entry })
        } else {
          dispatch({ type: 'error' })
        }
      })
      .catch(() => {
        /* v8 ignore start */
        if (id === fetchRef.current) {
          /* v8 ignore stop */
          dispatch({ type: 'error' })
        }
      })
  }, [username])

  if (state.status === 'loading' || state.status === 'error') return null

  const data = state.data
  if (!data) return null

  const pct = data.percentUsed
  const color = getQuotaColor(pct)

  return (
    <div
      className={`premium-usage-badge ${className ?? ''}`}
      title={`Premium: ${data.remaining} of ${data.entitlement} remaining (${pct.toFixed(1)}% used)`}
    >
      <Zap size={11} style={{ color, flexShrink: 0 }} />
      <div className="premium-usage-badge-bar">
        <div
          className="premium-usage-badge-fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <span className="premium-usage-badge-pct" style={{ color }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}
