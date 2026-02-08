import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex Schema for Buddy
 * 
 * Tables:
 * - githubAccounts: GitHub account configurations
 * - bitbucketWorkspaces: Bitbucket workspace configurations
 * - settings: Application settings (non-UI, synced across sessions)
 * - jobs: Task definitions (name, worker type, config)
 * - schedules: Cron config, enabled state, linked job
 * - runs: Execution history (status, duration, output)
 */

export default defineSchema({
  /**
   * GitHub account configurations
   * Note: Tokens are NOT stored - uses GitHub CLI (gh auth) for auth
   */
  githubAccounts: defineTable({
    username: v.string(),
    org: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_org", ["org"]),

  /**
   * Bitbucket workspace configurations
   * Note: Tokens are NOT stored - uses app passwords via keychain
   */
  bitbucketWorkspaces: defineTable({
    workspace: v.string(),
    username: v.string(),
    userDisplayName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspace"]),

  /**
   * Application settings (non-UI settings that should persist)
   * Singleton table - only one document with key "default"
   */
  settings: defineTable({
    key: v.literal("default"),
    pr: v.object({
      refreshInterval: v.number(), // minutes
      autoRefresh: v.boolean(),
      recentlyMergedDays: v.number(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"]),

  /**
   * Job definitions - the tasks that can be scheduled or run manually
   */
  jobs: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    workerType: v.union(
      v.literal("exec"),   // Shell commands (PowerShell, bash)
      v.literal("ai"),     // LLM prompts
      v.literal("skill")   // Claude skills
    ),
    // Worker-specific configuration
    config: v.object({
      // exec-worker
      command: v.optional(v.string()),
      cwd: v.optional(v.string()),
      timeout: v.optional(v.number()),
      shell: v.optional(v.union(
        v.literal("powershell"),
        v.literal("bash"),
        v.literal("cmd")
      )),
      // ai-worker
      prompt: v.optional(v.string()),
      model: v.optional(v.string()),
      maxTokens: v.optional(v.number()),
      temperature: v.optional(v.number()),
      // skill-worker
      skillName: v.optional(v.string()),
      action: v.optional(v.string()),
      params: v.optional(v.any()),
    }),
    // Input parameters that can be provided at runtime
    inputParams: v.optional(v.array(v.object({
      name: v.string(),
      type: v.union(
        v.literal("string"),
        v.literal("number"),
        v.literal("boolean")
      ),
      defaultValue: v.optional(v.any()),
      required: v.boolean(),
      description: v.optional(v.string()),
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_worker_type", ["workerType"]),

  /**
   * Schedules - cron-based triggers for jobs
   */
  schedules: defineTable({
    jobId: v.id("jobs"),
    name: v.string(),
    description: v.optional(v.string()),
    cron: v.string(), // Standard 5-field cron: "0 9 * * 1-5"
    timezone: v.optional(v.string()), // e.g., "America/New_York"
    enabled: v.boolean(),
    // Runtime params to pass to job
    params: v.optional(v.any()),
    // How to handle missed executions
    missedPolicy: v.union(
      v.literal("catchup"),  // Run all missed
      v.literal("skip"),     // Skip missed, continue normally
      v.literal("last")      // Run only the most recent missed
    ),
    lastRunAt: v.optional(v.number()),
    lastRunStatus: v.optional(v.union(
      v.literal("completed"),
      v.literal("failed")
    )),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_enabled", ["enabled"])
    .index("by_next_run", ["nextRunAt"])
    .index("by_job", ["jobId"]),

  /**
   * Repo bookmarks - folder-organized GitHub repo bookmarks
   */
  repoBookmarks: defineTable({
    folder: v.string(),        // Folder name (e.g., "Relias", "Home")
    owner: v.string(),         // GitHub org or user (e.g., "relias-engineering")
    repo: v.string(),          // Repo name (e.g., "ai-skills")
    url: v.string(),           // Full URL to the repo
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_folder", ["folder"])
    .index("by_owner_repo", ["owner", "repo"]),

  /**
   * Buddy stats - centralized usage statistics (singleton, keyed "default")
   * Stored in Convex (not electron-store) for multi-client aggregation
   * (desktop, mobile, web all share the same stats)
   */
  buddyStats: defineTable({
    key: v.literal("default"),

    // Lifetime counters
    appLaunches: v.number(),
    tabsOpened: v.number(),
    prsViewed: v.number(),
    prsReviewed: v.number(),
    prsMergedWatched: v.number(),
    reposBrowsed: v.number(),
    repoDetailViews: v.number(),
    jobsCreated: v.number(),
    runsTriggered: v.number(),
    runsCompleted: v.number(),
    runsFailed: v.number(),
    schedulesCreated: v.number(),
    bookmarksCreated: v.number(),
    settingsChanged: v.number(),
    searchesPerformed: v.number(),

    // Time tracking
    firstLaunchDate: v.number(),       // Epoch ms — set once on first launch
    totalUptimeMs: v.number(),         // Cumulative session time
    lastSessionStart: v.optional(v.number()), // Epoch ms — current session start

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"]),

  /**
   * Copilot SDK results - captured output from Copilot SDK prompts
   * Generic: supports PR reviews, code analysis, or any free-text prompt.
   */
  copilotResults: defineTable({
    prompt: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    result: v.optional(v.string()),      // Markdown output from Copilot
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    category: v.optional(v.string()),    // "pr-review", "general", etc.
    metadata: v.optional(v.any()),       // { prUrl, owner, repo, prNumber } for PR reviews
    duration: v.optional(v.number()),    // milliseconds
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_created", ["createdAt"]),

  /**
   * Runs - execution history for jobs
   */
  runs: defineTable({
    jobId: v.id("jobs"),
    scheduleId: v.optional(v.id("schedules")),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    triggeredBy: v.union(
      v.literal("manual"),
      v.literal("schedule"),
      v.literal("api")
    ),
    // Input provided for this run
    input: v.optional(v.any()),
    // Output from the worker
    output: v.optional(v.any()),
    // For large outputs, store in Convex File Storage
    outputFileId: v.optional(v.id("_storage")),
    // Error message if failed
    error: v.optional(v.string()),
    // Timing
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    duration: v.optional(v.number()), // milliseconds
  })
    .index("by_job", ["jobId"])
    .index("by_schedule", ["scheduleId"])
    .index("by_status", ["status"])
    .index("by_started", ["startedAt"]),
});
