/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bitbucketWorkspaces from "../bitbucketWorkspaces.js";
import type * as buddyStats from "../buddyStats.js";
import type * as copilotResults from "../copilotResults.js";
import type * as crons from "../crons.js";
import type * as githubAccounts from "../githubAccounts.js";
import type * as jobs from "../jobs.js";
import type * as repoBookmarks from "../repoBookmarks.js";
import type * as runs from "../runs.js";
import type * as scheduleScanner from "../scheduleScanner.js";
import type * as schedules from "../schedules.js";
import type * as settings from "../settings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bitbucketWorkspaces: typeof bitbucketWorkspaces;
  buddyStats: typeof buddyStats;
  copilotResults: typeof copilotResults;
  crons: typeof crons;
  githubAccounts: typeof githubAccounts;
  jobs: typeof jobs;
  repoBookmarks: typeof repoBookmarks;
  runs: typeof runs;
  scheduleScanner: typeof scheduleScanner;
  schedules: typeof schedules;
  settings: typeof settings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
