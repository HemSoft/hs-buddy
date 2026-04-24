import { describe, it, expect, vi, afterEach } from 'vitest'

describe('platform utils', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports isMac, modLabel, and isModKey', async () => {
    const mod = await import('./platform')
    expect(typeof mod.isMac).toBe('boolean')
    expect(typeof mod.modLabel).toBe('string')
    expect(typeof mod.isModKey).toBe('function')
  })

  it('modLabel is Ctrl in happy-dom (non-Mac navigator)', async () => {
    const { modLabel, isMac } = await import('./platform')
    // happy-dom navigator.platform is typically empty or "Linux"
    expect(isMac).toBe(false)
    expect(modLabel).toBe('Ctrl')
  })

  it('isModKey returns true for ctrlKey on non-Mac', async () => {
    const { isModKey } = await import('./platform')
    expect(isModKey({ ctrlKey: true, metaKey: false })).toBe(true)
    expect(isModKey({ ctrlKey: false, metaKey: true })).toBe(false)
    expect(isModKey({ ctrlKey: false, metaKey: false })).toBe(false)
  })

  it('detects Mac platform and uses ⌘ / metaKey', async () => {
    vi.resetModules()
    const originalPlatform = navigator.platform
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })

    const { isMac, modLabel, isModKey } = await import('./platform')
    expect(isMac).toBe(true)
    expect(modLabel).toBe('⌘')
    expect(isModKey({ ctrlKey: false, metaKey: true })).toBe(true)
    expect(isModKey({ ctrlKey: true, metaKey: false })).toBe(false)

    Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true })
  })
})
