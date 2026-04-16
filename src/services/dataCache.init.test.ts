import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Tests for dataCache.initialize() — requires fresh module instances per test
 * because `initialized` is a module-level flag that can't be reset externally.
 */
describe('dataCache – initialize()', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  function stubIpc(invoke: ReturnType<typeof vi.fn>) {
    Object.defineProperty(window, 'ipcRenderer', {
      value: { invoke, on: vi.fn(), removeListener: vi.fn() },
      writable: true,
      configurable: true,
    })
  }

  it('hydrates memory cache from persisted disk data', async () => {
    const mockInvoke = vi.fn().mockResolvedValueOnce({
      'my-prs': { data: [1, 2, 3], fetchedAt: 1000 },
      'my-reviews': { data: ['a'], fetchedAt: 2000 },
    })
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(mockInvoke).toHaveBeenCalledWith('cache:read-all')
    expect(dataCache.get('my-prs')).toEqual({ data: [1, 2, 3], fetchedAt: 1000 })
    expect(dataCache.get('my-reviews')).toEqual({ data: ['a'], fetchedAt: 2000 })
    expect(dataCache.isInitialized()).toBe(true)
  })

  it('skips hydration when disk returns null', async () => {
    const mockInvoke = vi.fn().mockResolvedValueOnce(null)
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(dataCache.isInitialized()).toBe(true)
    expect(dataCache.getStats()).toEqual({})
  })

  it('skips hydration when disk returns undefined', async () => {
    const mockInvoke = vi.fn().mockResolvedValueOnce(undefined)
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(dataCache.isInitialized()).toBe(true)
    expect(dataCache.getStats()).toEqual({})
  })

  it('skips hydration when disk returns a non-object (string)', async () => {
    const mockInvoke = vi.fn().mockResolvedValueOnce('not-an-object')
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(dataCache.isInitialized()).toBe(true)
    expect(dataCache.getStats()).toEqual({})
  })

  it('skips hydration when disk returns a non-object (number)', async () => {
    const mockInvoke = vi.fn().mockResolvedValueOnce(42)
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(dataCache.isInitialized()).toBe(true)
    expect(dataCache.getStats()).toEqual({})
  })

  it('marks as initialized and logs error when IPC rejects', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockInvoke = vi.fn().mockRejectedValueOnce(new Error('IPC crash'))
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(dataCache.isInitialized()).toBe(true)
    expect(spy).toHaveBeenCalledWith('[DataCache] Failed to initialize:', expect.any(Error))
  })

  it('is idempotent — second call returns immediately without IPC', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({})
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    mockInvoke.mockClear()

    await dataCache.initialize()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('hydrates with empty object without error', async () => {
    const mockInvoke = vi.fn().mockResolvedValueOnce({})
    stubIpc(mockInvoke)

    const { dataCache } = await import('./dataCache')
    await dataCache.initialize()

    expect(dataCache.isInitialized()).toBe(true)
    expect(dataCache.getStats()).toEqual({})
  })
})
