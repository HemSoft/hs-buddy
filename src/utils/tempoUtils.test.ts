import { describe, it, expect } from 'vitest'
import type { TempoApiWorklog, TempoWorklog } from '../types/tempo'
import {
  resolveWorklogAccountKey,
  enrichWorklog,
  parseCapitalizationField,
  buildCreateWorklogBody,
  buildUpdateWorklogBody,
  summarizeWorklogs,
  isCacheEntryValid,
} from './tempoUtils'

describe('resolveWorklogAccountKey', () => {
  it('returns account value when _Account_ attribute is present', () => {
    const raw = {
      attributes: { values: [{ key: '_Account_', value: 'PROJ-123' }] },
    } as unknown as TempoApiWorklog
    expect(resolveWorklogAccountKey(raw)).toBe('PROJ-123')
  })

  it('returns empty string when no _Account_ attribute', () => {
    const raw = {
      attributes: { values: [{ key: 'other', value: 'x' }] },
    } as unknown as TempoApiWorklog
    expect(resolveWorklogAccountKey(raw)).toBe('')
  })

  it('returns empty string when attributes are undefined', () => {
    const raw = {} as unknown as TempoApiWorklog
    expect(resolveWorklogAccountKey(raw)).toBe('')
  })

  it('returns empty string when values is empty', () => {
    const raw = {
      attributes: { values: [] },
    } as unknown as TempoApiWorklog
    expect(resolveWorklogAccountKey(raw)).toBe('')
  })
})

describe('enrichWorklog', () => {
  const baseRaw: TempoApiWorklog = {
    tempoWorklogId: 42,
    issue: { id: 100 },
    timeSpentSeconds: 5400,
    startDate: '2025-03-15',
    startTime: '09:30:00',
    description: 'Code review',
    author: { accountId: 'user1' },
    attributes: { values: [{ key: '_Account_', value: 'DEV' }] },
  }

  it('enriches a worklog with issue info and account map', () => {
    const accountMap = new Map([['DEV', 'Development']])
    const result = enrichWorklog(baseRaw, { key: 'PROJ-1', summary: 'Fix bug' }, accountMap)
    expect(result).toEqual({
      id: 42,
      issueKey: 'PROJ-1',
      issueSummary: 'Fix bug',
      hours: 1.5,
      date: '2025-03-15',
      startTime: '09:30',
      description: 'Code review',
      accountKey: 'DEV',
      accountName: 'Development',
    })
  })

  it('uses accountKey as accountName when not in map', () => {
    const result = enrichWorklog(baseRaw, { key: 'X-1', summary: '' }, new Map())
    expect(result.accountName).toBe('DEV')
  })

  it('defaults startTime to 08:00 when missing', () => {
    const raw = { ...baseRaw, startTime: '' }
    const result = enrichWorklog(raw, { key: 'X-1', summary: '' }, new Map())
    expect(result.startTime).toBe('08:00')
  })

  it('defaults description to empty string', () => {
    const raw = { ...baseRaw, description: '' }
    const result = enrichWorklog(raw, { key: 'X-1', summary: '' }, new Map())
    expect(result.description).toBe('')
  })

  it('rounds hours to 2 decimal places', () => {
    const raw = { ...baseRaw, timeSpentSeconds: 3661 }
    const result = enrichWorklog(raw, { key: 'X-1', summary: '' }, new Map())
    expect(result.hours).toBe(1.02)
  })
})

describe('parseCapitalizationField', () => {
  it('returns true when field value is "Yes"', () => {
    expect(parseCapitalizationField({ customfield_11702: { value: 'Yes' } })).toBe(true)
  })

  it('returns false when field value is not "Yes"', () => {
    expect(parseCapitalizationField({ customfield_11702: { value: 'No' } })).toBe(false)
  })

  it('handles array-shaped field (takes first element)', () => {
    expect(parseCapitalizationField({ customfield_11702: [{ value: 'Yes' }] })).toBe(true)
  })

  it('returns null when field is missing', () => {
    expect(parseCapitalizationField({})).toBeNull()
  })

  it('returns null when field has no value property', () => {
    expect(parseCapitalizationField({ customfield_11702: { other: 'x' } })).toBeNull()
  })

  it('returns null when field is null', () => {
    expect(parseCapitalizationField({ customfield_11702: null })).toBeNull()
  })
})

