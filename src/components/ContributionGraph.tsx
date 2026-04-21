import { useMemo } from 'react'
import type { ContributionWeek } from '../api/github'
import { MONTH_SHORT } from '../utils/dateUtils'

interface ContributionGraphProps {
  weeks: ContributionWeek[]
  totalContributions: number
  source?: 'self' | 'public' | 'org-commits'
}

const CELL_SIZE = 10
const CELL_GAP = 2
const CELL_STEP = CELL_SIZE + CELL_GAP
const MONTH_LABEL_HEIGHT = 14
const DAY_LABEL_WIDTH = 28

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

/** Map GitHub's light-theme contribution colors to dark-theme equivalents */
function toDarkColor(color: string): string {
  const c = color.toLowerCase()
  // GitHub light-theme empty/zero cell
  if (c === '#ebedf0') return '#161b22'
  // GitHub light-theme greens (level 1–4)
  if (c === '#9be9a8') return '#0e4429'
  if (c === '#40c463') return '#006d32'
  if (c === '#30a14e') return '#26a641'
  if (c === '#216e39') return '#39d353'
  // Already dark or custom — pass through
  return color
}

export function ContributionGraph({ weeks, totalContributions, source }: ContributionGraphProps) {
  const monthLabels = useMemo(() => {
    const labels: Array<{ text: string; x: number }> = []
    let lastMonth = -1

    for (let wi = 0; wi < weeks.length; wi++) {
      const firstDay = weeks[wi].contributionDays[0]
      if (!firstDay) continue
      const month = new Date(firstDay.date + 'T00:00:00').getMonth()
      if (month !== lastMonth) {
        labels.push({ text: MONTH_SHORT[month], x: DAY_LABEL_WIDTH + wi * CELL_STEP })
        lastMonth = month
      }
    }
    return labels
  }, [weeks])

  const svgWidth = DAY_LABEL_WIDTH + weeks.length * CELL_STEP
  const svgHeight = MONTH_LABEL_HEIGHT + 7 * CELL_STEP

  return (
    <div className="ud-contrib-graph">
      <div className="ud-contrib-header">
        <span className="ud-contrib-total">
          {totalContributions.toLocaleString()}{' '}
          {source === 'org-commits' ? 'org commits' : 'contributions'} in the last year
        </span>
      </div>
      <div className="ud-contrib-scroll">
        <svg width={svgWidth} height={svgHeight} className="ud-contrib-svg">
          {/* Month labels */}
          {monthLabels.map(({ text, x }) => (
            <text key={`${text}-${x}`} x={x} y={10} className="ud-contrib-month-label">
              {text}
            </text>
          ))}

          {/* Day-of-week labels */}
          {DAY_LABELS.map((label, i) =>
            label ? (
              <text
                key={label}
                x={0}
                y={MONTH_LABEL_HEIGHT + i * CELL_STEP + CELL_SIZE - 1}
                className="ud-contrib-day-label"
              >
                {label}
              </text>
            ) : null
          )}

          {/* Contribution cells */}
          {weeks.map((week, wi) =>
            week.contributionDays.map(day => {
              const dayOfWeek = new Date(day.date + 'T00:00:00').getDay()
              return (
                <rect
                  key={day.date}
                  x={DAY_LABEL_WIDTH + wi * CELL_STEP}
                  y={MONTH_LABEL_HEIGHT + dayOfWeek * CELL_STEP}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  ry={2}
                  fill={toDarkColor(day.color)}
                  className="ud-contrib-cell"
                >
                  <title>
                    {day.contributionCount} contribution{day.contributionCount !== 1 ? 's' : ''} on{' '}
                    {day.date}
                  </title>
                </rect>
              )
            })
          )}
        </svg>
      </div>
    </div>
  )
}
