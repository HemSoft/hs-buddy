import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import type { PullRequest, PRConfig } from '../types/pullRequest';

// Create Octokit with retry and throttling plugins
const OctokitWithPlugins = Octokit.plugin(retry, throttling);

export class GitHubClient {
  private config: PRConfig['github'];
  private ghToken: string | null = null;
  private recentlyMergedDays: number = 7;

  constructor(config: PRConfig['github'], recentlyMergedDays: number = 7) {
    this.config = config;
    this.recentlyMergedDays = recentlyMergedDays;
  }

  /**
   * Get GitHub CLI authentication token
   * Uses 'gh auth token' command which retrieves the token from system keychain
   */
  private async getGitHubCLIToken(): Promise<string | null> {
    // Cache the token for the session
    if (this.ghToken) {
      return this.ghToken;
    }

    try {
      // Use window.ipcRenderer to invoke a main process handler that runs 'gh auth token'
      const token = await window.ipcRenderer.invoke('github:get-cli-token');
      if (token && typeof token === 'string' && token.trim().length > 0) {
        this.ghToken = token.trim();
        return this.ghToken;
      }
      console.warn('⚠️  GitHub CLI token is empty or invalid');
      return null;
    } catch (error) {
      console.error('Failed to get GitHub CLI token:', error);
      return null;
    }
  }

  /**
   * Get Octokit instance with retry and throttling
   * Uses GitHub CLI authentication
   */
  private async getOctokit(): Promise<Octokit | null> {
    const token = await this.getGitHubCLIToken();
    
    if (!token) {
      console.warn('⚠️  GitHub CLI authentication not available. Run: gh auth login');
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
  async fetchMyPRs(): Promise<PullRequest[]> {
    return this.fetchPRs('my-prs');
  }

  /**
   * Fetch PRs needing review (where I haven't approved yet)
   */
  async fetchNeedsReview(): Promise<PullRequest[]> {
    return this.fetchPRs('needs-review');
  }

  /**
   * Fetch recently merged PRs
   */
  async fetchRecentlyMerged(): Promise<PullRequest[]> {
    return this.fetchPRs('recently-merged');
  }

  /**
   * Core fetch method with mode support
   */
  private async fetchPRs(mode: 'my-prs' | 'needs-review' | 'recently-merged'): Promise<PullRequest[]> {
    const allPrs: PullRequest[] = [];

    // Get Octokit instance (shared across all accounts via GitHub CLI)
    const octokit = await this.getOctokit();
    if (!octokit) {
      throw new Error('GitHub CLI authentication not available. Please run: gh auth login');
    }

    // Process each configured GitHub account
    for (const account of this.config.accounts) {
      const { username, org } = account;

      console.debug(`Checking GitHub account '${username}' for org '${org}' (mode: ${mode})...`);

      try {
        const prs = await this.fetchPRsForAccount(octokit, org, username, mode);
        allPrs.push(...prs);

        console.debug(`✓ Found ${prs.length} PRs for ${username} in ${org}`);
      } catch (error) {
        console.warn(
          `⚠️  Error fetching PRs for ${username}:`,
          error instanceof Error ? error.message : error
        );
        continue;
      }
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
        // All PRs I'm involved with (open)
        queries = [
          `is:pr author:${username} is:open org:${org}`,
          `is:pr assignee:${username} is:open org:${org}`,
          `is:pr reviewed-by:${username} is:open org:${org}`,
          `is:pr review-requested:${username} is:open org:${org}`,
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
          const prNumber = item.number;

          try {
            const pr = await this.getPRDetails(octokit, owner, repo, prNumber, username, mode);
            if (pr) {
              // For needs-review mode, filter out PRs the user has already approved
              if (mode === 'needs-review' && pr.iApproved) {
                continue;
              }
              allPrs.push(pr);
            }
          } catch (error) {
            console.debug(`Failed to get details for PR #${prNumber}:`, error);
          }
        }
      } catch (error) {
        console.debug(`Search query failed: ${query}`, error);
      }
    }

    return allPrs;
  }

  /**
   * Get PR details including reviews and assignees
   */
  private async getPRDetails(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    currentUser: string,
    mode: 'my-prs' | 'needs-review' | 'recently-merged' = 'my-prs'
  ): Promise<PullRequest | null> {
    try {
      // Fetch PR data
      const prData = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const pr = prData.data;

      // For recently-merged, skip if not merged
      if (mode === 'recently-merged' && !pr.merged_at) {
        return null;
      }

      // Fetch reviews
      const reviewsData = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
      });

      const reviews = reviewsData.data;

      // Count unique approvals and check if current user approved
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
          // Get latest review from this user
          const latestReview = userReviews.sort((a, b) => {
            const aTime = a.submitted_at || '';
            const bTime = b.submitted_at || '';
            return bTime.localeCompare(aTime);
          })[0];

          if (latestReview?.state === 'APPROVED') {
            approvalCount++;
            if (login === currentUser) {
              iApproved = true;
            }
          }
        }
      }

      const assigneeCount = pr.assignees?.length || 0;

      return {
        source: 'GitHub' as const,
        repository: repo,
        id: pr.number,
        title: pr.title,
        author: pr.user?.login || 'unknown',
        url: pr.html_url,
        state: pr.state,
        approvalCount,
        assigneeCount,
        iApproved,
        created: pr.created_at ? new Date(pr.created_at) : null,
        date: pr.merged_at || null,
      };
    } catch (error) {
      console.debug(`Failed to get PR details for ${owner}/${repo}#${prNumber}:`, error);
      return null;
    }
  }
}
