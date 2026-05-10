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

function okJson(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }
}

function errorJson(status: number, body: string) {
  return {
    ok: false,
    status,
    statusText: body,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  }
}

describe('tempoClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    mockFetch.mockReset()
    mockReadDataCache.mockReturnValue({})
    mockWriteDataCacheEntry.mockReset()
  })

  describe('getAccounts', () => {
    it('fetches accounts from Tempo API and returns success result', async () => {
      const { getAccounts } = await import('./tempoClient')
      const accounts = [
        { id: 1, key: 'DEV', name: 'Development' },
        { id: 2, key: 'OPS', name: 'Operations' },
      ]
      mockFetch.mockResolvedValueOnce(okJson({ results: accounts }))

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
      mockFetch.mockResolvedValueOnce(okJson({ results: accounts }))

      await getAccounts()
      const result = await getAccounts()

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(result.success).toBe(true)
    })

    it('returns error result on API failure', async () => {
      const { getAccounts } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(errorJson(500, 'Server error'))

      const result = await getAccounts()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('getWorklogsForRange', () => {
    it('fetches worklogs, resolves issue keys, and returns enriched data', async () => {
      const { getWorklogsForRange } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(okJson({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }))
      mockFetch.mockResolvedValueOnce(
        okJson({ results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 }] })
      )
      mockFetch.mockResolvedValueOnce(okJson({ key: 'PROJ-1', fields: { summary: 'Test issue' } }))

      const result = await getWorklogsForRange('2024-01-01', '2024-01-07')

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.length).toBe(1)
    })

    it('returns error result when account ID cannot be resolved', async () => {
      const { getWorklogsForRange } = await import('./tempoClient')
      mockFetch.mockResolvedValue(errorJson(401, 'Unauthorized'))
      mockReadDataCache.mockReturnValue({})

      const result = await getWorklogsForRange('2024-01-01', '2024-01-07')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('getWorklogsForDate', () => {
    it('summarizes a single day of worklogs', async () => {
      const { getWorklogsForDate } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(okJson({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }))
      mockFetch.mockResolvedValueOnce(
        okJson({
          results: [
            { id: 100, issue: { id: 42 }, timeSpentSeconds: 3600 },
            { id: 101, issue: { id: 43 }, timeSpentSeconds: 3600 },
          ],
        })
      )
      mockFetch.mockResolvedValueOnce(okJson({ key: 'PROJ-1', fields: { summary: 'First issue' } }))
      mockFetch.mockResolvedValueOnce(
        okJson({ key: 'PROJ-2', fields: { summary: 'Second issue' } })
      )

      const result = await getWorklogsForDate('2024-01-03')

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          date: '2024-01-03',
          totalHours: 2,
        }),
      })
      expect(result.data?.worklogs).toHaveLength(2)
    })
  })

  describe('getWeekSummary', () => {
    it('returns summarized worklogs for the requested week', async () => {
      const { getWeekSummary } = await import('./tempoClient')
      const { summarizeWorklogs } = await import('../../src/utils/tempoUtils')
      vi.mocked(summarizeWorklogs).mockReturnValueOnce({
        issueSummaries: [
          {
            issueKey: 'PROJ-1',
            issueSummary: 'Weekly work',
            totalHours: 4,
            hoursByDate: { '2024-01-01': 4 },
          },
        ],
        totalHours: 4,
      })
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(okJson({ results: [{ id: 1, key: 'DEV', name: 'Dev' }] }))
      mockFetch.mockResolvedValueOnce(
        okJson({ results: [{ id: 100, issue: { id: 42 }, timeSpentSeconds: 14400 }] })
      )
      mockFetch.mockResolvedValueOnce(okJson({ key: 'PROJ-1', fields: { summary: 'Weekly work' } }))

      const result = await getWeekSummary('2024-01-01', '2024-01-07')

      expect(result).toEqual({
        success: true,
        data: {
          worklogs: expect.any(Array),
          issueSummaries: [
            {
              issueKey: 'PROJ-1',
              issueSummary: 'Weekly work',
              totalHours: 4,
              hoursByDate: { '2024-01-01': 4 },
            },
          ],
          totalHours: 4,
        },
      })
    })
  })

  describe('createWorklog', () => {
    it('creates a worklog and returns the enriched response', async () => {
      const { createWorklog } = await import('./tempoClient')
      const { buildCreateWorklogBody } = await import('../../src/utils/tempoUtils')
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(okJson({ id: '42', fields: { summary: 'Build feature' } }))
      mockFetch.mockResolvedValueOnce(
        okJson({
          tempoWorklogId: 555,
          issue: { id: 42 },
          timeSpentSeconds: 7200,
          startDate: '2024-01-03',
          startTime: '09:00:00',
          description: 'Worked on feature',
          author: { accountId: 'user-123' },
          attributes: { values: [] },
        })
      )
      mockFetch.mockResolvedValueOnce(
        okJson({ results: [{ id: 1, key: 'DEV', name: 'Development' }] })
      )

      const payload = {
        issueKey: 'PROJ-42',
        hours: 2,
        date: '2024-01-03',
        description: 'Worked on feature',
      }
      const result = await createWorklog(payload)

      expect(vi.mocked(buildCreateWorklogBody)).toHaveBeenCalledWith('user-123', 42, payload)
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.tempo.io/4/worklogs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ authorAccountId: 'user-123', issueId: 42 }),
        })
      )
      expect(result.success).toBe(true)
      expect(result.data).toEqual(expect.objectContaining({ hours: 1 }))
    })

    it('returns an error when the issue key cannot be resolved', async () => {
      const { createWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(errorJson(404, 'Issue not found'))

      const result = await createWorklog({ issueKey: 'BAD-1', hours: 1, date: '2024-01-03' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
  })

  describe('updateWorklog', () => {
    it('updates an existing worklog', async () => {
      const { updateWorklog } = await import('./tempoClient')
      const { buildUpdateWorklogBody } = await import('../../src/utils/tempoUtils')
      const payload = { hours: 3, description: 'Updated entry' }
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(okJson({}))

      const result = await updateWorklog(999, payload)

      expect(vi.mocked(buildUpdateWorklogBody)).toHaveBeenCalledWith('user-123', payload)
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.tempo.io/4/worklogs/999',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ authorAccountId: 'user-123' }),
        })
      )
      expect(result).toEqual({ success: true })
    })

    it('returns an error when the update request fails', async () => {
      const { updateWorklog } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(errorJson(400, 'Bad request'))

      const result = await updateWorklog(999, { description: 'Broken entry' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('400')
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
      mockFetch.mockResolvedValueOnce(errorJson(404, 'Not found'))

      const result = await deleteWorklog(999)

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
  })

  describe('getUserSchedule', () => {
    it('returns mapped schedule days', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(
        okJson({
          results: [
            { date: '2024-01-04', requiredSeconds: 28800, type: 'WORKING_DAY' },
            {
              date: '2024-01-05',
              requiredSeconds: 0,
              type: 'HOLIDAY',
              holiday: { name: 'Founders Day' },
            },
          ],
        })
      )

      const result = await getUserSchedule('2024-01-04', '2024-01-05')

      expect(result).toEqual({
        success: true,
        data: [
          { date: '2024-01-04', requiredSeconds: 28800, type: 'WORKING_DAY' },
          {
            date: '2024-01-05',
            requiredSeconds: 0,
            type: 'HOLIDAY',
            holidayName: 'Founders Day',
          },
        ],
      })
    })

    it('returns an error when the schedule fetch fails', async () => {
      const { getUserSchedule } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(okJson({ accountId: 'user-123' }))
      mockFetch.mockResolvedValueOnce(errorJson(500, 'Schedule unavailable'))

      const result = await getUserSchedule('2024-01-04', '2024-01-05')

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
    })
  })

  describe('getCapexMap', () => {
    it('returns false when Jira credentials are unavailable', async () => {
      const { createEnvResolver } = await import('../../src/utils/envLookup')
      vi.mocked(createEnvResolver).mockReturnValueOnce((name: string) =>
        name === 'TEMPO_API_TOKEN' ? 'test-tempo-token' : undefined
      )
      const { getCapexMap } = await import('./tempoClient')

      const result = await getCapexMap(['PROJ-9'])

      expect(result).toEqual({ success: true, data: { 'PROJ-9': false } })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('resolves values from disk cache and parent epics', async () => {
      const { getCapexMap } = await import('./tempoClient')
      const { parseCapitalizationField, isCacheEntryValid } =
        await import('../../src/utils/tempoUtils')
      mockReadDataCache.mockReturnValue({
        'tempo:capex:PROJ-1': { data: true, fetchedAt: Date.now() },
      })
      vi.mocked(isCacheEntryValid).mockImplementation((entry: { data?: unknown } | undefined) =>
        Boolean(entry?.data === true)
      )
      vi.mocked(parseCapitalizationField).mockReturnValueOnce(null).mockReturnValueOnce(true)
      mockFetch.mockResolvedValueOnce(okJson({ fields: { parent: { key: 'EPIC-1' } } }))
      mockFetch.mockResolvedValueOnce(okJson({ fields: {} }))

      const result = await getCapexMap(['PROJ-1', 'PROJ-2', 'PROJ-2'])

      expect(result).toEqual({ success: true, data: { 'PROJ-1': true, 'PROJ-2': true } })
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith(
        'tempo:capex:EPIC-1',
        expect.objectContaining({ data: true })
      )
      expect(mockWriteDataCacheEntry).toHaveBeenCalledWith(
        'tempo:capex:PROJ-2',
        expect.objectContaining({ data: true })
      )
    })
  })

  describe('getProjectAccountLinks', () => {
    it('returns mapped account links for a project', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(okJson({ id: '123' }))
      mockFetch.mockResolvedValueOnce(
        okJson({
          results: [
            {
              id: 1,
              account: { id: 1, self: 'https://api.tempo.io/4/accounts/1' },
              default: true,
              scope: { id: 123, type: 'PROJECT' },
            },
            {
              id: 2,
              account: { self: 'https://api.tempo.io/4/accounts/2' },
              default: false,
              scope: { id: 123, type: 'PROJECT' },
            },
            {
              id: 3,
              account: { id: 999, self: 'https://api.tempo.io/4/accounts/999' },
              default: false,
              scope: { id: 123, type: 'PROJECT' },
            },
          ],
        })
      )
      mockFetch.mockResolvedValueOnce(
        okJson({
          results: [
            { id: 1, key: 'DEV', name: 'Development' },
            { id: 2, key: 'OPS', name: 'Operations' },
          ],
        })
      )

      const result = await getProjectAccountLinks('ENG')

      expect(result).toEqual({
        success: true,
        data: [
          { key: 'DEV', name: 'Development', isDefault: true },
          { key: 'OPS', name: 'Operations', isDefault: false },
        ],
      })
    })

    it('returns an error when the project lookup fails', async () => {
      const { getProjectAccountLinks } = await import('./tempoClient')
      mockFetch.mockResolvedValueOnce(errorJson(404, 'Project not found'))

      const result = await getProjectAccountLinks('MISSING')

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
  })
})
