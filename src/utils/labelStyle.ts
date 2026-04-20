import type { CSSProperties } from 'react'

/** Computes inline styles for a GitHub label given its hex color (without leading #). */
export function getLabelStyle(color: string): CSSProperties {
  // Normalize 3-digit hex to 6-digit so appended alpha bytes produce valid #RRGGBBAA
  const hex = color.length === 3 ? [...color].map(c => c + c).join('') : color
  return {
    backgroundColor: `#${hex}20`,
    color: `#${hex}`,
    borderColor: `#${hex}40`,
  }
}
