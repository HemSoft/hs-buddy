import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { afterAll, expect, vi } from 'vitest'

// Mock window.ipcRenderer before importing dataCache
const mockInvoke = vi.fn().mockResolvedValue(undefined)
const originalIpcRendererDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.window,
  'ipcRenderer'
)

Object.defineProperty(globalThis.window, 'ipcRenderer', {
  configurable: true,
  writable: true,
  value: { invoke: mockInvoke },
})

afterAll(() => {
  vi.restoreAllMocks()
  if (originalIpcRendererDescriptor) {
    Object.defineProperty(globalThis.window, 'ipcRenderer', originalIpcRendererDescriptor)
  } else {
    Reflect.deleteProperty(globalThis.window, 'ipcRenderer')
  }
})

const { dataCache } = await import('../services/dataCache')

const feature = await loadFeature('src/features/data-cache.feature')

/** Reset cache state — call inside Given steps, not beforeEach (vitest-cucumber runs beforeEach per step) */
async function resetCache() {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue(undefined)
  vi.restoreAllMocks()
  await dataCache.clear()
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('Return null for missing cache keys', ({ Given, When, Then }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    When('getting a key that does not exist', () => {
      // action is in Then
    })
    Then('the result should be null', () => {
      expect(dataCache.get('nonexistent')).toBeNull()
    })
  })

  Scenario('Store and retrieve data', ({ Given, When, Then, And }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    When('setting key "my-prs" with data "hello" at timestamp 1000', () => {
      dataCache.set('my-prs', 'hello', 1000)
    })
    Then('getting key "my-prs" should return data "hello"', () => {
      expect(dataCache.get('my-prs')!.data).toBe('hello')
    })
    And('the fetchedAt should be 1000', () => {
      expect(dataCache.get('my-prs')!.fetchedAt).toBe(1000)
    })
  })

  Scenario('Overwrite existing entries', ({ Given, When, Then, And }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    When('setting key "k" with data "v1" at timestamp 100', () => {
      dataCache.set('k', 'v1', 100)
    })
    And('setting key "k" with data "v2" at timestamp 200', () => {
      dataCache.set('k', 'v2', 200)
    })
    Then('getting key "k" should return data "v2"', () => {
      expect(dataCache.get('k')!.data).toBe('v2')
    })
    And('the fetchedAt should be 200', () => {
      expect(dataCache.get('k')!.fetchedAt).toBe(200)
    })
  })

  Scenario('Fresh entry within max age', ({ Given, When, Then, And }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    And('the current time is 5000', () => {
      vi.spyOn(Date, 'now').mockReturnValue(5000)
    })
    When('setting key "prs" with data "data" at timestamp 4000', () => {
      dataCache.set('prs', 'data', 4000)
    })
    Then('key "prs" should be fresh with max age 2000ms', () => {
      expect(dataCache.isFresh('prs', 2000)).toBe(true)
    })
  })

  Scenario('Stale entry beyond max age', ({ Given, When, Then, And }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    And('the current time is 10000', () => {
      vi.spyOn(Date, 'now').mockReturnValue(10000)
    })
    When('setting key "prs" with data "data" at timestamp 4000', () => {
      dataCache.set('prs', 'data', 4000)
    })
    Then('key "prs" should not be fresh with max age 2000ms', () => {
      expect(dataCache.isFresh('prs', 2000)).toBe(false)
    })
  })

  Scenario('Missing key is never fresh', ({ Given, Then }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    Then('key "nonexistent" should not be fresh with max age 999999ms', () => {
      expect(dataCache.isFresh('nonexistent', 999999)).toBe(false)
    })
  })

  Scenario('Notify subscribers on set', ({ Given, When, Then, And }) => {
    const notified: string[] = []
    let unsubscribe: () => void

    Given('an empty cache', async () => {
      await resetCache()
    })
    And('a subscriber is listening', () => {
      unsubscribe = dataCache.subscribe(key => notified.push(key))
    })
    When('setting key "update" with data "val" at timestamp 1', () => {
      dataCache.set('update', 'val', 1)
    })
    Then('the subscriber should be notified with key "update"', () => {
      expect(notified).toContain('update')
      unsubscribe()
    })
  })

  Scenario('Unsubscribe stops notifications', ({ Given, When, Then, And }) => {
    const notified: string[] = []
    let unsubscribe: () => void

    Given('an empty cache', async () => {
      await resetCache()
    })
    And('a subscriber is listening', () => {
      unsubscribe = dataCache.subscribe(key => notified.push(key))
    })
    When('the subscriber unsubscribes', () => {
      unsubscribe()
    })
    And('setting key "after" with data "val" at timestamp 1', () => {
      dataCache.set('after', 'val', 1)
    })
    Then('the subscriber should not be notified', () => {
      expect(notified).toEqual([])
    })
  })

  Scenario('Delete removes entry from cache', ({ Given, When, Then, And }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    When('setting key "temp" with data "value" at timestamp 1', () => {
      dataCache.set('temp', 'value', 1)
    })
    And('deleting key "temp"', () => {
      dataCache.delete('temp')
    })
    Then('getting key "temp" should be null', () => {
      expect(dataCache.get('temp')).toBeNull()
    })
  })

  Scenario('Get stats reports entry ages', ({ Given, When, Then, And }) => {
    Given('an empty cache', async () => {
      await resetCache()
    })
    And('the current time is 120000', () => {
      vi.spyOn(Date, 'now').mockReturnValue(120000)
    })
    When('setting key "a" with data "x" at timestamp 60000', () => {
      dataCache.set('a', 'x', 60000)
    })
    Then('stats for key "a" should show age of 60000ms', () => {
      const stats = dataCache.getStats()
      expect(stats['a'].ageMs).toBe(60000)
    })
  })
})
