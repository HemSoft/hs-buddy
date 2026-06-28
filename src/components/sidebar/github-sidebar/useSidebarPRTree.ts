import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import { GitHubClient } from '../../../api/github/client'
import { dataCache } from '../../../services/dataCache'
import { parseOwnerRepoFromUrl } from '../../../utils/githubUrl'
import { isAbortError, throwIfAborted } from '../../../utils/errorUtils'
import { dispatchPRReviewOpen } from '../../../utils/prReviewEvents'
import type { PullRequest } from '../../../types/pullRequest'
import type { GitHubAccount } from '../../../types/config'
import { useNewPRIndicator } from '../../../hooks/useNewPRIndicator'
import { useToggleSet } from '../../../hooks/useToggleSet'
import { useEscapeToClose } from '../../../hooks/useEscapeToClose'
import type { SidebarItem } from './types'

const PR_TREE_CACHE_KEYS: Record<string, string> = {
  'pr-my-prs': 'my-prs',
  'pr-needs-review': 'needs-review',
  'pr-need-a-nudge': 'need-a-nudge',
  'pr-recently-merged': 'recently-merged',
}

function initPrTreeData(): Record<string, PullRequest[]> {
  const result: Record<string, PullRequest[]> = {}
  for (const [key, cacheKey] of Object.entries(PR_TREE_CACHE_KEYS)) {
    result[key] = dataCache.get<PullRequest[]>(cacheKey)?.data || []
  }
  return result
}

function isSamePR(a: PullRequest, b: PullRequest): boolean {
  return prIdentity(a) === prIdentity(b)
}

function prIdentity(pr: PullRequest): string {
  return [pr.source, pr.org ?? '', pr.repository, pr.id].join('|')
}

/** Resolve owner/repo for a PR using direct fields or URL parsing fallback. */
/* v8 ignore start */
function resolvePROwnerRepo(pr: PullRequest): { owner: string; repo: string } | null {
  const parsed = parseOwnerRepoFromUrl(pr.url)
  return toOwnerRepo(pr.org || parsed?.owner, pr.repository || parsed?.repo)
}
/* v8 ignore stop */

function toOwnerRepo(owner: string | undefined, repo: string | undefined) {
  if (!owner || !repo) return null
  return { owner, repo }
}

interface UseSidebarPRTreeOptions {
  accounts: GitHubAccount[]
  enqueueRef: React.MutableRefObject<
    (
      fn: (signal?: AbortSignal) => Promise<unknown>,
      meta: { name: string; priority?: number }
    ) => Promise<unknown>
  >
}

