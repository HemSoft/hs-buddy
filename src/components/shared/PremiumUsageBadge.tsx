import { useState, useEffect, useRef } from 'react'
import { Zap } from 'lucide-react'

import './PremiumUsageBadge.css'

export interface PremiumUsageBadgeProps {
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

// Module-level cache so switching back to an account doesn't re-fetch
const quotaCache = new Map<string, QuotaCache>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Compact inline badge showing Copilot premium usage for a GitHub account.
 * Renders a tiny progress bar with percentage — designed to sit next to an AccountPicker.
 */
export function PremiumUsageBadge({ username, className }: PremiumUsageBadgeProps) {
  const [data, setData] = useState<QuotaCache | null>(quotaCache.get(username) ?? null)
  const [loading, setLoading] = useState(false)
  const fetchRef = useRef(0)

  useEffect(() => {
    if (!username) {
      setData(null)
      return
    }

    // Use cache if fresh
    const cached = quotaCache.get(username)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setData(cached)
      return
    }

    const id = ++fetchRef.current
    setLoading(true)

    window.github
      .getCopilotQuota(username)
      .then(result => {
        if (id !== fetchRef.current) return // stale
        if (result.success && result.data) {
          const p = result.data.quota_snapshots.premium_interactions
          const entry: QuotaCache = {
            percentUsed: 100 - p.percent_remaining,
            remaining: p.remaining,
            entitlement: p.entitlement,
            fetchedAt: Date.now(),
          }
          quotaCache.set(username, entry)
          setData(entry)
        } else {
          setData(null)
        }
      })
      .catch(() => {
        if (id === fetchRef.current) setData(null)
      })
      .finally(() => {
        if (id === fetchRef.current) setLoading(false)
      })
  }, [username])

  if (loading && !data) return null
  if (!data) return null

  const pct = data.percentUsed

  const getColor = (p: number) => {
    if (p >= 90) return '#e85d5d'
    if (p >= 75) return '#e89b3c'
    if (p >= 50) return '#dcd34a'
    return '#4ec9b0'
  }

  const color = getColor(pct)

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
