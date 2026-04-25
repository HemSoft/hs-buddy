/**
 * Shared hook that extracts the repeated URL-parsing → useGitHubData → error-derivation
 * pattern found across PR sub-panels (PRChecksPanel, PRFilesChangedPanel, etc.).
 */

import { useMemo } from 'react'
import { useGitHubData } from './useGitHubData'
import type { GitHubClient } from '../api/github'
import type { PRDetailInfo } from '../utils/prDetailView'
import { parseOwnerRepoFromUrl, PR_URL_PARSE_ERROR } from '../utils/githubUrl'

interface UsePRPanelDataResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  owner: string | null
  repo: string | null
  cacheKey: string | null
}

function resolveOwnerRepo(parsed: ReturnType<typeof parseOwnerRepoFromUrl>) {
  return {
    owner: parsed?.owner ?? null,
    repo: parsed?.repo ?? null,
  }
}

export function usePRPanelData<T>(
  pr: PRDetailInfo,
  cachePrefix: string,
  fetchFn: (client: GitHubClient, owner: string, repo: string, prNumber: number) => Promise<T>
): UsePRPanelDataResult<T> {
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url), [pr.url])
  const { owner, repo } = resolveOwnerRepo(ownerRepo)
  const cacheKey = owner && repo ? `${cachePrefix}:${owner}/${repo}/${pr.id}` : null

  const result = useGitHubData<T>({
    cacheKey,
    taskName: `${cachePrefix}-${pr.repository}-${pr.id}`,
    fetchFn: client => fetchFn(client, owner!, repo!, pr.id),
  })

  return {
    ...result,
    error: !cacheKey ? PR_URL_PARSE_ERROR : result.error,
    owner,
    repo,
    cacheKey,
  }
}
