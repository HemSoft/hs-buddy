import { describe, it, expect } from 'vitest'
import { matchesShortcut } from './shortcutMatching'

describe('matchesShortcut', () => {
  it('matches Ctrl+key', () => {
    expect(matchesShortcut({ key: 'P', ctrlOrCmd: true }, { key: 'P', control: true })).toBe(true)
  })

  it('matches Cmd+key (meta)', () => {
    expect(matchesShortcut({ key: 'P', ctrlOrCmd: true }, { key: 'P', meta: true })).toBe(true)
  })

  it('fails when ctrlOrCmd required but neither pressed', () => {
    expect(matchesShortcut({ key: 'P', ctrlOrCmd: true }, { key: 'P' })).toBe(false)
  })

  it('matches Ctrl+Shift+key', () => {
    expect(
      matchesShortcut(
        { key: 'A', ctrlOrCmd: true, shift: true },
        { key: 'A', control: true, shift: true }
      )
    ).toBe(true)
  })

  it('fails when shift required but not pressed', () => {
    expect(
      matchesShortcut({ key: 'A', ctrlOrCmd: true, shift: true }, { key: 'A', control: true })
    ).toBe(false)
  })

  it('matches plain key without modifiers', () => {
    expect(matchesShortcut({ key: 'F11' }, { key: 'F11' })).toBe(true)
  })

  it('fails on wrong key', () => {
    expect(matchesShortcut({ key: 'F11' }, { key: 'F12' })).toBe(false)
  })

  it('matches when extra modifiers are pressed but not required', () => {
    expect(matchesShortcut({ key: 'F11' }, { key: 'F11', control: true, shift: true })).toBe(true)
  })
})