describe('buildCreateWorklogBody', () => {
  it('builds a complete body with all fields', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'PROJ-1',
      hours: 2,
      date: '2026-04-25',
      startTime: '09:30',
      description: 'Code review',
      accountKey: 'DEV',
    })
    expect(body).toEqual({
      issueId: 42,
      timeSpentSeconds: 7200,
      startDate: '2026-04-25',
      startTime: '09:30:00',
      authorAccountId: 'acc-123',
      description: 'Code review',
      attributes: [{ key: '_Account_', value: 'DEV' }],
    })
  })

  it('defaults startTime to 08:00:00 when omitted', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'PROJ-1',
      hours: 1,
      date: '2026-04-25',
    })
    expect(body.startTime).toBe('08:00:00')
  })

  it('defaults startTime to 08:00:00 when empty string', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'PROJ-1',
      hours: 1,
      date: '2026-04-25',
      startTime: '',
    })
    expect(body.startTime).toBe('08:00:00')
  })

  it('defaults description when omitted', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'PROJ-1',
      hours: 1,
      date: '2026-04-25',
    })
    expect(body.description).toBe('Working on issue PROJ-1')
  })

  it('defaults description when empty string', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'PROJ-1',
      hours: 1,
      date: '2026-04-25',
      description: '',
    })
    expect(body.description).toBe('Working on issue PROJ-1')
  })

  it('infers INT account for INT- issues', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'INT-99',
      hours: 1,
      date: '2026-04-25',
    })
    expect(body.attributes).toEqual([{ key: '_Account_', value: 'INT' }])
  })

  it('infers GEN-DEV account for non-INT issues', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'PROJ-1',
      hours: 1,
      date: '2026-04-25',
    })
    expect(body.attributes).toEqual([{ key: '_Account_', value: 'GEN-DEV' }])
  })

  it('handles hours: 0', () => {
    const body = buildCreateWorklogBody('acc-123', 42, {
      issueKey: 'PROJ-1',
      hours: 0,
      date: '2026-04-25',
    })
    expect(body.timeSpentSeconds).toBe(0)
  })
})

describe('buildUpdateWorklogBody', () => {
  it('builds body with all fields', () => {
    const body = buildUpdateWorklogBody('acc-123', {
      hours: 1.5,
      date: '2026-04-25',
      startTime: '10:00',
      description: 'Updated',
      accountKey: 'DEV',
    })
    expect(body).toEqual({
      authorAccountId: 'acc-123',
      timeSpentSeconds: 5400,
      startDate: '2026-04-25',
      startTime: '10:00:00',
      description: 'Updated',
      attributes: [{ key: '_Account_', value: 'DEV' }],
    })
  })

  it('returns only accountId when no fields provided', () => {
    const body = buildUpdateWorklogBody('acc-123', {})
    expect(body).toEqual({ authorAccountId: 'acc-123' })
  })

  it('includes hours: 0 (does not skip zero)', () => {
    const body = buildUpdateWorklogBody('acc-123', { hours: 0 })
    expect(body.timeSpentSeconds).toBe(0)
  })

  it('includes description when explicitly set to empty string', () => {
    const body = buildUpdateWorklogBody('acc-123', { description: '' })
    expect(body.description).toBe('')
  })

  it('omits description when undefined', () => {
    const body = buildUpdateWorklogBody('acc-123', {})
    expect(body).not.toHaveProperty('description')
  })

  it('omits date when empty string', () => {
    const body = buildUpdateWorklogBody('acc-123', { date: '' })
    expect(body).not.toHaveProperty('startDate')
  })

  it('omits startTime when empty string', () => {
    const body = buildUpdateWorklogBody('acc-123', { startTime: '' })
    expect(body).not.toHaveProperty('startTime')
  })

  it('omits accountKey when empty string', () => {
    const body = buildUpdateWorklogBody('acc-123', { accountKey: '' })
    expect(body).not.toHaveProperty('attributes')
  })
})

