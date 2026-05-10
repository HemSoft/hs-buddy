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
    it('returns day summary with total hours', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-abc' }),
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
            results: [
              { id: 200, issue: { id: 10 }, timeSpentSeconds: 7200 },
              { id: 201, issue: { id: 10 }, timeSpentSeconds: 3600 },
            ],
          }),
      })
      // issue key resolution (one unique issue)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'PROJ-5', fields: { summary: 'Test' } }),
      })

      const result = await getWorklogsForDate('2024-03-15')
      expect(result.success).toBe(true)
      expect(result.data!.date).toBe('2024-03-15')
      expect(result.data!.totalHours).toBe(2) // 2 worklogs × 1 hour each (mocked enrichWorklog)
      expect(result.data!.worklogs).toHaveLength(2)
    })

    it('returns error when underlying range fetch fails', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })
      mockReadDataCache.mockReturnValue({})

      const result = await getWorklogsForDate('2024-03-15')
      expect(result.success).toBe(false)
    })
  })

  describe('getWeekSummary', () => {
    it('returns week summary with issue summaries and total hours', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-week' }),
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
            results: [{ id: 300, issue: { id: 20 }, timeSpentSeconds: 3600 }],
          }),
      })
      // issue key resolution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'PROJ-10', fields: { summary: 'Weekly task' } }),
      })

      const result = await getWeekSummary('2024-03-11', '2024-03-15')
      expect(result.success).toBe(true)
      expect(result.data!.totalHours).toBe(8) // mocked summarizeWorklogs returns 8
      expect(result.data!.issueSummaries).toEqual([])
      expect(result.data!.worklogs).toHaveLength(1)
    })
  })

  describe('createWorklog', () => {
    it('creates a worklog and returns enriched result', async () => {
      const { createWorklog } = await import('./tempoClient')
      // 1) /myself (getAccountId → fetchAccountIdFromJira)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-create' }),
      })
      // 2) resolveIssueId (Jira issue lookup)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '42', fields: { summary: 'My issue' } }),
      })
      // 3) POST worklog
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 999,
            issue: { id: 42 },
            timeSpentSeconds: 3600,
          }),
      })
      // 4) accounts (getAccountMap → getAccounts)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }),
      })

      const result = await createWorklog({
        issueKey: 'PROJ-42',
        hours: 1,
        date: '2024-03-15',
        startTime: '09:00:00',
        description: 'Test work',
      } as Parameters<typeof createWorklog>[0])

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('returns error when issue resolution fails', async () => {
      const { createWorklog } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-fail' }),
      })
      // accounts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      // resolveIssueId fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Issue not found'),
      })

      const result = await createWorklog({
        issueKey: 'INVALID-999',
        hours: 1,
        date: '2024-03-15',
        startTime: '09:00:00',
      } as Parameters<typeof createWorklog>[0])

      expect(result.success).toBe(false)
    })
  })

  describe('updateWorklog', () => {
    it('updates a worklog and returns success', async () => {
      const { updateWorklog } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-update' }),
      })
      // PUT worklog
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await updateWorklog(123, {
        timeSpentSeconds: 7200,
        date: '2024-03-15',
        startTime: '10:00:00',
      } as Parameters<typeof updateWorklog>[1])

      expect(result.success).toBe(true)
    })

    it('returns error on API failure', async () => {
      const { updateWorklog } = await import('./tempoClient')
      // /myself
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-update-fail' }),
      })
      // PUT fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid payload'),
      })

      const result = await updateWorklog(123, {
        timeSpentSeconds: 7200,
        date: '2024-03-15',
        startTime: '10:00:00',
      } as Parameters<typeof updateWorklog>[1])

      expect(result.success).toBe(false)
    })
  })

  describe('getUserSchedule', () => {
    it('returns schedule data for a date range', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      // /myself
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
              { date: '2024-03-11', requiredSeconds: 28800, type: 'WORKING_DAY' },
              {
                date: '2024-03-12',
                requiredSeconds: 0,
                type: 'HOLIDAY',
                holiday: { name: 'Day Off' },
              },
            ],
          }),
      })

      const result = await getUserSchedule('2024-03-11', '2024-03-15')
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data![0].type).toBe('WORKING_DAY')
      expect(result.data![1].holidayName).toBe('Day Off')
    })
  })

  describe('getCapexMap', () => {
    it('returns capitalization map for issue keys', async () => {
      const { getCapexMap } = await import('./tempoClient')
      // capex resolution falls back to false when no Jira headers
      // (since mock env returns tokens, it will try Jira)
      // Issue fetch for capex
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: { customfield_10000: null, parent: undefined } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: { customfield_10000: null, parent: undefined } }),
      })

      const result = await getCapexMap(['PROJ-1', 'PROJ-2'])
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(typeof result.data!['PROJ-1']).toBe('boolean')
    })
  })

  describe('getProjectAccountLinks', () => {
    it('returns project account links', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      // resolveProjectId (Jira project lookup)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '100' }),
      })
      // account-links
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                account: { id: 5, self: '/accounts/5' },
                default: true,
                scope: { id: 100, type: 'PROJECT' },
              },
            ],
          }),
      })
      // getAccounts (for accountMap)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 5, key: 'DEV', name: 'Development' }] }),
      })

      const result = await getProjectAccountLinks('PROJ')
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('returns error on failure', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Project not found'),
      })

      const result = await getProjectAccountLinks('NONEXIST')
      expect(result.success).toBe(false)
    })
  })
})
