import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetWorklogsForDate = vi.fn()
const mockGetWorklogsForRange = vi.fn()
const mockGetWeekSummary = vi.fn()
const mockCreateWorklog = vi.fn()
const mockUpdateWorklog = vi.fn()
const mockDeleteWorklog = vi.fn()
const mockGetAccounts = vi.fn()
const mockGetProjectAccountLinks = vi.fn()
const mockGetCapexMap = vi.fn()
const mockGetUserSchedule = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('../services/tempoClient', () => ({
  getWorklogsForDate: (...args: unknown[]) => mockGetWorklogsForDate(...args),
  getWorklogsForRange: (...args: unknown[]) => mockGetWorklogsForRange(...args),
  getWeekSummary: (...args: unknown[]) => mockGetWeekSummary(...args),
  createWorklog: (...args: unknown[]) => mockCreateWorklog(...args),
  updateWorklog: (...args: unknown[]) => mockUpdateWorklog(...args),
  deleteWorklog: (...args: unknown[]) => mockDeleteWorklog(...args),
  getAccounts: (...args: unknown[]) => mockGetAccounts(...args),
  getProjectAccountLinks: (...args: unknown[]) => mockGetProjectAccountLinks(...args),
  getCapexMap: (...args: unknown[]) => mockGetCapexMap(...args),
  getUserSchedule: (...args: unknown[]) => mockGetUserSchedule(...args),
}))

vi.mock('../../src/utils/dateUtils', () => ({
  formatDateKey: vi.fn(() => '2026-01-15'),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}))

import { ipcMain } from 'electron'
import { registerTempoHandlers } from './tempoHandlers'