describe('summarizeWorklogs', () => {
  const makeWorklog = (
    issueKey: string,
    hours: number,
    date: string,
    issueSummary = ''
  ): TempoWorklog => ({
    id: Math.random(),
    issueKey,
    issueSummary,
    hours,
    date,
    startTime: '08:00',
    description: '',
    accountKey: '',
    accountName: '',
  })

  it('returns empty summaries for empty input', () => {
    const result = summarizeWorklogs([])
    expect(result).toEqual({ issueSummaries: [], totalHours: 0 })
  })

  it('groups worklogs by issue key', () => {
    const worklogs = [
      makeWorklog('PROJ-1', 2, '2026-04-25', 'Task A'),
      makeWorklog('PROJ-2', 3, '2026-04-25', 'Task B'),
      makeWorklog('PROJ-1', 1, '2026-04-26', 'Task A'),
    ]
    const result = summarizeWorklogs(worklogs)
    expect(result.issueSummaries).toHaveLength(2)
    expect(result.totalHours).toBe(6)
  })

  it('sorts summaries by total hours descending', () => {
    const worklogs = [
      makeWorklog('PROJ-1', 1, '2026-04-25'),
      makeWorklog('PROJ-2', 5, '2026-04-25'),
      makeWorklog('PROJ-3', 3, '2026-04-25'),
    ]
    const result = summarizeWorklogs(worklogs)
    expect(result.issueSummaries.map(s => s.issueKey)).toEqual(['PROJ-2', 'PROJ-3', 'PROJ-1'])
  })

  it('accumulates hours by date within an issue', () => {
    const worklogs = [
      makeWorklog('PROJ-1', 2, '2026-04-25'),
      makeWorklog('PROJ-1', 3, '2026-04-25'),
      makeWorklog('PROJ-1', 1, '2026-04-26'),
    ]
    const result = summarizeWorklogs(worklogs)
    expect(result.issueSummaries[0].hoursByDate).toEqual({
      '2026-04-25': 5,
      '2026-04-26': 1,
    })
    expect(result.issueSummaries[0].totalHours).toBe(6)
  })

  it('handles a single worklog', () => {
    const result = summarizeWorklogs([makeWorklog('X-1', 4, '2026-04-25', 'Solo task')])
    expect(result.issueSummaries).toEqual([
      {
        issueKey: 'X-1',
        issueSummary: 'Solo task',
        totalHours: 4,
        hoursByDate: { '2026-04-25': 4 },
      },
    ])
    expect(result.totalHours).toBe(4)
  })
})

// ─── isCacheEntryValid ──────────────────────────────────

describe('isCacheEntryValid', () => {
  const TTL = 86_400_000 // 24h

  it('returns true for entry within TTL', () => {
    const now = 1_000_000
    expect(isCacheEntryValid({ data: true, fetchedAt: now - 1000 }, TTL, now)).toBe(true)
  })

  it('returns false for entry past TTL', () => {
    const now = 1_000_000
    expect(isCacheEntryValid({ data: true, fetchedAt: now - TTL - 1 }, TTL, now)).toBe(false)
  })

  it('returns false for undefined entry', () => {
    expect(isCacheEntryValid(undefined, TTL)).toBe(false)
  })

  it('returns false when data is undefined', () => {
    expect(isCacheEntryValid({ data: undefined, fetchedAt: Date.now() }, TTL)).toBe(false)
  })

  it('returns false when fetchedAt is missing', () => {
    expect(isCacheEntryValid({ data: 'val' }, TTL)).toBe(false)
  })

  it('treats fetchedAt=0 as valid (epoch timestamp)', () => {
    expect(isCacheEntryValid({ data: 'val', fetchedAt: 0 }, TTL, 1000)).toBe(true)
  })

  it('treats data=false as valid (boolean false is not undefined)', () => {
    const now = 1_000_000
    expect(isCacheEntryValid({ data: false, fetchedAt: now - 1000 }, TTL, now)).toBe(true)
  })

  it('treats data=0 as valid (numeric zero is not undefined)', () => {
    const now = 1_000_000
    expect(isCacheEntryValid({ data: 0, fetchedAt: now - 1000 }, TTL, now)).toBe(true)
  })

  it('returns true at exact TTL boundary', () => {
    const now = 1_000_000
    // fetchedAt = now - TTL + 1 → age = TTL - 1 < TTL → valid
    expect(isCacheEntryValid({ data: 'val', fetchedAt: now - TTL + 1 }, TTL, now)).toBe(true)
  })

  it('returns false at exact TTL expiry', () => {
    const now = 1_000_000
    // fetchedAt = now - TTL → age = TTL, not < TTL → invalid
    expect(isCacheEntryValid({ data: 'val', fetchedAt: now - TTL }, TTL, now)).toBe(false)
  })

  it('uses Date.now() when now is not provided', () => {
    const recent = Date.now() - 1000
    expect(isCacheEntryValid({ data: 'val', fetchedAt: recent }, TTL)).toBe(true)
  })
})
