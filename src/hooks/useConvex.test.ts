import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseQuery = vi.fn().mockReturnValue(undefined)
const mockUseMutation = vi.fn().mockReturnValue(vi.fn())

vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    githubAccounts: {
      list: 'ga.list',
      create: 'ga.create',
      update: 'ga.update',
      remove: 'ga.remove',
      bulkImport: 'ga.bulkImport',
    },
    settings: {
      get: 's.get',
      updatePR: 's.updatePR',
      updateCopilot: 's.updateCopilot',
      updateViewMode: 's.uvm',
      reset: 's.reset',
      initFromMigration: 's.init',
    },
    schedules: {
      list: 'sch.list',
      get: 'sch.get',
      create: 'sch.create',
      update: 'sch.update',
      remove: 'sch.remove',
      toggle: 'sch.toggle',
    },
    jobs: {
      list: 'j.list',
      get: 'j.get',
      create: 'j.create',
      update: 'j.update',
      remove: 'j.remove',
    },
    runs: {
      listRecent: 'r.listRecent',
      listByJob: 'r.listByJob',
      listBySchedule: 'r.listBySchedule',
      create: 'r.create',
      markRunning: 'r.markRunning',
      complete: 'r.complete',
      fail: 'r.fail',
      cancel: 'r.cancel',
      cleanup: 'r.cleanup',
    },
    repoBookmarks: {
      list: 'rb.list',
      create: 'rb.create',
      update: 'rb.update',
      remove: 'rb.remove',
    },
    bookmarks: {
      list: 'b.list',
      listCategories: 'b.cat',
      create: 'b.create',
      update: 'b.update',
      remove: 'b.remove',
      recordVisit: 'b.visit',
      reorder: 'b.reorder',
    },
    buddyStats: {
      get: 'bs.get',
      increment: 'bs.inc',
      batchIncrement: 'bs.batch',
      recordSessionStart: 'bs.start',
      recordSessionEnd: 'bs.end',
      checkpointUptime: 'bs.uptime',
    },
    copilotResults: {
      listRecent: 'cr.recent',
      get: 'cr.get',
      countActive: 'cr.active',
      create: 'cr.create',
      markRunning: 'cr.running',
      complete: 'cr.complete',
      fail: 'cr.fail',
      remove: 'cr.remove',
      cleanup: 'cr.cleanup',
    },
    prReviewRuns: { listByPr: 'prr.byPr', latestByPr: 'prr.latest' },
  },
}))

import {
  useGitHubAccountsConvex,
  useGitHubAccountMutations,
  useSettings,
  useSettingsMutations,
  useSchedules,
  useSchedule,
  useScheduleMutations,
  useJobs,
  useJob,
  useJobMutations,
  useRecentRuns,
  useJobRuns,
  useScheduleRuns,
  useRunMutations,
  useRepoBookmarks,
  useRepoBookmarkMutations,
  useBookmarks,
  useBookmarkCategories,
  useBookmarkMutations,
  useBuddyStats,
  useBuddyStatsMutations,
  useCopilotResultsRecent,
  useCopilotResult,
  useCopilotActiveCount,
  useCopilotResultMutations,
  usePRReviewRunsByPR,
  useLatestPRReviewRun,
} from './useConvex'

