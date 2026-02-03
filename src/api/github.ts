import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import type { PullRequest, PRConfig } from '../types/pullRequest';

// Create Octokit with retry and throttling plugins
const OctokitWithPlugins = Octokit.plugin(retry, throttling);

// Module-level caches (persist across GitHubClient instances)
const tokenCache: Map<string, string> = new Map();
const orgAvatarCache: Map<string, string | null> = new Map(); // null = tried and failed

// Progress callback type
export type ProgressCallback = (progress: {
  currentAccount: number;
  totalAccounts: number;
  accountName: string;
  org: string;
  status: 'authenticating' | 'fetching' | 'done' | 'error';
  prsFound?: number;
  error?: string;
}) => void;

export class GitHubClient {
  private config: PRConfig['github'];
  private recentlyMergedDays: number = 7;

  constructor(config: PRConfig['github'], recentlyMergedDays: number = 7) {
    this.config = config;
    this.recentlyMergedDays = recentlyMergedDays;
  }

  /**
   * Get GitHub CLI authentication token for a specific account
   * Uses 'gh auth token --user <username>' to get account-specific tokens
   */
  private async getGitHubCLIToken(username: string): Promise<string | null> {
    // Check module-level cache first (persists across instances)
    const cached = tokenCache.get(username);
    if (cached) {
      return cached;
    }

    try {
      // Use window.ipcRenderer to invoke a main process handler that runs 'gh auth token --user <username>'
      const token = await window.ipcRenderer.invoke('github:get-cli-token', username);
      if (token && typeof token === 'string' && token.trim().length > 0) {
        const trimmedToken = token.trim();
        tokenCache.set(username, trimmedToken);
        return trimmedToken;
      }
      console.warn(`⚠️  GitHub CLI token is empty or invalid for account '${username}'`);
      return null;
    } catch (error) {
      console.error(`Failed to get GitHub CLI token for '${username}':`, error);
      return null;
    }
  }

