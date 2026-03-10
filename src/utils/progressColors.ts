const PROGRESS_COLORS = [
  { max: 25, color: '#4ec9b0' },
  { max: 50, color: '#dcd34a' },
  { max: 75, color: '#e89b3c' },
  { max: 100, color: '#e85d5d' },
] as const

export function getProgressColor(progress: number): string {
  return (
    PROGRESS_COLORS.find(colorStop => progress <= colorStop.max) ??
    PROGRESS_COLORS[PROGRESS_COLORS.length - 1]
  ).color
}
