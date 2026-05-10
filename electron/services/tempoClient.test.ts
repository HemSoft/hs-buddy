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

  describe('getWorklogsForDate', () => {
    it('returns day summary with worklogs', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      // /myself → accountId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // accounts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })
      // worklogs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 1, issue: { id: 10 }, timeSpentSeconds: 3600 }],
          }),
      })
      // issue key resolution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'PROJ-1', fields: { summary: 'Fix bug' } }),
      })

      const result = await getWorklogsForDate('2024-01-15')
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.date).toBe('2024-01-15')
      expect(result.data!.worklogs).toHaveLength(1)
    })

    it('returns error when upstream fails', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve('error'),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getWorklogsForDate('2024-01-15')
      expect(result.success).toBe(false)
    })
  })

  describe('getWeekSummary', () => {
    it('returns week summary with issue summaries', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      // /myself → accountId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-456' }),
      })
      // accounts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      // worklogs (empty week)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })

      const result = await getWeekSummary('2024-01-15', '2024-01-19')
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.totalHours).toBe(8) // from mock summarizeWorklogs
      expect(result.data!.worklogs).toEqual([])
    })

    it('passes errors from getWorklogsForRange through', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getWeekSummary('2024-01-15', '2024-01-19')
      expect(result.success).toBe(false)
    })
  })

  describe('createWorklog', () => {
    it('creates worklog and returns enriched result', async () => {
      const { createWorklog } = await import('./tempoClient')
      // /myself → accountId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-789' }),
      })
      // resolve issue id from key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '42', fields: { summary: 'Test task' } }),
      })
      // POST worklog
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 100, issue: { id: 42 }, timeSpentSeconds: 1800 }),
      })
      // accounts for enrichment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })

      const result = await createWorklog({
        issueKey: 'PROJ-42',
        hours: 0.5,
        date: '2024-01-15',
        startTime: '09:00:00',
        description: 'Test work',
      })
      expect(result.success).toBe(true)
    })

    it('returns error on API failure', async () => {
      const { createWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('bad input'),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await createWorklog({
        issueKey: 'BAD-1',
        hours: 0,
        date: '2024-01-15',
        startTime: '09:00:00',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('updateWorklog', () => {
    it('updates worklog and returns success', async () => {
      const { updateWorklog } = await import('./tempoClient')
      // /myself → accountId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-101' }),
      })
      // PUT worklog
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await updateWorklog(100, {
        date: '2024-01-15',
        timeSpentSeconds: 3600,
        startTime: '10:00:00',
      } as Parameters<typeof updateWorklog>[1])
      expect(result.success).toBe(true)
    })

    it('returns error on failure', async () => {
      const { updateWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await updateWorklog(999, {
        date: '2024-01-15',
        timeSpentSeconds: 3600,
        startTime: '10:00:00',
      } as Parameters<typeof updateWorklog>[1])
      expect(result.success).toBe(false)
    })
  })

  describe('getUserSchedule', () => {
    it('returns user schedule with working days', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      // /myself → accountId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-sched' }),
      })
      // schedule
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { date: '2024-01-15', requiredSeconds: 28800, type: 'WORKING_DAY' },
              {
                date: '2024-01-16',
                requiredSeconds: 0,
                type: 'HOLIDAY',
                holiday: { name: 'MLK Day' },
              },
            ],
          }),
      })

      const result = await getUserSchedule('2024-01-15', '2024-01-16')
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data![0].type).toBe('WORKING_DAY')
      expect(result.data![1].type).toBe('HOLIDAY')
      expect(result.data![1].holidayName).toBe('MLK Day')
    })

    it('returns error on failure', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getUserSchedule('2024-01-15', '2024-01-19')
      expect(result.success).toBe(false)
    })
  })

  describe('getCapexMap', () => {
    it('returns capitalization map for issue keys', async () => {
      const { getCapexMap } = await import('./tempoClient')
      // resolveCapex will try Jira headers then fall back
      // Since mock env resolver provides credentials, it will try Jira
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            fields: { customfield_10000: null, parent: undefined },
          }),
      })

      const result = await getCapexMap(['PROJ-1', 'PROJ-2', 'PROJ-1'])
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      // Should deduplicate PROJ-1
      expect(Object.keys(result.data!)).toContain('PROJ-1')
      expect(Object.keys(result.data!)).toContain('PROJ-2')
    })

    it('handles fetch errors gracefully, caching false for failed resolutions', async () => {
      const { getCapexMap } = await import('./tempoClient')
      mockFetch.mockRejectedValue(new Error('Network error'))
      mockReadDataCache.mockReturnValue({})

      const result = await getCapexMap(['PROJ-1'])
      // resolveCapexLive catches errors and returns false, so getCapexMap succeeds
      expect(result.success).toBe(true)
      expect(result.data!['PROJ-1']).toBe(false)
    })
  })

  describe('getProjectAccountLinks', () => {
    it('returns project account links', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      // resolve project ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '100' }),
      })
      // account links
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                account: { id: 10, self: '/accounts/10' },
                default: true,
                scope: { id: 100, type: 'PROJECT' },
              },
            ],
          }),
      })
      // getAccounts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 10, key: 'DEV', name: 'Development' }] }),
      })

      const result = await getProjectAccountLinks('PROJ')
      expect(result.success).toBe(true)
    })

    it('returns error on failure', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied'),
      })

      const result = await getProjectAccountLinks('PROJ')
      expect(result.success).toBe(false)
    })
  })
})
