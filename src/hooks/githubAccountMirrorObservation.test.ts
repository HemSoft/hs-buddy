import { describe, expect, it } from 'vitest'
import {
  observeRemoteAccounts,
  retainConnectedOverrides,
  type ObservedAccountGroup,
} from './githubAccountMirrorObservation'

describe('github account mirror observation', () => {
  it('tracks retained, replaced, removed, duplicate, and invalid account documents', () => {
    const previous = new Map<string, ObservedAccountGroup>([
      ['org/kept', { account: { username: 'kept', org: 'org' }, ids: new Set(['same']) }],
      ['org/replaced', { account: { username: 'replaced', org: 'org' }, ids: new Set(['old']) }],
      ['org/removed', { account: { username: 'removed', org: 'org' }, ids: new Set(['gone']) }],
    ])
    const pending = new Map()

    const observation = observeRemoteAccounts(
      [
        { _id: 'same', username: 'kept', org: 'org' },
        { _id: 'duplicate', username: 'KEPT', org: 'ORG' },
        { _id: 'new', username: 'replaced', org: 'org' },
        { username: 'without-id', org: 'org' },
        { username: 'bad slug', org: 'org' },
        { username: 'bad-org', org: 'bad slug' },
      ],
      previous,
      pending
    )

    expect(observation.documentSnapshot).toEqual([
      ['org/kept', ['duplicate', 'same']],
      ['org/replaced', ['new']],
      ['org/without-id', ['org/without-id']],
    ])
    expect(pending).toEqual(
      new Map([
        ['org/replaced', { account: { username: 'replaced', org: 'org' }, documentIds: 'new' }],
        ['org/removed', { account: { username: 'removed', org: 'org' }, documentIds: '' }],
      ])
    )
  })

  it('revalidates a pending clear when a replacement document appears', () => {
    const previous = new Map<string, ObservedAccountGroup>([
      ['org/user', { account: { username: 'user', org: 'org' }, ids: new Set(['old']) }],
    ])
    const pending = new Map()
    const deletion = observeRemoteAccounts([], previous, pending)

    observeRemoteAccounts([{ _id: 'new', username: 'user', org: 'org' }], deletion.groups, pending)

    expect(pending.get('org/user')).toEqual({
      account: { username: 'user', org: 'org' },
      documentIds: 'new',
    })
  })

  it('removes overrides for accounts absent from the connected snapshot', () => {
    const changedKeys = new Set<string>()
    const current = { 'org/kept': 'codex', 'org/removed': 'copilot' } as const

    expect(retainConnectedOverrides(current, new Set(['org/kept']), changedKeys)).toEqual({
      'org/kept': 'codex',
    })
    expect(changedKeys).toEqual(new Set(['org/removed']))
    expect(retainConnectedOverrides(current, new Set(Object.keys(current)), new Set())).toBe(
      current
    )
  })
})
