import { describe, expect, it } from 'vitest'
import {
  formatSize,
  formatDate,
  getLanguageColor,
  getWorkflowStatusInfo,
} from './repoDetailUtils'

describe('formatSize', () => {
  it('formats kilobytes', () => {
    expect(formatSize(500)).toBe('500 KB')
  })

  it('formats megabytes', () => {
    expect(formatSize(2048)).toBe('2.0 MB')
  })

  it('formats gigabytes', () => {
    expect(formatSize(2_097_152)).toBe('2.00 GB')
  })

  it('handles exact boundary (1024 KB → 1.0 MB)', () => {
    expect(formatSize(1024)).toBe('1.0 MB')
  })

  it('handles zero', () => {
    expect(formatSize(0)).toBe('0 KB')
  })
})

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2024-06-15T12:00:00Z')
    // Locale-dependent but should contain Jun 15, 2024
    expect(result).toContain('Jun')
    expect(result).toContain('15')
    expect(result).toContain('2024')
  })

  it('returns N/A for empty string', () => {
    expect(formatDate('')).toBe('N/A')
  })
})

describe('getLanguageColor', () => {
  it('returns the correct color for TypeScript', () => {
    expect(getLanguageColor('TypeScript')).toBe('#3178c6')
  })

  it('returns the correct color for Python', () => {
    expect(getLanguageColor('Python')).toBe('#3572a5')
  })

  it('returns fallback gray for unknown languages', () => {
    expect(getLanguageColor('Brainfuck')).toBe('#8b8b8b')
  })

  it('returns correct colors for all defined languages', () => {
    // Spot-check several
    expect(getLanguageColor('JavaScript')).toBe('#f1e05a')
    expect(getLanguageColor('Go')).toBe('#00add8')
    expect(getLanguageColor('Rust')).toBe('#dea584')
    expect(getLanguageColor('Ruby')).toBe('#701516')
    expect(getLanguageColor('C#')).toBe('#178600')
    expect(getLanguageColor('C++')).toBe('#f34b7d')
  })
})

describe('getWorkflowStatusInfo', () => {
  it('returns success info for completed/success', () => {
    const info = getWorkflowStatusInfo('completed', 'success')
    expect(info.label).toBe('Passing')
    expect(info.color).toBe('var(--accent-success)')
  })

  it('returns failure info for completed/failure', () => {
    const info = getWorkflowStatusInfo('completed', 'failure')
    expect(info.label).toBe('Failing')
    expect(info.color).toBe('var(--accent-error)')
  })

  it('returns cancelled info for completed/cancelled', () => {
    const info = getWorkflowStatusInfo('completed', 'cancelled')
    expect(info.label).toBe('Cancelled')
  })

  it('returns the raw conclusion for unknown conclusions', () => {
    const info = getWorkflowStatusInfo('completed', 'skipped')
    expect(info.label).toBe('skipped')
    expect(info.color).toBe('var(--accent-warning)')
  })

  it('returns "Unknown" when conclusion is null with completed status', () => {
    const info = getWorkflowStatusInfo('completed', null)
    expect(info.label).toBe('Unknown')
  })

  it('returns running info for in_progress', () => {
    const info = getWorkflowStatusInfo('in_progress', null)
    expect(info.label).toBe('Running')
    expect(info.color).toBe('var(--accent-warning)')
  })

  it('returns raw status for other statuses', () => {
    const info = getWorkflowStatusInfo('queued', null)
    expect(info.label).toBe('queued')
    expect(info.color).toBe('var(--text-secondary)')
  })
})
