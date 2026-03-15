import { useMemo } from 'react'
import './RateLimitGauge.css'

interface RateLimitGaugeProps {
  remaining: number
  limit: number
  reset: number
}

function getGaugeColor(ratio: number): string {
  if (ratio > 0.6) {
    const t = (ratio - 0.6) / 0.4
    const r = Math.round(80 + (1 - t) * 140)
    const g = Math.round(200 - (1 - t) * 30)
    return `rgb(${r}, ${g}, 80)`
  }
  if (ratio > 0.3) {
    const t = (ratio - 0.3) / 0.3
    const r = Math.round(240 - t * 20)
    const g = Math.round(120 + t * 50)
    return `rgb(${r}, ${g}, 50)`
  }
  const t = ratio / 0.3
  const r = Math.round(220 + (1 - t) * 20)
  const g = Math.round(t * 120)
  return `rgb(${r}, ${g}, 40)`
}

function formatResetTime(resetTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = resetTimestamp - now
  if (diff <= 0) return 'now'
  const mins = Math.ceil(diff / 60)
  return `${mins}m`
}

export function RateLimitGauge({ remaining, limit, reset }: RateLimitGaugeProps) {
  const ratio = limit > 0 ? remaining / limit : 1
  const color = useMemo(() => getGaugeColor(ratio), [ratio])
  const resetLabel = formatResetTime(reset)

  // Proven technique: <circle> + stroke-dasharray (CSS-Tricks progress ring)
  // A circle with dasharray = half circumference shows a semicircle.
  // stroke-dashoffset controls how much of that semicircle is filled.
  const radius = 28
  const strokeWidth = 5
  const cx = 36
  const cy = 38 // push center down so the semicircle's flat edge is near bottom
  const circumference = 2 * Math.PI * radius // ~175.93
  const halfCircumference = Math.PI * radius // ~87.96

  // Track: show exactly one semicircle (top half)
  const trackDasharray = `${halfCircumference} ${circumference}`

  // Fill: show ratio of the semicircle
  const fillLength = ratio * halfCircumference
  const fillDasharray = `${fillLength} ${circumference}`

  return (
    <div className="rate-limit-gauge">
      <svg viewBox="0 0 72 44" className="rate-limit-gauge-svg">
        {/* Track — dimmed semicircle */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={trackDasharray}
          transform={`rotate(180 ${cx} ${cy})`}
        />
        {/* Fill — colored portion */}
        {ratio > 0.005 && (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={fillDasharray}
            transform={`rotate(180 ${cx} ${cy})`}
          />
        )}
      </svg>
      <div className="rate-limit-gauge-label">
        <span className="rate-limit-gauge-value" style={{ color }}>
          {remaining.toLocaleString()}
        </span>
        <span className="rate-limit-gauge-caption">
          / {limit.toLocaleString()} · resets {resetLabel}
        </span>
      </div>
    </div>
  )
}
