import { getQuotaColor } from './quotaUtils'

/** SVG circular progress ring with optional projected ghost arc */
export function UsageRing({
  percentUsed,
  projectedPercent,
  size = 100,
  strokeWidth = 8,
}: {
  percentUsed: number
  projectedPercent?: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(percentUsed, 100) / 100) * circumference

  const color = getQuotaColor(percentUsed)

  // Projected arc: show where usage will be at month-end (capped at 100% visually)
  const showProjected = projectedPercent != null && projectedPercent > percentUsed
  const projectedCapped = Math.min(projectedPercent ?? 0, 100)
  const projectedOffset = circumference - (projectedCapped / 100) * circumference
  const projectedColor = getQuotaColor(projectedCapped)

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
      {/* Projected ghost arc (dashed, behind actual) */}
      {showProjected && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={projectedColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * 0.015} ${circumference * 0.01}`}
          strokeDashoffset={projectedOffset}
          strokeLinecap="butt"
          opacity={0.3}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
      )}
      {/* Actual usage arc */}
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