  /**
   * Get Octokit instance with retry and throttling for a specific account
   * Uses GitHub CLI authentication with per-account tokens
   */
  private async getOctokit(username: string): Promise<Octokit | null> {
    const token = await this.getGitHubCLIToken(username);
    
    if (!token) {
      console.warn(`⚠️  GitHub CLI authentication not available for '${username}'. Run: gh auth login`);
      return null;
    }

    return new OctokitWithPlugins({
      auth: token,
      throttle: {
        onRateLimit: (retryAfter, options, _octokit, retryCount) => {
          console.warn(`Rate limit hit for ${options.method} ${options.url}`);
          if (retryCount < 3) {
            console.info(`Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/3)`);
            return true;
          }
          return false;
        },
        onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
          console.warn(`Secondary rate limit hit for ${options.method} ${options.url}`);
          if (retryCount < 2) {
            console.info(`Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/2)`);
            return true;
          }
          return false;
        },
      },
      retry: {
        doNotRetry: ['429'],
        retries: 3,
      },
    });
  }

  /**
   * Fetch all PRs (default mode: all PRs I'm involved with)
   */
  async fetchMyPRs(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return this.fetchPRs('my-prs', onProgress);
  }

  /**
   * Fetch PRs needing review (where I haven't approved yet)
   */
  async fetchNeedsReview(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return this.fetchPRs('needs-review', onProgress);
  }

  /**
   * Fetch recently merged PRs
   */
  async fetchRecentlyMerged(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return this.fetchPRs('recently-merged', onProgress);
  }

  /**
   * Core fetch method with mode support
   */
  private async fetchPRs(
    mode: 'my-prs' | 'needs-review' | 'recently-merged',
    onProgress?: ProgressCallback
  ): Promise<PullRequest[]> {
    const allPrs: PullRequest[] = [];
    let authenticationErrors = 0;
    const totalAccounts = this.config.accounts.length;

    // Process each configured GitHub account with its own token
    for (let i = 0; i < this.config.accounts.length; i++) {
      const account = this.config.accounts[i];
      const { username, org } = account;
      const currentAccount = i + 1;

      console.debug(`Checking GitHub account '${username}' for org '${org}' (mode: ${mode})...`);

      // Report authenticating progress
      onProgress?.({
        currentAccount,
        totalAccounts,
        accountName: username,
        org,
        status: 'authenticating',
      });

      // Get Octokit instance for this specific account
      const octokit = await this.getOctokit(username);
      if (!octokit) {
        console.warn(`⚠️  Skipping account '${username}' - no GitHub CLI authentication found`);
        onProgress?.({
          currentAccount,
          totalAccounts,
          accountName: username,
          org,
          status: 'error',
          error: 'No GitHub CLI authentication found',
        });
        authenticationErrors++;
        continue;
      }

      // Report fetching progress
      onProgress?.({
        currentAccount,
        totalAccounts,
        accountName: username,
        org,
        status: 'fetching',
      });

      try {
        const prs = await this.fetchPRsForAccount(octokit, org, username, mode);
        allPrs.push(...prs);

        console.debug(`✓ Found ${prs.length} PRs for ${username} in ${org}`);
        
        // Report done progress
        onProgress?.({
          currentAccount,
          totalAccounts,
          accountName: username,
          org,
          status: 'done',
          prsFound: prs.length,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Only warn for non-404 errors (404s likely mean no access or org doesn't exist)
        if (!errorMsg.includes('404')) {
          console.warn(`⚠️  Error fetching PRs for ${username} in ${org}:`, errorMsg);
        } else {
          console.debug(`ℹ️  No access or org not found for ${username} in ${org}`);
        }
        onProgress?.({
          currentAccount,
          totalAccounts,
          accountName: username,
          org,
          status: 'error',
          error: errorMsg,
        });
        continue;
      }
    }

    // If all accounts failed due to auth, throw error
    if (authenticationErrors === this.config.accounts.length) {
      throw new Error('GitHub CLI authentication not available for any configured account. Please run: gh auth login');
    }

    // Sort recently-merged PRs by merge date (newest first) after combining all accounts
    if (mode === 'recently-merged') {
      allPrs.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA; // Descending (newest first)
      });
    }

    return allPrs;
  }

  /**
   * Fetch PRs for a specific account and org using Octokit
   */
  private async fetchPRsForAccount(
    octokit: Octokit,
    org: string,
    username: string,
    mode: 'my-prs' | 'needs-review' | 'recently-merged' = 'my-prs'
  ): Promise<PullRequest[]> {
    const seenUrls = new Set<string>();
    const allPrs: PullRequest[] = [];

    // Fetch org avatar (cached at module level to persist across instances)
    let orgAvatarUrl: string | undefined | null;
    if (!orgAvatarCache.has(org)) {
      try {
        const orgData = await octokit.orgs.get({ org });
        orgAvatarUrl = orgData.data.avatar_url;
        orgAvatarCache.set(org, orgAvatarUrl);
      } catch {
        // Might be a user, not an org - try users endpoint
        try {
          const userData = await octokit.users.getByUsername({ username: org });
          orgAvatarUrl = userData.data.avatar_url;
          orgAvatarCache.set(org, orgAvatarUrl);
        } catch {
          console.debug(`Could not fetch avatar for ${org}`);
          orgAvatarCache.set(org, null); // Cache the failure to avoid retrying
        }
      }
    } else {
      orgAvatarUrl = orgAvatarCache.get(org);
    }

    // Different queries based on mode
    let queries: string[];
    
    switch (mode) {
      case 'needs-review':
        // PRs where review is requested from me OR I'm assigned but haven't approved
        queries = [
          `is:pr review-requested:${username} is:open org:${org}`,
          `is:pr assignee:${username} is:open org:${org} -author:${username}`,
        ];
        break;
      case 'recently-merged': {
        // PRs I authored or reviewed that were recently merged (within configured days)
        const mergedAfterDate = new Date();
        mergedAfterDate.setDate(mergedAfterDate.getDate() - this.recentlyMergedDays);
        const mergedAfter = mergedAfterDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        queries = [
          `is:pr author:${username} is:merged merged:>=${mergedAfter} org:${org}`,
          `is:pr reviewed-by:${username} is:merged merged:>=${mergedAfter} org:${org}`,
        ];
        break;
      }
      case 'my-prs':
      default:
        // PRs I authored that are not merged
        queries = [
          `is:pr author:${username} is:open org:${org}`,
        ];
        break;
    }

    // Execute each search query
    for (const query of queries) {
      try {
        const searchResults = await octokit.search.issuesAndPullRequests({
          q: query,
          per_page: 100,
          sort: 'updated',
          order: 'desc',
        });

        console.debug(`Search found ${searchResults.data.items.length} results for: ${query}`);

        for (const item of searchResults.data.items) {
          if (seenUrls.has(item.html_url)) {
            continue;
          }
          seenUrls.add(item.html_url);

          // Parse owner/repo from URL
          const urlMatch = item.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull/);
          if (!urlMatch || !urlMatch[1] || !urlMatch[2]) {
            console.debug(`Invalid PR URL format: ${item.html_url}`);
            continue;
          }

          const owner: string = urlMatch[1];
          const repo: string = urlMatch[2];

          // Build PR from search result (most data already available)
          allPrs.push({
            source: 'GitHub' as const,
            repository: repo,
            id: item.number,
            title: item.title,
            author: item.user?.login || 'unknown',
            authorAvatarUrl: item.user?.avatar_url,
            url: item.html_url,
            state: item.state,
            approvalCount: 0, // Will be filled in batch
            assigneeCount: item.assignees?.length || 0,
            iApproved: false, // Will be filled in batch
            created: item.created_at ? new Date(item.created_at) : null,
            date: item.closed_at || null, // For merged PRs, closed_at is the merge date
            orgAvatarUrl,
            org,
            // Store metadata for batch processing
            _owner: owner,
            _repo: repo,
            _prNumber: item.number,
          } as PullRequest & { _owner: string; _repo: string; _prNumber: number });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Suppress 404 errors (org doesn't exist or no access)
        if (!errorMsg.includes('404')) {
          console.warn(`Search query failed: ${query}`, error);
        } else {
          console.debug(`No search results (404) for: ${query}`);
        }
      }
    }

    // Batch fetch reviews in parallel (with concurrency limit)
    const BATCH_SIZE = 10;
    const prsWithMeta = allPrs as (PullRequest & { _owner: string; _repo: string; _prNumber: number })[];
    
    for (let i = 0; i < prsWithMeta.length; i += BATCH_SIZE) {
      const batch = prsWithMeta.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (pr) => {
        try {
          const reviewsData = await octokit.pulls.listReviews({
            owner: pr._owner,
            repo: pr._repo,
            pull_number: pr._prNumber,
          });

          const reviews = reviewsData.data;
          let approvalCount = 0;
          let iApproved = false;

          if (reviews.length > 0) {
            const reviewerGroups = new Map<string, typeof reviews>();

            for (const review of reviews) {
              const login = review.user?.login;
              if (!login) continue;
              if (!reviewerGroups.has(login)) {
                reviewerGroups.set(login, []);
              }
              reviewerGroups.get(login)?.push(review);
            }

            for (const [login, userReviews] of reviewerGroups) {
              const latestReview = userReviews.sort((a, b) => {
                const aTime = a.submitted_at || '';
                const bTime = b.submitted_at || '';
                return bTime.localeCompare(aTime);
              })[0];

              if (latestReview?.state === 'APPROVED') {
                approvalCount++;
                if (login === username) {
                  iApproved = true;
                }
              }
            }
          }

          pr.approvalCount = approvalCount;
          pr.iApproved = iApproved;
        } catch (error) {
          console.debug(`Failed to get reviews for PR #${pr._prNumber}:`, error);
        }
      }));
    }

    // Clean up metadata and filter
    const finalPrs = allPrs.map(pr => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _owner, _repo, _prNumber, ...cleanPr } = pr as PullRequest & { _owner?: string; _repo?: string; _prNumber?: number };
      return cleanPr;
    }).filter(pr => {
      // For needs-review mode, filter out PRs the user has already approved
      if (mode === 'needs-review' && pr.iApproved) {
        return false;
      }
      return true;
    });

    return finalPrs;
  }
}