describe('useConvex hooks', () => {
  beforeEach(() => {
    mockUseQuery.mockClear().mockReturnValue(undefined)
    mockUseMutation.mockClear().mockReturnValue(vi.fn())
  })

  describe('simple query hooks', () => {
    const queryHooks: [string, () => void, string][] = [
      [
        'useGitHubAccountsConvex',
        () => {
          useGitHubAccountsConvex()
        },
        'ga.list',
      ],
      [
        'useSettings',
        () => {
          useSettings()
        },
        's.get',
      ],
      [
        'useSchedules',
        () => {
          useSchedules()
        },
        'sch.list',
      ],
      [
        'useJobs',
        () => {
          useJobs()
        },
        'j.list',
      ],
      [
        'useRepoBookmarks',
        () => {
          useRepoBookmarks()
        },
        'rb.list',
      ],
      [
        'useBookmarks',
        () => {
          useBookmarks()
        },
        'b.list',
      ],
      [
        'useBookmarkCategories',
        () => {
          useBookmarkCategories()
        },
        'b.cat',
      ],
      [
        'useBuddyStats',
        () => {
          useBuddyStats()
        },
        'bs.get',
      ],
      [
        'useCopilotActiveCount',
        () => {
          useCopilotActiveCount()
        },
        'cr.active',
      ],
    ]
    it.each(queryHooks)('%s queries correct API', (_name, hookFn, expectedApi) => {
      renderHook(hookFn)
      expect(mockUseQuery).toHaveBeenCalledWith(expectedApi)
    })
  })

  describe('conditional query hooks', () => {
    it('useSchedule skips when id is undefined', () => {
      renderHook(() => useSchedule(undefined))
      expect(mockUseQuery).toHaveBeenCalledWith('sch.get', 'skip')
    })

    it('useSchedule passes id when provided', () => {
      renderHook(() => useSchedule('abc' as never))
      expect(mockUseQuery).toHaveBeenCalledWith('sch.get', { id: 'abc' })
    })

    it('useJob skips when id is undefined', () => {
      renderHook(() => useJob(undefined))
      expect(mockUseQuery).toHaveBeenCalledWith('j.get', 'skip')
    })

    it('useJob passes id when provided', () => {
      renderHook(() => useJob('j1' as never))
      expect(mockUseQuery).toHaveBeenCalledWith('j.get', { id: 'j1' })
    })

    it('useRecentRuns passes limit', () => {
      renderHook(() => useRecentRuns(10))
      expect(mockUseQuery).toHaveBeenCalledWith('r.listRecent', { limit: 10 })
    })

    it('useJobRuns skips when jobId is undefined', () => {
      renderHook(() => useJobRuns(undefined, 10))
      expect(mockUseQuery).toHaveBeenCalledWith('r.listByJob', 'skip')
    })

    it('useJobRuns passes params when provided', () => {
      renderHook(() => useJobRuns('j1' as never, 10))
      expect(mockUseQuery).toHaveBeenCalledWith('r.listByJob', { jobId: 'j1', limit: 10 })
    })

    it('useScheduleRuns skips when scheduleId is undefined', () => {
      renderHook(() => useScheduleRuns(undefined, 10))
      expect(mockUseQuery).toHaveBeenCalledWith('r.listBySchedule', 'skip')
    })

    it('useScheduleRuns passes params when provided', () => {
      renderHook(() => useScheduleRuns('s1' as never, 10))
      expect(mockUseQuery).toHaveBeenCalledWith('r.listBySchedule', { scheduleId: 's1', limit: 10 })
    })

    it('useCopilotResultsRecent passes limit', () => {
      renderHook(() => useCopilotResultsRecent(5))
      expect(mockUseQuery).toHaveBeenCalledWith('cr.recent', { limit: 5 })
    })

    it('useCopilotResult skips when id is undefined', () => {
      renderHook(() => useCopilotResult(undefined))
      expect(mockUseQuery).toHaveBeenCalledWith('cr.get', 'skip')
    })

    it('useCopilotResult passes id when provided', () => {
      renderHook(() => useCopilotResult('r1' as never))
      expect(mockUseQuery).toHaveBeenCalledWith('cr.get', { id: 'r1' })
    })

    it('usePRReviewRunsByPR skips when params are incomplete', () => {
      renderHook(() => usePRReviewRunsByPR(undefined, undefined, undefined))
      expect(mockUseQuery).toHaveBeenCalledWith('prr.byPr', 'skip')
    })

    it('usePRReviewRunsByPR passes params when complete', () => {
      renderHook(() => usePRReviewRunsByPR('owner', 'repo', 42, 10))
      expect(mockUseQuery).toHaveBeenCalledWith('prr.byPr', {
        owner: 'owner',
        repo: 'repo',
        prNumber: 42,
        limit: 10,
      })
    })

    it('useLatestPRReviewRun skips when params are incomplete', () => {
      renderHook(() => useLatestPRReviewRun(undefined, undefined, undefined))
      expect(mockUseQuery).toHaveBeenCalledWith('prr.latest', 'skip')
    })

    it('useLatestPRReviewRun passes params when complete', () => {
      renderHook(() => useLatestPRReviewRun('owner', 'repo', 42))
      expect(mockUseQuery).toHaveBeenCalledWith('prr.latest', {
        owner: 'owner',
        repo: 'repo',
        prNumber: 42,
      })
    })
  })

  describe('mutation hooks', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutationHooks: [string, () => any, string[]][] = [
      [
        'useGitHubAccountMutations',
        () => useGitHubAccountMutations(),
        ['create', 'update', 'remove', 'bulkImport'],
      ],
      [
        'useSettingsMutations',
        () => useSettingsMutations(),
        ['updatePR', 'updateCopilot', 'updateViewMode', 'reset', 'initFromMigration'],
      ],
      [
        'useScheduleMutations',
        () => useScheduleMutations(),
        ['create', 'update', 'remove', 'toggle'],
      ],
      ['useJobMutations', () => useJobMutations(), ['create', 'update', 'remove']],
      [
        'useRunMutations',
        () => useRunMutations(),
        ['create', 'markRunning', 'complete', 'fail', 'cancel', 'cleanup'],
      ],
      [
        'useRepoBookmarkMutations',
        () => useRepoBookmarkMutations(),
        ['create', 'update', 'remove'],
      ],
      [
        'useBookmarkMutations',
        () => useBookmarkMutations(),
        ['create', 'update', 'remove', 'recordVisit', 'reorder'],
      ],
      [
        'useBuddyStatsMutations',
        () => useBuddyStatsMutations(),
        [
          'increment',
          'batchIncrement',
          'recordSessionStart',
          'recordSessionEnd',
          'checkpointUptime',
        ],
      ],
      [
        'useCopilotResultMutations',
        () => useCopilotResultMutations(),
        ['create', 'markRunning', 'complete', 'fail', 'remove', 'cleanup'],
      ],
    ]
    it.each(mutationHooks)('%s returns expected keys', (_name, hookFn, expectedKeys) => {
      const { result } = renderHook(hookFn)
      for (const key of expectedKeys) {
        expect(result.current).toHaveProperty(key)
      }
    })
  })
})
