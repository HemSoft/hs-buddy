/**
 * Prefetch Hook
 * 
 * Runs once on app startup to proactively fetch data for pages that take time
 * to load (e.g., PR pages). Uses the existing task queue for concurrency control
 * and respects the configured refresh interval — only fetches stale data.
 * 
 * This makes navigating to PR pages feel near-instant because the data is
 * already in the dataCache by the time the user gets there.
 */

import { useEffect, useRef } from 'react';
import { useGitHubAccounts, usePRSettings } from './useConfig';
import { useTaskQueue } from './useTaskQueue';
import { GitHubClient } from '../api/github';
import { dataCache } from '../services/dataCache';
import type { PullRequest } from '../types/pullRequest';

const PR_MODES = ['my-prs', 'needs-review', 'recently-merged'] as const;

/**
 * Hook that prefetches all PR data in the background on app startup.
 * 
 * - Only runs once per app session (guards against React StrictMode re-runs)
 * - Uses low priority (-1) so user-initiated fetches always go first
 * - Re-checks freshness before executing (avoids double-fetch with PullRequestList)
 * - Silently catches errors — prefetch failures don't affect the user
 */
export function usePrefetch(): void {
  const { accounts, loading: accountsLoading } = useGitHubAccounts();
  const { refreshInterval, recentlyMergedDays, loading: settingsLoading } = usePRSettings();
  const { enqueue } = useTaskQueue('github');
  const prefetchedRef = useRef(false);

  // Stable refs to avoid re-triggering effects
  const enqueueRef = useRef(enqueue);
  useEffect(() => { enqueueRef.current = enqueue }, [enqueue]);

  useEffect(() => {
    // Wait for config to load
    if (accountsLoading || settingsLoading || accounts.length === 0) return;

    // Only prefetch once per app session
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;

    const intervalMs = refreshInterval * 60 * 1000;

    console.log('[Prefetch] Starting prefetch check...', {
      accounts: accounts.length,
      refreshInterval: `${refreshInterval}m`,
      cacheStats: dataCache.getStats(),
    });

    for (const mode of PR_MODES) {
      if (dataCache.isFresh(mode, intervalMs)) {
        console.log(`[Prefetch] ${mode}: still fresh, skipping`);
        continue;
      }

      const cachedEntry = dataCache.get(mode);
      console.log(
        `[Prefetch] ${mode}: ${cachedEntry ? 'stale' : 'no cached data'}, queueing background fetch`
      );

      // Queue the prefetch with low priority
      enqueueRef.current(
        async (signal) => {
          // Double-check freshness right before executing.
          // A concurrent PullRequestList fetch may have already updated the cache
          // while this task was waiting in the queue.
          if (dataCache.isFresh(mode, intervalMs)) {
            console.log(`[Prefetch] ${mode}: became fresh while queued, skipping`);
            return;
          }

          if (signal.aborted) {
            throw new DOMException('Prefetch cancelled', 'AbortError');
          }

          const config = { accounts };
          const client = new GitHubClient(config, recentlyMergedDays);

          let prs: PullRequest[];
          switch (mode) {
            case 'needs-review':
              prs = await client.fetchNeedsReview();
              break;
            case 'recently-merged':
              prs = await client.fetchRecentlyMerged();
              break;
            case 'my-prs':
            default:
              prs = await client.fetchMyPRs();
              break;
          }

          // Sort consistently with PullRequestList
          if (mode !== 'recently-merged') {
            prs.sort((a, b) => {
              if (a.repository !== b.repository) {
                return a.repository.localeCompare(b.repository);
              }
              return a.id - b.id;
            });
          }

          // Store in persistent cache
          dataCache.set(mode, prs);
          console.log(`[Prefetch] ${mode}: fetched ${prs.length} PRs`);
        },
        { name: `prefetch-${mode}`, priority: -1 }
      ).catch(err => {
        // Silently handle prefetch failures — they're non-critical
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn(`[Prefetch] ${mode} failed:`, err);
      });
    }
  }, [accounts, accountsLoading, settingsLoading, refreshInterval, recentlyMergedDays]);
}
