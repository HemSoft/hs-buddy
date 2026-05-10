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
    it('returns day summary for a single date', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      // /myself
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
            results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }],
          }),
      })
      // issue key resolution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'PROJ-1', fields: { summary: 'Test' } }),
      })

      const result = await getWorklogsForDate('2024-01-15')

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.date).toBe('2024-01-15')
      expect(result.data!.worklogs).toHaveLength(1)
      expect(result.data!.totalHours).toBe(1)
    })

    it('returns error when underlying range query fails', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getWorklogsForDate('2024-01-15')
      expect(result.success).toBe(false)
    })
  })

  describe('getWeekSummary', () => {
    it('returns weekly summary with issue summaries', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // accounts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      // worklogs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })

      const result = await getWeekSummary('2024-01-15', '2024-01-21')

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.totalHours).toBe(8)
      expect(result.data!.issueSummaries).toEqual([])
    })

    it('returns error when underlying range query fails', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getWeekSummary('2024-01-15', '2024-01-21')
      expect(result.success).toBe(false)
    })
  })

  describe('createWorklog', () => {
    it('creates worklog and returns enriched result', async () => {
      const { createWorklog } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // resolve issue key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '100', fields: { summary: 'Test issue' } }),
      })
      // POST /worklogs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 200,
            issue: { id: 100 },
            timeSpentSeconds: 3600,
          }),
      })
      // accounts for enrichment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })

      const result = await createWorklog({
        issueKey: 'PROJ-1',
        date: '2024-01-15',
        timeSpentSeconds: 3600,
        description: 'Working on it',
      } as never)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('returns error on API failure', async () => {
      const { createWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await createWorklog({
        issueKey: 'PROJ-1',
        date: '2024-01-15',
        timeSpentSeconds: 3600,
      } as never)

      expect(result.success).toBe(false)
    })
  })

  describe('updateWorklog', () => {
    it('updates worklog and returns success', async () => {
      const { updateWorklog } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // PUT /worklogs/100
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await updateWorklog(100, {
        timeSpentSeconds: 7200,
      } as never)

      expect(result.success).toBe(true)
    })

    it('returns error on API failure', async () => {
      const { updateWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await updateWorklog(100, { timeSpentSeconds: 7200 } as never)
      expect(result.success).toBe(false)
    })
  })

  describe('getUserSchedule', () => {
    it('returns schedule with working days and holidays', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      // /user-schedule
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
              { date: '2024-01-20', requiredSeconds: 0, type: 'NON_WORKING_DAY' },
            ],
          }),
      })

      const result = await getUserSchedule('2024-01-15', '2024-01-21')

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(3)
      expect(result.data![0]).toEqual({
        date: '2024-01-15',
        requiredSeconds: 28800,
        type: 'WORKING_DAY',
      })
      expect(result.data![1]).toEqual({
        date: '2024-01-16',
        requiredSeconds: 0,
        type: 'HOLIDAY',
        holidayName: 'MLK Day',
      })
    })

    it('returns error on API failure', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getUserSchedule('2024-01-15', '2024-01-21')
      expect(result.success).toBe(false)
    })
  })

  describe('getCapexMap', () => {
    it('returns capex map for issue keys (no jira credentials)', async () => {
      const { createEnvResolver } = await import('../../src/utils/envLookup')
      vi.mocked(createEnvResolver).mockReturnValueOnce((name: string) => {
        if (name === 'TEMPO_API_TOKEN') return 'test-tempo-token'
        return undefined
      })
      const { getCapexMap } = await import('./tempoClient')

      const result = await getCapexMap(['PROJ-1', 'PROJ-2', 'PROJ-1'])

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ 'PROJ-1': false, 'PROJ-2': false })
    })
  })

  describe('getProjectAccountLinks', () => {
    it('returns account links for a project', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      // Resolve project ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '10' }),
      })
      // Account links
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                account: { id: 100, self: 'https://api.tempo.io/4/accounts/100' },
                default: true,
                scope: { id: 10, type: 'PROJECT' },
              },
            ],
          }),
      })
      // getAccounts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, key: 'DEV', name: 'Development' }],
          }),
      })

      const result = await getProjectAccountLinks('PROJ')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([{ key: 'DEV', name: 'Development', isDefault: true }])
    })

    it('returns error on API failure', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })

      const result = await getProjectAccountLinks('PROJ')
      expect(result.success).toBe(false)
    })

    it('reuses the cached project ID on subsequent calls', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '10' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                account: { id: 100, self: 'https://api.tempo.io/4/accounts/100' },
                default: true,
                scope: { id: 10, type: 'PROJECT' },
              },
            ],
          }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, key: 'DEV', name: 'Development' }],
          }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 2,
                account: { id: 100, self: 'https://api.tempo.io/4/accounts/100' },
                default: false,
                scope: { id: 10, type: 'PROJECT' },
              },
            ],
          }),
      })

      const first = await getProjectAccountLinks('PROJ')
      const second = await getProjectAccountLinks('PROJ')

      expect(first.success).toBe(true)
      expect(second.success).toBe(true)
      const urls = mockFetch.mock.calls.map(([url]) => String(url))
      expect(urls.filter(url => url.includes('/rest/api/3/project/PROJ'))).toHaveLength(1)
      expect(urls.filter(url => url.includes('/account-links/project/10'))).toHaveLength(2)
      expect(urls.filter(url => url === 'https://api.tempo.io/4/accounts')).toHaveLength(1)
    })

    it('filters out account links whose IDs do not map to known account keys', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '10' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                account: { id: 999, self: 'https://api.tempo.io/4/accounts/999' },
                default: true,
                scope: { id: 10, type: 'PROJECT' },
              },
            ],
          }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, key: 'DEV', name: 'Development' }],
          }),
      })

      const result = await getProjectAccountLinks('PROJ')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })
  })

  describe('account and issue cache fallbacks', () => {
    it('uses the disk-cached account ID when Jira account lookup fails', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockReadDataCache.mockReturnValue({
        'tempo:accountId': { data: 'cached-user', fetchedAt: Date.now() },
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Unauthorized'),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ date: '2024-01-15', requiredSeconds: 28800, type: 'WORKING_DAY' }],
          }),
      })

      const result = await getUserSchedule('2024-01-15', '2024-01-15')

      expect(result.success).toBe(true)
      expect(String(mockFetch.mock.calls[1][0])).toContain('/user-schedule/cached-user')
    })

    it('returns a descriptive error when Jira account lookup and disk cache both fail', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Unauthorized'),
      })

      const result = await getUserSchedule('2024-01-15', '2024-01-15')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Could not determine your Jira account ID')
      expect(result.error).toContain('ATLASSIAN_API_TOKEN')
    })

    it('uses disk-cached issue metadata when the in-memory issue cache misses', async () => {
      const { getWorklogsForRange } = await import('./tempoClient')
      mockReadDataCache.mockReturnValue({
        'tempo:issue:42': {
          data: { key: 'CACHED-42', summary: 'Cached summary' },
          fetchedAt: Date.now(),
        },
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }],
          }),
      })

      const result = await getWorklogsForRange('2024-01-01', '2024-01-01')

      expect(result.success).toBe(true)
      const urls = mockFetch.mock.calls.map(([url]) => String(url))
      expect(urls.some(url => url.includes('/rest/api/3/issue/42?fields=key,summary'))).toBe(false)
    })

    it('fetches missing issue metadata from Jira and caches the result', async () => {
      const { getWorklogsForRange } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }],
          }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'PROJ-42', fields: { summary: 'Answer' } }),
      })

      const result = await getWorklogsForRange('2024-01-01', '2024-01-01')

      expect(result.success).toBe(true)
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith(
        'tempo:issue:42',
        expect.objectContaining({ data: { key: 'PROJ-42', summary: 'Answer' } })
      )
    })

    it('falls back to #issueId when live issue metadata lookup fails', async () => {
      const { getWorklogsForRange } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }],
          }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve('boom'),
      })

      const result = await getWorklogsForRange('2024-01-01', '2024-01-01')

      expect(result.success).toBe(true)
      expect(
        mockWriteDataCacheEntry.mock.calls.find(([key]) => key === 'tempo:issue:42')
      ).toBeUndefined()
    })

    it('falls back to #issueId without a Jira lookup when Jira credentials are unavailable', async () => {
      const { createEnvResolver } = await import('../../src/utils/envLookup')
      vi.mocked(createEnvResolver).mockReturnValue((name: string) => {
        if (name === 'TEMPO_API_TOKEN') return 'test-tempo-token'
        return undefined
      })
      mockReadDataCache.mockReturnValue({
        'tempo:accountId': { data: 'cached-user', fetchedAt: Date.now() },
      })
      const { getWorklogsForRange } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }],
          }),
      })

      const result = await getWorklogsForRange('2024-01-01', '2024-01-01')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(
        mockWriteDataCacheEntry.mock.calls.find(([key]) => key === 'tempo:issue:42')
      ).toBeUndefined()
    })

    it('resolves issue IDs from Jira and reuses the populated issue cache', async () => {
      const { createWorklog, getWorklogsForRange } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '100', fields: { summary: 'Created summary' } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 200, issue: { id: 100 }, timeSpentSeconds: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ id: 300, issue: { id: 100 }, timeSpentSeconds: 1800 }],
          }),
      })

      const created = await createWorklog({
        issueKey: 'PROJ-9',
        date: '2024-01-15',
        timeSpentSeconds: 3600,
      } as never)
      const range = await getWorklogsForRange('2024-01-15', '2024-01-15')

      expect(created.success).toBe(true)
      expect(range.success).toBe(true)
      const urls = mockFetch.mock.calls.map(([url]) => String(url))
      expect(urls.some(url => url.includes('/rest/api/3/issue/100?fields=key,summary'))).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(5)
    })

    it('returns an error when creating a worklog without Jira credentials for issue-key resolution', async () => {
      const { createEnvResolver } = await import('../../src/utils/envLookup')
      vi.mocked(createEnvResolver).mockReturnValue((name: string) => {
        if (name === 'TEMPO_API_TOKEN') return 'test-tempo-token'
        return undefined
      })
      mockReadDataCache.mockReturnValue({
        'tempo:accountId': { data: 'cached-user', fetchedAt: Date.now() },
      })
      const { createWorklog } = await import('./tempoClient')

      const result = await createWorklog({
        issueKey: 'PROJ-9',
        date: '2024-01-15',
        timeSpentSeconds: 3600,
      } as never)

      expect(result.success).toBe(false)
      expect(result.error).toContain(
        'Jira credentials not available — cannot create worklogs by issue key'
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('capex resolution', () => {
    it('returns an in-memory cached capex result immediately on subsequent calls', async () => {
      const { createEnvResolver } = await import('../../src/utils/envLookup')
      vi.mocked(createEnvResolver).mockReturnValue((name: string) => {
        if (name === 'TEMPO_API_TOKEN') return 'test-tempo-token'
        return undefined
      })
      const { getCapexMap } = await import('./tempoClient')

      const first = await getCapexMap(['PROJ-1'])
      mockReadDataCache.mockClear()
      mockFetch.mockClear()
      const second = await getCapexMap(['PROJ-1'])

      expect(first.success).toBe(true)
      expect(first.data).toEqual({ 'PROJ-1': false })
      expect(second.success).toBe(true)
      expect(second.data).toEqual({ 'PROJ-1': false })
      expect(mockReadDataCache).not.toHaveBeenCalled()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('returns a disk-cached capex result and promotes it into memory cache', async () => {
      const { isCacheEntryValid } = await import('../../src/utils/tempoUtils')
      vi.mocked(isCacheEntryValid).mockReturnValue(true)
      mockReadDataCache.mockReturnValue({
        'tempo:capex:PROJ-1': { data: true, fetchedAt: Date.now() },
      })
      const { getCapexMap } = await import('./tempoClient')

      const first = await getCapexMap(['PROJ-1'])
      mockReadDataCache.mockClear()
      mockFetch.mockClear()
      const second = await getCapexMap(['PROJ-1'])

      expect(first.success).toBe(true)
      expect(first.data).toEqual({ 'PROJ-1': true })
      expect(second.success).toBe(true)
      expect(second.data).toEqual({ 'PROJ-1': true })
      expect(mockReadDataCache).not.toHaveBeenCalled()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('calls Jira live for capex when neither memory nor disk cache has a value', async () => {
      const { parseCapitalizationField } = await import('../../src/utils/tempoUtils')
      vi.mocked(parseCapitalizationField).mockReturnValue(true)
      const { getCapexMap } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: {} }),
      })

      const result = await getCapexMap(['PROJ-1'])

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ 'PROJ-1': true })
      expect(String(mockFetch.mock.calls[0][0])).toContain(
        '/rest/api/3/issue/PROJ-1?fields=customfield_10000,parent'
      )
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith(
        'tempo:capex:PROJ-1',
        expect.objectContaining({ data: true })
      )
    })

    it('falls back to the parent issue when the capitalization field is not present on the child', async () => {
      const { parseCapitalizationField } = await import('../../src/utils/tempoUtils')
      vi.mocked(parseCapitalizationField).mockReturnValueOnce(null).mockReturnValueOnce(true)
      const { getCapexMap } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: { parent: { key: 'EPIC-1' } } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: {} }),
      })

      const result = await getCapexMap(['PROJ-1'])

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ 'PROJ-1': true })
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith(
        'tempo:capex:EPIC-1',
        expect.objectContaining({ data: true })
      )
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith(
        'tempo:capex:PROJ-1',
        expect.objectContaining({ data: true })
      )
    })

    it('returns false when the capitalization field is missing and there is no parent issue', async () => {
      const { parseCapitalizationField } = await import('../../src/utils/tempoUtils')
      vi.mocked(parseCapitalizationField).mockReturnValue(null)
      const { getCapexMap } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: {} }),
      })

      const result = await getCapexMap(['PROJ-1'])

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ 'PROJ-1': false })
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith(
        'tempo:capex:PROJ-1',
        expect.objectContaining({ data: false })
      )
    })

    it('caches a false capex result in memory when Jira lookup fails', async () => {
      const { getCapexMap } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve('boom'),
      })

      const first = await getCapexMap(['PROJ-1'])
      mockFetch.mockClear()
      mockReadDataCache.mockClear()
      const second = await getCapexMap(['PROJ-1'])

      expect(first.success).toBe(true)
      expect(first.data).toEqual({ 'PROJ-1': false })
      expect(second.success).toBe(true)
      expect(second.data).toEqual({ 'PROJ-1': false })
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockReadDataCache).not.toHaveBeenCalled()
      expect(
        mockWriteDataCacheEntry.mock.calls.find(([key]) => key === 'tempo:capex:PROJ-1')
      ).toBeUndefined()
    })

    it('returns an error result when capex resolution throws unexpectedly', async () => {
      const { getCapexMap } = await import('./tempoClient')
      mockReadDataCache.mockImplementationOnce(() => {
        throw new Error('disk exploded')
      })

      const result = await getCapexMap(['PROJ-1'])

      expect(result.success).toBe(false)
      expect(result.error).toContain('disk exploded')
    })
  })
})
