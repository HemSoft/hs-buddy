export function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + Math.round((255 * percent) / 100))
  const g = Math.min(255, ((num >> 8) & 0x00ff) + Math.round((255 * percent) / 100))
  const b = Math.min(255, (num & 0x0000ff) + Math.round((255 * percent) / 100))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export const DARK_DEFAULTS = {
  accentColor: '#0e639c',
  fontColor: '#cccccc',
  bgPrimary: '#1e1e1e',
  bgSecondary: '#252526',
  statusBarBg: '#181818',
  statusBarFg: '#9d9d9d',
}

export const LIGHT_DEFAULTS = {
  accentColor: '#0078d4',
  fontColor: '#1f1f1f',
  bgPrimary: '#ffffff',
  bgSecondary: '#f3f3f3',
  statusBarBg: '#f3f3f3',
  statusBarFg: '#616161',
}

export interface ColorDef {
  id: string
  label: string
  hint: string
  value: string
  onChange: (color: string) => void
}
