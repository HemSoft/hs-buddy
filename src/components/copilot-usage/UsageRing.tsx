/** SVG circular progress ring */
export function UsageRing({
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
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
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
