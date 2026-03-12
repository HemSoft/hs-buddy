import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

/**
 * React hooks for Convex GitHub accounts
 */

// List all GitHub accounts
export function useGitHubAccountsConvex() {
  return useQuery(api.githubAccounts.list)
}

// GitHub account mutations
export function useGitHubAccountMutations() {
  const create = useMutation(api.githubAccounts.create)
  const update = useMutation(api.githubAccounts.update)
  const remove = useMutation(api.githubAccounts.remove)
  const bulkImport = useMutation(api.githubAccounts.bulkImport)

  return {
    create,
    update,
    remove,
    bulkImport,
  }
}

/**
 * React hooks for Convex settings
 */

// Get application settings
export function useSettings() {
  return useQuery(api.settings.get)
}

// Settings mutations
export function useSettingsMutations() {
  const updatePR = useMutation(api.settings.updatePR)
  const updateCopilot = useMutation(api.settings.updateCopilot)
  const reset = useMutation(api.settings.reset)
  const initFromMigration = useMutation(api.settings.initFromMigration)

  return {
    updatePR,
    updateCopilot,
    reset,
    initFromMigration,
  }
}

/**
 * React hooks for Convex schedules
 */

// List all schedules with job info
export function useSchedules() {
  return useQuery(api.schedules.list)
}

// Get single schedule by ID
export function useSchedule(id: Id<'schedules'> | undefined) {
  return useQuery(api.schedules.get, id ? { id } : 'skip')
}

// Schedule mutations
export function useScheduleMutations() {
  const create = useMutation(api.schedules.create)
  const update = useMutation(api.schedules.update)
  const remove = useMutation(api.schedules.remove)
  const toggle = useMutation(api.schedules.toggle)

  return {
    create,
    update,
    remove,
    toggle,
  }
}

/**
 * React hooks for Convex jobs
 */

// Type alias for clarity
export type JobId = Id<'jobs'>

// List all jobs
export function useJobs() {
  return useQuery(api.jobs.list)
}

// Get single job by ID
export function useJob(id: JobId | undefined) {
  return useQuery(api.jobs.get, id ? { id } : 'skip')
}

// Job mutations
export function useJobMutations() {
  const create = useMutation(api.jobs.create)
  const update = useMutation(api.jobs.update)
  const remove = useMutation(api.jobs.remove)

  return {
    create,
    update,
    remove,
  }
}

/**
 * React hooks for Convex runs
 */

// List recent runs
export function useRecentRuns(limit?: number) {
  return useQuery(api.runs.listRecent, { limit })
}

// List runs for a job
export function useJobRuns(jobId: JobId | undefined, limit?: number) {
  return useQuery(api.runs.listByJob, jobId ? { jobId, limit } : 'skip')
}

// List runs for a schedule
export function useScheduleRuns(scheduleId: Id<'schedules'> | undefined, limit?: number) {
  return useQuery(api.runs.listBySchedule, scheduleId ? { scheduleId, limit } : 'skip')
}

// Run mutations
export function useRunMutations() {
  const create = useMutation(api.runs.create)
  const markRunning = useMutation(api.runs.markRunning)
  const complete = useMutation(api.runs.complete)
  const fail = useMutation(api.runs.fail)
  const cancel = useMutation(api.runs.cancel)
  const cleanup = useMutation(api.runs.cleanup)

  return {
    create,
    markRunning,
    complete,
    fail,
    cancel,
    cleanup,
  }
}

/**
 * React hooks for Convex repo bookmarks
 */

// List all bookmarks
export function useRepoBookmarks() {
  return useQuery(api.repoBookmarks.list)
}

// Bookmark mutations
export function useRepoBookmarkMutations() {
  const create = useMutation(api.repoBookmarks.create)
  const update = useMutation(api.repoBookmarks.update)
  const remove = useMutation(api.repoBookmarks.remove)

  return { create, update, remove }
}

/**
 * React hooks for Convex buddy stats
 */

// Get buddy stats (reactive — auto-updates when any client increments)
export function useBuddyStats() {
  return useQuery(api.buddyStats.get)
}

// Buddy stats mutations
export function useBuddyStatsMutations() {
  const increment = useMutation(api.buddyStats.increment)
  const batchIncrement = useMutation(api.buddyStats.batchIncrement)
  const recordSessionStart = useMutation(api.buddyStats.recordSessionStart)
  const recordSessionEnd = useMutation(api.buddyStats.recordSessionEnd)
  const checkpointUptime = useMutation(api.buddyStats.checkpointUptime)

  return {
    increment,
    batchIncrement,
    recordSessionStart,
    recordSessionEnd,
    checkpointUptime,
  }
}

/**
 * React hooks for Convex Copilot SDK results
 */

// List recent copilot results
export function useCopilotResultsRecent(limit?: number) {
  return useQuery(api.copilotResults.listRecent, { limit })
}

// Get single copilot result by ID
export function useCopilotResult(id: Id<'copilotResults'> | undefined) {
  return useQuery(api.copilotResults.get, id ? { id } : 'skip')
}

// Count active (pending + running) copilot results — for badges
export function useCopilotActiveCount() {
  return useQuery(api.copilotResults.countActive)
}

// Copilot result mutations
export function useCopilotResultMutations() {
  const create = useMutation(api.copilotResults.create)
  const markRunning = useMutation(api.copilotResults.markRunning)
  const complete = useMutation(api.copilotResults.complete)
  const fail = useMutation(api.copilotResults.fail)
  const remove = useMutation(api.copilotResults.remove)
  const cleanup = useMutation(api.copilotResults.cleanup)

  return {
    create,
    markRunning,
    complete,
    fail,
    remove,
    cleanup,
  }
}

/**
 * React hooks for Convex PR review runs
 */

export function usePRReviewRunsByPR(
  owner: string | undefined,
  repo: string | undefined,
  prNumber: number | undefined,
  limit?: number
) {
  return useQuery(
    api.prReviewRuns.listByPr,
    owner && repo && typeof prNumber === 'number' ? { owner, repo, prNumber, limit } : 'skip'
  )
}

export function useLatestPRReviewRun(
  owner: string | undefined,
  repo: string | undefined,
  prNumber: number | undefined
) {
  return useQuery(
    api.prReviewRuns.latestByPr,
    owner && repo && typeof prNumber === 'number' ? { owner, repo, prNumber } : 'skip'
  )
}