describe('tempoHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerTempoHandlers()
  })

  it('registers expected channels', () => {
    expect(handlers.has('tempo:get-today')).toBe(true)
    expect(handlers.has('tempo:get-range')).toBe(true)
    expect(handlers.has('tempo:get-week')).toBe(true)
  })

  describe('tempo:get-today', () => {
    it('fetches worklogs for specified date', async () => {
      mockGetWorklogsForDate.mockResolvedValue([{ id: 1, timeSpent: 3600 }])
      const result = await handlers.get('tempo:get-today')!({}, '2026-01-10')
      expect(mockGetWorklogsForDate).toHaveBeenCalledWith('2026-01-10')
      expect(result).toEqual([{ id: 1, timeSpent: 3600 }])
    })

    it('defaults to today when no date provided', async () => {
      mockGetWorklogsForDate.mockResolvedValue([])
      await handlers.get('tempo:get-today')!({})
      expect(mockGetWorklogsForDate).toHaveBeenCalledWith('2026-01-15')
    })

    it('returns error when service throws', async () => {
      mockGetWorklogsForDate.mockRejectedValue(new Error('Tempo unavailable'))
      const result = await handlers.get('tempo:get-today')!({})
      expect(result).toEqual({ success: false, error: 'Tempo unavailable' })
    })
  })

  describe('tempo:get-range', () => {
    it('fetches worklogs for a date range', async () => {
      mockGetWorklogsForRange.mockResolvedValue([{ id: 2 }])
      const result = await handlers.get('tempo:get-range')!(
        {},
        {
          from: '2026-01-01',
          to: '2026-01-07',
        }
      )
      expect(mockGetWorklogsForRange).toHaveBeenCalledWith('2026-01-01', '2026-01-07')
      expect(result).toEqual([{ id: 2 }])
    })
  })

  describe('tempo:get-week', () => {
    it('fetches week summary', async () => {
      mockGetWeekSummary.mockResolvedValue({ total: 40 })
      const result = await handlers.get('tempo:get-week')!(
        {},
        {
          weekStart: '2026-01-13',
          weekEnd: '2026-01-17',
        }
      )
      expect(mockGetWeekSummary).toHaveBeenCalledWith('2026-01-13', '2026-01-17')
      expect(result).toEqual({ total: 40 })
    })
  })

  describe('tempo:create-worklog', () => {
    it('creates a worklog and returns result', async () => {
      const payload = { issueKey: 'TEST-1', timeSpentSeconds: 3600, startDate: '2026-01-15' }
      mockCreateWorklog.mockResolvedValue({ id: 10, timeSpent: 3600 })
      const result = await handlers.get('tempo:create-worklog')!({}, payload)
      expect(mockCreateWorklog).toHaveBeenCalledWith(payload)
      expect(result).toEqual({ id: 10, timeSpent: 3600 })
    })

    it('returns error when create fails', async () => {
      mockCreateWorklog.mockRejectedValue(new Error('Invalid issue'))
      const result = await handlers.get('tempo:create-worklog')!({}, {})
      expect(result).toEqual({ success: false, error: 'Invalid issue' })
    })
  })

  describe('tempo:update-worklog', () => {
    it('updates a worklog', async () => {
      const payload = { timeSpentSeconds: 7200 }
      mockUpdateWorklog.mockResolvedValue({ id: 10, timeSpent: 7200 })
      const result = await handlers.get('tempo:update-worklog')!({}, { worklogId: 10, payload })
      expect(mockUpdateWorklog).toHaveBeenCalledWith(10, payload)
      expect(result).toEqual({ id: 10, timeSpent: 7200 })
    })

    it('returns error when update fails', async () => {
      mockUpdateWorklog.mockRejectedValue(new Error('Not found'))
      const result = await handlers.get('tempo:update-worklog')!({}, { worklogId: 99, payload: {} })
      expect(result).toEqual({ success: false, error: 'Not found' })
    })
  })

  describe('tempo:delete-worklog', () => {
    it('deletes a worklog', async () => {
      mockDeleteWorklog.mockResolvedValue(undefined)
      const result = await handlers.get('tempo:delete-worklog')!({}, 10)
      expect(mockDeleteWorklog).toHaveBeenCalledWith(10)
      expect(result).toBeUndefined()
    })

    it('returns error when delete fails', async () => {
      mockDeleteWorklog.mockRejectedValue(new Error('Forbidden'))
      const result = await handlers.get('tempo:delete-worklog')!({}, 10)
      expect(result).toEqual({ success: false, error: 'Forbidden' })
    })
  })

  describe('tempo:get-accounts', () => {
    it('returns accounts list', async () => {
      mockGetAccounts.mockResolvedValue([{ id: 1, name: 'Account A' }])
      const result = await handlers.get('tempo:get-accounts')!({})
      expect(mockGetAccounts).toHaveBeenCalled()
      expect(result).toEqual([{ id: 1, name: 'Account A' }])
    })

    it('returns error when service throws', async () => {
      mockGetAccounts.mockRejectedValue(new Error('Auth failed'))
      const result = await handlers.get('tempo:get-accounts')!({})
      expect(result).toEqual({ success: false, error: 'Auth failed' })
    })
  })

  describe('tempo:get-project-accounts', () => {
    it('returns project account links', async () => {
      mockGetProjectAccountLinks.mockResolvedValue([{ id: 1, projectKey: 'PROJ' }])
      const result = await handlers.get('tempo:get-project-accounts')!({}, 'PROJ')
      expect(mockGetProjectAccountLinks).toHaveBeenCalledWith('PROJ')
      expect(result).toEqual([{ id: 1, projectKey: 'PROJ' }])
    })
  })

  describe('tempo:get-capex-map', () => {
    it('returns capex map for issue keys', async () => {
      mockGetCapexMap.mockResolvedValue({ 'TEST-1': true, 'TEST-2': false })
      const result = await handlers.get('tempo:get-capex-map')!({}, ['TEST-1', 'TEST-2'])
      expect(mockGetCapexMap).toHaveBeenCalledWith(['TEST-1', 'TEST-2'])
      expect(result).toEqual({ 'TEST-1': true, 'TEST-2': false })
    })
  })

  describe('tempo:get-schedule', () => {
    it('returns user schedule for date range', async () => {
      mockGetUserSchedule.mockResolvedValue({ days: [] })
      const result = await handlers.get('tempo:get-schedule')!(
        {},
        { from: '2026-01-13', to: '2026-01-17' }
      )
      expect(mockGetUserSchedule).toHaveBeenCalledWith('2026-01-13', '2026-01-17')
      expect(result).toEqual({ days: [] })
    })

    it('returns error when schedule fetch fails', async () => {
      mockGetUserSchedule.mockRejectedValue(new Error('Timeout'))
      const result = await handlers.get('tempo:get-schedule')!(
        {},
        { from: '2026-01-13', to: '2026-01-17' }
      )
      expect(result).toEqual({ success: false, error: 'Timeout' })
    })
  })
})
