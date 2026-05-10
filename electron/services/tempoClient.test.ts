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
    it('returns day summary with totalHours on success', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ results: [{ id: 1, issue: { id: 10 }, timeSpentSeconds: 3600 }] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'PROJ-1', fields: { summary: 'Task' } }),
      })

      const result = await getWorklogsForDate('2024-01-15')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        date: '2024-01-15',
        totalHours: 1,
        worklogs: [
          {
            id: 1,
            issue: { id: 10 },
            timeSpentSeconds: 3600,
            hours: 1,
            date: '2024-01-01',
            startTime: '09:00',
          },
        ],
      })
    })

    it('returns error on failure', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })

      const result = await getWorklogsForDate('2024-01-15')

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
    })
  })

  describe('getWeekSummary', () => {
    it('returns week summary with issue summaries and totalHours', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })

      const result = await getWeekSummary('2024-01-15', '2024-01-21')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        worklogs: [],
        issueSummaries: [],
        totalHours: 8,
      })
    })

    it('returns error on failure', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })

      const result = await getWeekSummary('2024-01-15', '2024-01-21')

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
    })
  })

  describe('createWorklog', () => {
    it('creates worklog and returns enriched result', async () => {
      const { createWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '42', fields: { summary: 'Task' } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })

      const result = await createWorklog({ issueKey: 'PROJ-1', hours: 1, date: '2024-01-15' })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        id: 100,
        issue: { id: 42 },
        timeSpentSeconds: 3600,
        hours: 1,
        date: '2024-01-01',
        startTime: '09:00',
      })
      const [url, options] = mockFetch.mock.calls[2]
      expect(url).toContain('/worklogs')
      expect(options.method).toBe('POST')
    })

    it('returns error when API fails', async () => {
      const { createWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '42', fields: { summary: 'Task' } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid'),
      })

      const result = await createWorklog({ issueKey: 'PROJ-1', hours: 1, date: '2024-01-15' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('400')
    })
  })

  describe('updateWorklog', () => {
    it('updates worklog and returns success', async () => {
      const { updateWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await updateWorklog(100, { hours: 2 })

      expect(result.success).toBe(true)
      const [url, options] = mockFetch.mock.calls[1]
      expect(url).toContain('/worklogs/100')
      expect(options.method).toBe('PUT')
    })

    it('returns error when API fails', async () => {
      const { updateWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
      })

      const result = await updateWorklog(100, { hours: 2 })

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
    })
  })

  describe('getUserSchedule', () => {
    it('returns schedule data on success', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
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
      expect(result.data).toEqual([
        { date: '2024-01-15', requiredSeconds: 28800, type: 'WORKING_DAY' },
        { date: '2024-01-16', requiredSeconds: 0, type: 'HOLIDAY', holidayName: 'MLK Day' },
      ])
    })

    it('returns error on failure', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'user-123' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })

      const result = await getUserSchedule('2024-01-15', '2024-01-16')

      expect(result.success).toBe(false)
      expect(result.error).toContain('401')
    })
  })

  describe('getCapexMap', () => {
    it('returns capex map resolving from Jira', async () => {
      const { getCapexMap } = await import('./tempoClient')
      const { parseCapitalizationField } = await import('../../src/utils/tempoUtils')
      vi.mocked(parseCapitalizationField).mockReturnValueOnce(true).mockReturnValueOnce(false)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: { customfield_10000: { value: 'Yes' } } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ fields: { customfield_10000: null } }),
      })

      const result = await getCapexMap(['PROJ-1', 'PROJ-2'])

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ 'PROJ-1': true, 'PROJ-2': false })
    })

    it('deduplicates issue keys', async () => {
      const { getCapexMap } = await import('./tempoClient')
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fields: {} }),
      })

      const result = await getCapexMap(['PROJ-1', 'PROJ-1', 'PROJ-2'])

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ 'PROJ-1': false, 'PROJ-2': false })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('getProjectAccountLinks', () => {
    it('returns project account links on success', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '100' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                account: { id: 10, self: '/10' },
                default: true,
                scope: { id: 100, type: 'PROJECT' },
              },
            ],
          }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 10, key: 'DEV', name: 'Development' }] }),
      })

      const result = await getProjectAccountLinks('PROJ')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([{ key: 'DEV', name: 'Development', isDefault: true }])
    })

    it('returns error on failure', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(''),
      })

      const result = await getProjectAccountLinks('PROJ')

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
  })
})
