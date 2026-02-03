import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * React hooks for Convex GitHub accounts
 */

// List all GitHub accounts
export function useGitHubAccountsConvex() {
  return useQuery(api.githubAccounts.list);
}

// Get single GitHub account by ID
export function useGitHubAccount(id: Id<"githubAccounts"> | undefined) {
  return useQuery(api.githubAccounts.get, id ? { id } : "skip");
}

// GitHub account mutations
export function useGitHubAccountMutations() {
  const create = useMutation(api.githubAccounts.create);
  const update = useMutation(api.githubAccounts.update);
  const remove = useMutation(api.githubAccounts.remove);
  const bulkImport = useMutation(api.githubAccounts.bulkImport);

  return {
    create,
    update,
    remove,
    bulkImport,
  };
}

/**
 * React hooks for Convex Bitbucket workspaces
 */

// List all Bitbucket workspaces
export function useBitbucketWorkspaces() {
  return useQuery(api.bitbucketWorkspaces.list);
}

// Get single Bitbucket workspace by ID
export function useBitbucketWorkspace(id: Id<"bitbucketWorkspaces"> | undefined) {
  return useQuery(api.bitbucketWorkspaces.get, id ? { id } : "skip");
}

// Bitbucket workspace mutations
export function useBitbucketWorkspaceMutations() {
  const create = useMutation(api.bitbucketWorkspaces.create);
  const update = useMutation(api.bitbucketWorkspaces.update);
  const remove = useMutation(api.bitbucketWorkspaces.remove);

  return {
    create,
    update,
    remove,
  };
}

/**
 * React hooks for Convex settings
 */

// Get application settings
export function useSettings() {
  return useQuery(api.settings.get);
}

// Settings mutations
export function useSettingsMutations() {
  const updatePR = useMutation(api.settings.updatePR);
  const reset = useMutation(api.settings.reset);
  const initFromMigration = useMutation(api.settings.initFromMigration);

  return {
    updatePR,
    reset,
    initFromMigration,
  };
}

/**
 * React hooks for Convex schedules
 */

// List all schedules with job info
export function useSchedules() {
  return useQuery(api.schedules.list);
}

// List only enabled schedules
export function useEnabledSchedules() {
  return useQuery(api.schedules.listEnabled);
}

// Get single schedule by ID
export function useSchedule(id: Id<"schedules"> | undefined) {
  return useQuery(api.schedules.get, id ? { id } : "skip");
}

// Schedule mutations
export function useScheduleMutations() {
  const create = useMutation(api.schedules.create);
  const update = useMutation(api.schedules.update);
  const remove = useMutation(api.schedules.remove);
  const toggle = useMutation(api.schedules.toggle);

  return {
    create,
    update,
    remove,
    toggle,
  };
}

/**
 * React hooks for Convex jobs
 */

// Type alias for clarity
export type JobId = Id<"jobs">;

// List all jobs
export function useJobs() {
  return useQuery(api.jobs.list);
}

// List jobs by worker type
export function useJobsByType(workerType: "exec" | "ai" | "skill") {
  return useQuery(api.jobs.listByType, { workerType });
}

// Get single job by ID
export function useJob(id: JobId | undefined) {
  return useQuery(api.jobs.get, id ? { id } : "skip");
}

// Get job by name
export function useJobByName(name: string | undefined) {
  return useQuery(api.jobs.getByName, name ? { name } : "skip");
}

// Job mutations
export function useJobMutations() {
  const create = useMutation(api.jobs.create);
  const update = useMutation(api.jobs.update);
  const remove = useMutation(api.jobs.remove);

  return {
    create,
    update,
    remove,
  };
}

/**
 * React hooks for Convex runs
 */

// List recent runs
export function useRecentRuns(limit?: number) {
  return useQuery(api.runs.listRecent, { limit });
}

// List runs for a job
export function useJobRuns(jobId: JobId | undefined, limit?: number) {
  return useQuery(api.runs.listByJob, jobId ? { jobId, limit } : "skip");
}

// List runs for a schedule
export function useScheduleRuns(scheduleId: Id<"schedules"> | undefined, limit?: number) {
  return useQuery(api.runs.listBySchedule, scheduleId ? { scheduleId, limit } : "skip");
}

// Get single run by ID
export function useRun(id: Id<"runs"> | undefined) {
  return useQuery(api.runs.get, id ? { id } : "skip");
}

// List runs by status
export function useRunsByStatus(status: "pending" | "running" | "completed" | "failed" | "cancelled", limit?: number) {
  return useQuery(api.runs.listByStatus, { status, limit });
}

// Run mutations
export function useRunMutations() {
  const create = useMutation(api.runs.create);
  const markRunning = useMutation(api.runs.markRunning);
  const complete = useMutation(api.runs.complete);
  const fail = useMutation(api.runs.fail);
  const cancel = useMutation(api.runs.cancel);
  const cleanup = useMutation(api.runs.cleanup);

  return {
    create,
    markRunning,
    complete,
    fail,
    cancel,
    cleanup,
  };
}
