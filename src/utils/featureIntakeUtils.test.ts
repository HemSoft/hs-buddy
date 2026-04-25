import { describe, it, expect } from 'vitest'
import {
  normalizeWhitespace,
  toCanonicalFragment,
  toCanonicalKey,
  sourceToLabel,
  toUniqueCriteria,
  ensureAcceptanceCriteria,
  validateIntakeInput,
  buildIssueTitle,
  buildIssueBody,
} from './featureIntakeUtils'

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeWhitespace('a   b   c')).toBe('a b c')
  })

  it('trims leading/trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello')
  })

  it('handles tabs and newlines', () => {
    expect(normalizeWhitespace('a\tb\nc')).toBe('a b c')
  })

  it('returns empty for whitespace-only', () => {
    expect(normalizeWhitespace('   ')).toBe('')
  })
})

describe('toCanonicalFragment', () => {
  it('lowercases and replaces non-alphanumeric', () => {
    expect(toCanonicalFragment('Hello World!')).toBe('hello-world')
  })

  it('strips leading/trailing hyphens', () => {
    expect(toCanonicalFragment('--hello--')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(toCanonicalFragment('')).toBe('')
  })
})

describe('toCanonicalKey', () => {
  it('builds deterministic key from fields', () => {
    const key = toCanonicalKey({
      source: 'jira',
      title: 'Add Feature X',
      problem: 'Users cannot do Y',
      acceptanceCriteria: ['Criterion A'],
    })
    expect(key).toMatch(/^fi-/)
    expect(key.length).toBeLessThanOrEqual(220)
  })

  it('truncates long keys to 220 chars', () => {
    const key = toCanonicalKey({
      source: 'jira',
      title: 'A'.repeat(200),
      problem: 'B'.repeat(200),
      acceptanceCriteria: ['C'.repeat(200)],
    })
    expect(key.length).toBe(220)
  })

  it('includes requestedOutcome when provided', () => {
    const with_ = toCanonicalKey({
      source: 'manual',
      title: 'T',
      problem: 'P',
      requestedOutcome: 'Outcome',
      acceptanceCriteria: [],
    })
    const without = toCanonicalKey({
      source: 'manual',
      title: 'T',
      problem: 'P',
      acceptanceCriteria: [],
    })
    expect(with_).not.toBe(without)
  })
})

describe('sourceToLabel', () => {
  it('prefixes source with source:', () => {
    expect(sourceToLabel('jira')).toBe('source:jira')
    expect(sourceToLabel('github-issue')).toBe('source:github-issue')
  })
})

describe('toUniqueCriteria', () => {
  it('deduplicates case-insensitively', () => {
    expect(toUniqueCriteria(['Test A', 'test a', 'Test B'])).toEqual(['Test A', 'Test B'])
  })

  it('filters empty/whitespace entries', () => {
    expect(toUniqueCriteria(['', '  ', 'Valid'])).toEqual(['Valid'])
  })

  it('normalizes whitespace in criteria', () => {
    expect(toUniqueCriteria(['  a   b  '])).toEqual(['a b'])
  })

  it('returns empty array for empty input', () => {
    expect(toUniqueCriteria([])).toEqual([])
  })
})

describe('ensureAcceptanceCriteria', () => {
  it('returns criteria when provided', () => {
    expect(ensureAcceptanceCriteria(['A', 'B'])).toEqual(['A', 'B'])
  })

  it('adds default criterion for empty array', () => {
    const result = ensureAcceptanceCriteria([])
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('triage')
  })

  it('adds default for undefined input', () => {
    const result = ensureAcceptanceCriteria()
    expect(result).toHaveLength(1)
  })

  it('deduplicates before checking emptiness', () => {
    expect(ensureAcceptanceCriteria(['Same', 'same'])).toEqual(['Same'])
  })
})

describe('validateIntakeInput', () => {
  it('passes for valid input', () => {
    expect(() => validateIntakeInput('EXT-1', 'Title', 'Problem')).not.toThrow()
  })

  it('throws for empty externalId', () => {
    expect(() => validateIntakeInput('', 'Title', 'Problem')).toThrow('externalId is required')
  })

  it('throws for empty title', () => {
    expect(() => validateIntakeInput('EXT-1', '', 'Problem')).toThrow('title is required')
  })

  it('throws for empty problem', () => {
    expect(() => validateIntakeInput('EXT-1', 'Title', '')).toThrow('problem is required')
  })
})

describe('buildIssueTitle', () => {
  it('adds [feature-intake] prefix', () => {
    expect(buildIssueTitle('My Feature')).toBe('[feature-intake] My Feature')
  })

  it('does not double-prefix', () => {
    expect(buildIssueTitle('[feature-intake] Already Prefixed')).toBe(
      '[feature-intake] Already Prefixed'
    )
  })

  it('normalizes whitespace', () => {
    expect(buildIssueTitle('  Extra   Spaces  ')).toBe('[feature-intake] Extra Spaces')
  })
})

describe('buildIssueBody', () => {
  const input = {
    source: 'jira',
    externalId: 'PROJ-123',
    title: 'Add Feature X',
    problem: 'Users cannot do Y',
    acceptanceCriteria: ['Criterion A', 'Criterion B'],
    canonicalKey: 'fi-test-key',
    riskLabel: 'risk:low',
  }

  it('contains all required sections', () => {
    const body = buildIssueBody(input)
    expect(body).toContain('## Summary')
    expect(body).toContain('## Problem')
    expect(body).toContain('## Acceptance Criteria')
    expect(body).toContain('## Source Metadata')
    expect(body).toContain('## Agent Metadata')
  })

  it('includes criteria as checklist', () => {
    const body = buildIssueBody(input)
    expect(body).toContain('- [ ] Criterion A')
    expect(body).toContain('- [ ] Criterion B')
  })

  it('includes optional fields when present', () => {
    const body = buildIssueBody({
      ...input,
      externalUrl: 'https://jira.example.com/PROJ-123',
      requestedBy: 'Alice',
      requestedOutcome: 'Users can do Y',
    })
    expect(body).toContain('Source URL: https://jira.example.com/PROJ-123')
    expect(body).toContain('Requested by: Alice')
    expect(body).toContain('Users can do Y')
  })

  it('uses default outcome when not provided', () => {
    const body = buildIssueBody(input)
    expect(body).toContain('Define desired user/business outcome during triage.')
  })

  it('includes HTML comment with canonical key', () => {
    const body = buildIssueBody(input)
    expect(body).toContain('<!-- buddy:feature-intake-key:fi-test-key -->')
  })
})
