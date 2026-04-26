import { describe, it, expect } from 'vitest'
import { validateStatFields, buildIncrementPatch, buildInitialStatsDoc } from './statsMutationUtils'

describe('validateStatFields', () => {
  const valid = new Set(['appLaunches', 'tabsOpened', 'prsViewed'])

  it('does not throw for valid fields', () => {
    expect(() => validateStatFields({ appLaunches: 1, tabsOpened: 2 }, valid)).not.toThrow()
  })

  it('throws for an invalid field', () => {
    expect(() => validateStatFields({ bogusField: 1 }, valid)).toThrow(
      'Invalid stat field: bogusField'
    )
  })

  it('throws for the first invalid field found', () => {
    expect(() => validateStatFields({ appLaunches: 1, bad: 2 }, valid)).toThrow(
      'Invalid stat field: bad'
    )
  })

  it('does not throw for empty fields', () => {
    expect(() => validateStatFields({}, valid)).not.toThrow()
  })
})

describe('buildIncrementPatch', () => {
  it('increments existing values', () => {
    const existing = { appLaunches: 10, tabsOpened: 5 }
    const entries: Array<[string, number]> = [
      ['appLaunches', 3],
      ['tabsOpened', 1],
    ]
    const patch = buildIncrementPatch(entries, existing)
    expect(patch).toEqual({ appLaunches: 13, tabsOpened: 6 })
  })

  it('defaults missing fields to 0', () => {
    const existing = {}
    const entries: Array<[string, number]> = [['appLaunches', 5]]
    const patch = buildIncrementPatch(entries, existing)
    expect(patch).toEqual({ appLaunches: 5 })
  })

  it('handles empty entries', () => {
    const existing = { appLaunches: 10 }
    expect(buildIncrementPatch([], existing)).toEqual({})
  })

  it('handles null-ish existing values', () => {
    const existing = { appLaunches: null }
    const entries: Array<[string, number]> = [['appLaunches', 2]]
    const patch = buildIncrementPatch(entries, existing as Record<string, unknown>)
    expect(patch).toEqual({ appLaunches: 2 })
  })

  it('defaults non-numeric existing values to 0', () => {
    const existing = { appLaunches: 'oops' }
    const entries: Array<[string, number]> = [['appLaunches', 3]]
    const patch = buildIncrementPatch(entries, existing as Record<string, unknown>)
    expect(patch).toEqual({ appLaunches: 3 })
  })

  it('defaults NaN existing values to 0', () => {
    const existing = { appLaunches: NaN }
    const entries: Array<[string, number]> = [['appLaunches', 4]]
    const patch = buildIncrementPatch(entries, existing as Record<string, unknown>)
    expect(patch).toEqual({ appLaunches: 4 })
  })

  it('defaults Infinity existing values to 0', () => {
    const existing = { appLaunches: Infinity }
    const entries: Array<[string, number]> = [['appLaunches', 1]]
    const patch = buildIncrementPatch(entries, existing as Record<string, unknown>)
    expect(patch).toEqual({ appLaunches: 1 })
  })
})

describe('buildInitialStatsDoc', () => {
  const defaults = { appLaunches: 0, tabsOpened: 0 }

  it('builds a doc with defaults, entries, and timestamps', () => {
    const entries: Array<[string, number]> = [['appLaunches', 1]]
    const doc = buildInitialStatsDoc(defaults, entries, 1000)
    expect(doc).toEqual({
      appLaunches: 1,
      tabsOpened: 0,
      firstLaunchDate: 1000,
      createdAt: 1000,
      updatedAt: 1000,
    })
  })

  it('preserves all defaults when no entries', () => {
    const doc = buildInitialStatsDoc(defaults, [], 500)
    expect(doc.appLaunches).toBe(0)
    expect(doc.tabsOpened).toBe(0)
    expect(doc.firstLaunchDate).toBe(500)
  })

  it('overrides defaults with entry values', () => {
    const entries: Array<[string, number]> = [
      ['appLaunches', 10],
      ['tabsOpened', 5],
    ]
    const doc = buildInitialStatsDoc(defaults, entries, 2000)
    expect(doc.appLaunches).toBe(10)
    expect(doc.tabsOpened).toBe(5)
  })
})
