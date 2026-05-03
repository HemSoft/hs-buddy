import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}))

vi.mock('../../src/utils/envLookup', () => ({
  createEnvResolver: vi.fn(() => (name: string) => {
    if (name === 'TEMPO_API_TOKEN') return 'test-tempo-token'
    if (name === 'ATLASSIAN_API_TOKEN') return 'test-jira-token'
    if (name === 'ATLASSIAN_EMAIL') return 'test@example.com'
    return undefined
  }),
}))

const mockReadDataCache = vi.fn().mockReturnValue({})
const mockWriteDataCacheEntry = vi.fn()
vi.mock('../cache', () => ({
  readDataCache: (...args: unknown[]) => mockReadDataCache(...args),
  writeDataCacheEntry: (...args: unknown[]) => mockWriteDataCacheEntry(...args),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}))

vi.mock('../../src/utils/dateUtils', () => ({
  DAY: 86_400_000,
}))

vi.mock('../../src/utils/tempoUtils', () => ({
  enrichWorklog: vi.fn((w: Record<string, unknown>) => ({
    ...w,
    hours: 1,
    date: '2024-01-01',
    startTime: '09:00',
  })),
  parseCapitalizationField: vi.fn(() => null),
  buildCreateWorklogBody: vi.fn((accountId: string, issueId: number) => ({
    authorAccountId: accountId,
    issueId,
  })),
  buildUpdateWorklogBody: vi.fn((accountId: string) => ({ authorAccountId: accountId })),
  summarizeWorklogs: vi.fn(() => ({
    issueSummaries: [],
    totalHours: 8,
  })),
  CAPITALIZATION_FIELD: 'customfield_10000',
  isCacheEntryValid: vi.fn(() => false),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('tempoClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    mockReadDataCache.mockReturnValue({})
  })

  describe('getAccounts', () => {
    it('fetches accounts from Tempo API and returns success result', async () => {
      const { getAccounts } = await import('./tempoClient')
      const accounts = [
        { id: 1, key: 'DEV', name: 'Development' },
        { id: 2, key: 'OPS', name: 'Operations' },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: accounts }),
      })

      const result = await getAccounts()

      expect(result.success).toBe(true)
      expect(result.data).toEqual([
        { key: 'DEV', name: 'Development' },
        { key: 'OPS', name: 'Operations' },
      ])
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/accounts')
      expect(opts.headers.Authorization).toBe('Bearer test-tempo-token')
    })

    it('returns cached accounts within TTL', async () => {
      const { getAccounts } = await import('./tempoClient')
      const accounts = [{ id: 1, key: 'DEV', name: 'Development' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: accounts }),
      })

      await getAccounts()
      const result = await getAccounts()

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(result.success).toBe(true)
    })

    it('returns error result on API failure', async () => {
      const { getAccounts } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      })

      const result = await getAccounts()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('getWorklogsForRange', () => {
    it('fetches worklogs, resolves issue keys, and returns enriched data', async () => {
      const { getWorklogsForRange } = await import('./tempoClient')
      // First call: /myself to get accountId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // Second call: accounts (for accountMap)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })
      // Third call: worklogs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }],
          }),
      })
      // Fourth call: issue key resolution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'PROJ-1', fields: { summary: 'Test issue' } }),
      })

      const result = await getWorklogsForRange('2024-01-01', '2024-01-07')

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.length).toBe(1)
    })

    it('returns error result when account ID cannot be resolved', async () => {
      const { getWorklogsForRange } = await import('./tempoClient')
      // Mock all fetches to fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getWorklogsForRange('2024-01-01', '2024-01-07')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('deleteWorklog', () => {
    it('sends DELETE request and returns success', async () => {
      const { deleteWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await deleteWorklog(999)

      expect(result.success).toBe(true)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('/worklogs/999')
      expect(opts.method).toBe('DELETE')
    })

    it('returns error result on API failure', async () => {
      const { deleteWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      })

      const result = await deleteWorklog(999)

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
  })
})
