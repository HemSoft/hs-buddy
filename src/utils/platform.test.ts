import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('platform utils', () => {
  const originalPlatform = navigator.platform

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true })
  })

  it('exports isMac, modLabel, and isModKey', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    const mod = await import('./platform')
    expect(typeof mod.isMac).toBe('boolean')
    expect(typeof mod.modLabel).toBe('string')
    expect(typeof mod.isModKey).toBe('function')
  })

  it('modLabel is Ctrl on non-Mac platform', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    const { modLabel, isMac } = await import('./platform')
    expect(isMac).toBe(false)
    expect(modLabel).toBe('Ctrl')
  })

  it('isModKey returns true for ctrlKey on non-Mac', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    const { isModKey } = await import('./platform')
    expect(isModKey({ ctrlKey: true, metaKey: false })).toBe(true)
    expect(isModKey({ ctrlKey: false, metaKey: true })).toBe(false)
    expect(isModKey({ ctrlKey: false, metaKey: false })).toBe(false)
  })

  it('detects Mac platform and uses ⌘ / metaKey', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    const { isMac, modLabel, isModKey } = await import('./platform')
    expect(isMac).toBe(true)
    expect(modLabel).toBe('⌘')
    expect(isModKey({ ctrlKey: false, metaKey: true })).toBe(true)
    expect(isModKey({ ctrlKey: true, metaKey: false })).toBe(false)
  })
})