export function useSidebarPRTree({ accounts, enqueueRef }: UseSidebarPRTreeOptions) {
  const prGroups = useToggleSet()
  const prNodes = useToggleSet()
  const [prTreeData, setPrTreeData] = useState<Record<string, PullRequest[]>>(initPrTreeData)
  const [prContextMenu, setPrContextMenu] = useState<{
    x: number
    y: number
    pr: PullRequest
  } | null>(null)
  const [approvingPrKeys, setApprovingPrKeys] = useState<Set<string>>(new Set())

  const prItems: SidebarItem[] = [
    { id: 'pr-my-prs', label: 'My PRs' },
    { id: 'pr-needs-review', label: 'Needs Review' },
    { id: 'pr-need-a-nudge', label: 'Needs a nudge' },
    { id: 'pr-recently-merged', label: 'Recently Merged' },
  ]

  const {
    newCounts: newPRCounts,
    newUrls: newPRUrls,
    markAsSeen: markPRsAsSeen,
  } = useNewPRIndicator()

  // Subscribe to PR tree cache updates
  useEffect(() => {
    const viewIdByCacheKey: Record<string, string> = {
      'my-prs': 'pr-my-prs',
      'needs-review': 'pr-needs-review',
      'need-a-nudge': 'pr-need-a-nudge',
      'recently-merged': 'pr-recently-merged',
    }
    const unsubscribe = dataCache.subscribe(key => {
      const viewId = viewIdByCacheKey[key]
      /* v8 ignore start */
      if (!viewId) return
      /* v8 ignore stop */
      /* v8 ignore start */
      const data = dataCache.get<PullRequest[]>(key)?.data || []
      /* v8 ignore stop */
      setPrTreeData(prev => ({ ...prev, [viewId]: data }))
    })
    return unsubscribe
  }, [])

  const openPRReview = (pr: PullRequest) => {
    dispatchPRReviewOpen({
      prUrl: pr.url,
      prTitle: pr.title,
      prNumber: pr.id,
      repo: pr.repository,
      /* v8 ignore start */
      org: pr.org || '',
      /* v8 ignore stop */
      author: pr.author,
    })
  }

  const openTreePRContextMenu = (e: React.MouseEvent, pr: PullRequest) => {
    e.preventDefault()
    setPrContextMenu({ x: e.clientX, y: e.clientY, pr })
  }

  const closePrContextMenu = useCallback(() => setPrContextMenu(null), [])
  useEscapeToClose(!!prContextMenu, closePrContextMenu)

  const copyToClipboard = async (text: string) => {
    /* v8 ignore start */
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch (error: unknown) {
        console.warn(
          'Clipboard API writeText failed, falling back to deprecated execCommand("copy")',
          error
        )
      }
    } else {
      console.warn('Clipboard API unavailable, falling back to deprecated execCommand("copy")')
    }
    /* v8 ignore stop */
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
    } catch (_: unknown) {
      /* v8 ignore next */
      console.warn('execCommand("copy") failed')
    }
    document.body.removeChild(textArea)
  }

  const applyApproveToTree = useCallback((target: PullRequest) => {
    setPrTreeData(prev => {
      const next: Record<string, PullRequest[]> = { ...prev }
      for (const [groupId, items] of Object.entries(prev) as Array<[string, PullRequest[]]>) {
        next[groupId] = items.map(item => {
          if (!isSamePR(item, target) || item.iApproved) return item
          return { ...item, iApproved: true, approvalCount: item.approvalCount + 1 }
        })
      }
      return next
    })
  }, [])

  const handleApprovePR = useCallback(
    async (pr: PullRequest) => {
      if (pr.iApproved) return
      const resolved = resolvePROwnerRepo(pr)
      /* v8 ignore start */
      if (!resolved) return
      /* v8 ignore stop */
      const prKey = prIdentity(pr)
      if (approvingPrKeys.has(prKey)) return
      await approveSidebarPR(pr, resolved, prKey, accounts, enqueueRef, setApprovingPrKeys, () =>
        applyApproveToTree(pr)
      )
    },
    [accounts, approvingPrKeys, applyApproveToTree, enqueueRef]
  )

  return {
    prContextMenu,
    setPrContextMenu,
    approvingPrKeys,
    prItems,
    prTreeData,
    expandedPrGroups: prGroups.set,
    expandedPRNodes: prNodes.set,
    togglePRGroup: prGroups.toggle,
    togglePRNode: prNodes.toggle,
    newPRCounts,
    newPRUrls,
    markPRsAsSeen,
    openTreePRContextMenu,
    handleApprovePR,
    copyToClipboard,
    openPRReview,
  }
}

async function approveSidebarPR(
  pr: PullRequest,
  resolved: { owner: string; repo: string },
  prKey: string,
  accounts: GitHubAccount[],
  enqueueRef: UseSidebarPRTreeOptions['enqueueRef'],
  setApprovingPrKeys: Dispatch<SetStateAction<Set<string>>>,
  onApproved: () => void
): Promise<void> {
  setApprovingPrKeys(prev => new Set(prev).add(prKey))
  try {
    await enqueueApprovePR(pr, resolved, accounts, enqueueRef)
    onApproved()
  } catch (error: unknown) {
    handleApproveError(error)
  } finally {
    setApprovingPrKeys(prev => removeApprovingPRKey(prev, prKey))
  }
}

async function enqueueApprovePR(
  pr: PullRequest,
  { owner, repo }: { owner: string; repo: string },
  accounts: GitHubAccount[],
  enqueueRef: UseSidebarPRTreeOptions['enqueueRef']
): Promise<void> {
  await enqueueRef.current(
    async signal => {
      /* v8 ignore next */
      if (signal) throwIfAborted(signal)
      const client = new GitHubClient({ accounts }, 7)
      await client.approvePullRequest(owner, repo, pr.id)
    },
    { name: `approve-sidebar-pr-${owner}-${repo}-${pr.id}` }
  )
}

function handleApproveError(error: unknown): void {
  /* v8 ignore start */
  if (isAbortError(error)) return
  /* v8 ignore stop */
  console.error('Failed to approve PR from sidebar:', error)
}

function removeApprovingPRKey(keys: Set<string>, prKey: string): Set<string> {
  const next = new Set(keys)
  next.delete(prKey)
  return next
}
