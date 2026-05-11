import { useState, useCallback, useEffect } from 'react'
import { GitHubClient } from '../../../api/github'
import { dataCache } from '../../../services/dataCache'
import { parseOwnerRepoFromUrl } from '../../../utils/githubUrl'
import { isAbortError, throwIfAborted } from '../../../utils/errorUtils'
import { dispatchPRReviewOpen } from '../../../utils/prReviewEvents'
import type { PullRequest } from '../../../types/pullRequest'
import type { GitHubAccount } from '../../../types/config'
import { useNewPRIndicator } from '../../../hooks/useNewPRIndicator'
import { useToggleSet } from '../../../hooks/useToggleSet'
import { useEscapeToClose } from '../../../hooks/useEscapeToClose'
import type { SidebarItem } from './useGitHubSidebarData'

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

/** Resolve owner/repo for a PR using direct fields or URL parsing fallback. */
/* v8 ignore start */
function resolvePROwnerRepo(pr: PullRequest): { owner: string; repo: string } | null {
  const parsed = parseOwnerRepoFromUrl(pr.url)
  const owner = pr.org || parsed?.owner
  const repo = pr.repository || parsed?.repo
  if (!owner || !repo) return null
  return { owner, repo }
}
/* v8 ignore stop */

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
  const [approvingPrKey, setApprovingPrKey] = useState<string | null>(null)

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
      /* v8 ignore stop */
      await navigator.clipboard.writeText(text)
      return
    }
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }

  const applyApproveToTree = useCallback((target: PullRequest) => {
    setPrTreeData(prev => {
      const next: Record<string, PullRequest[]> = { ...prev }
      for (const [groupId, items] of Object.entries(prev) as Array<[string, PullRequest[]]>) {
        next[groupId] = items.map(item => {
          if (
            item.id !== target.id ||
            item.repository !== target.repository ||
            (item.org ?? '') !== (target.org ?? '') ||
            item.source !== target.source ||
            item.iApproved
          )
            return item
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
      const { owner, repo } = resolved
      const prKey = `${pr.source}-${pr.org ?? ''}-${pr.repository}-${pr.id}`
      setApprovingPrKey(prKey)
      try {
        await enqueueRef.current(
          async signal => {
            /* v8 ignore next */
            if (signal) throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            await client.approvePullRequest(owner, repo, pr.id)
          },
          { name: `approve-sidebar-pr-${owner}-${repo}-${pr.id}` }
        )
        applyApproveToTree(pr)
      } catch (error: unknown) {
        /* v8 ignore start */
        if (isAbortError(error)) return
        /* v8 ignore stop */
        console.error('Failed to approve PR from sidebar:', error)
      } finally {
        setApprovingPrKey(null)
      }
    },
    [accounts, applyApproveToTree, enqueueRef]
  )

  return {
    prContextMenu,
    setPrContextMenu,
    approvingPrKey,
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
