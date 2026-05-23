import { getQuotaColor } from './quotaUtils'

function clampPercent(value: number | undefined): number {
  return Math.min(value ?? 0, 100)
}

function ProjectedArc({
  size,
  radius,
  circumference,
  strokeWidth,
  projectedCapped,
}: {
  size: number
  radius: number
  circumference: number
  strokeWidth: number
  projectedCapped: number
}) {
  return (
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke={getQuotaColor(projectedCapped)}
      strokeWidth={strokeWidth}
      strokeDasharray={`${circumference * 0.015} ${circumference * 0.01}`}
      strokeDashoffset={circumference - (projectedCapped / 100) * circumference}
      strokeLinecap="butt"
      opacity={0.3}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
      style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
    />
  )
}

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
  const offset = circumference - (clampPercent(percentUsed) / 100) * circumference
  const color = getQuotaColor(percentUsed)
  const projectedCapped = clampPercent(projectedPercent)
  const showProjected = projectedPercent != null && projectedPercent > percentUsed

  return (
    <svg width={size} height={size} className="usage-ring">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      {showProjected && (
        <ProjectedArc
          size={size}
          radius={radius}
          circumference={circumference}
          strokeWidth={strokeWidth}
          projectedCapped={projectedCapped}
        />
      )}
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
