import { describe, expect, it } from 'vitest'
import { countThreadStats, groupPrsByOwner } from './pr-threads'

describe('countThreadStats', () => {
  it('counts all resolved', () => {
    const nodes = [{ isResolved: true }, { isResolved: true }]
    expect(countThreadStats(nodes, 2)).toEqual({ resolved: 2, unresolved: 0 })
  })

  it('counts all unresolved', () => {
    const nodes = [{ isResolved: false }, { isResolved: false }]
    expect(countThreadStats(nodes, 2)).toEqual({ resolved: 0, unresolved: 2 })
  })

  it('counts a mix of resolved and unresolved', () => {
    const nodes = [{ isResolved: true }, { isResolved: false }, { isResolved: true }]
    expect(countThreadStats(nodes, 3)).toEqual({ resolved: 2, unresolved: 1 })
  })

  it('handles empty nodes', () => {
    expect(countThreadStats([], 0)).toEqual({ resolved: 0, unresolved: 0 })
  })

  it('clamps unresolved to zero when resolved exceeds totalCount', () => {
    const nodes = [{ isResolved: true }, { isResolved: true }]
    expect(countThreadStats(nodes, 1)).toEqual({ resolved: 2, unresolved: 0 })
  })
})

describe('groupPrsByOwner', () => {
  it('groups PRs by _owner', () => {
    const prs = [
      { _owner: 'alice', id: 1 },
      { _owner: 'bob', id: 2 },
      { _owner: 'alice', id: 3 },
    ]
    const grouped = groupPrsByOwner(prs)
    expect(grouped.size).toBe(2)
    expect(grouped.get('alice')).toEqual([
      { _owner: 'alice', id: 1 },
      { _owner: 'alice', id: 3 },
    ])
    expect(grouped.get('bob')).toEqual([{ _owner: 'bob', id: 2 }])
  })

  it('returns empty map for empty input', () => {
    expect(groupPrsByOwner([]).size).toBe(0)
  })

  it('handles single owner', () => {
    const prs = [{ _owner: 'solo', x: 'a' }]
    const grouped = groupPrsByOwner(prs)
    expect(grouped.size).toBe(1)
    expect(grouped.get('solo')).toHaveLength(1)
  })
})
