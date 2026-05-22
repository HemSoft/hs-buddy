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

function normalizeOrg(pr: PullRequest): string {
  return pr.org ?? ''
}

function isPRMatch(item: PullRequest, target: PullRequest): boolean {
  return (
    item.id === target.id &&
    item.repository === target.repository &&
    normalizeOrg(item) === normalizeOrg(target) &&
    item.source === target.source
  )
}

function buildPRKey(pr: PullRequest): string {
  return `${pr.source}-${normalizeOrg(pr)}-${pr.repository}-${pr.id}`
}

function shouldApprove(item: PullRequest, target: PullRequest): boolean {
  return isPRMatch(item, target) && !item.iApproved
}

function initPrTreeData(): Record<string, PullRequest[]> {
  const result: Record<string, PullRequest[]> = {}
  for (const [key, cacheKey] of Object.entries(PR_TREE_CACHE_KEYS)) {
    result[key] = dataCache.get<PullRequest[]>(cacheKey)?.data || []
  }
  return result
}

function resolveOwner(
  pr: PullRequest,
  parsed: { owner: string; repo: string } | null
): string | undefined {
  return pr.org || parsed?.owner
}

function resolveRepo(
  pr: PullRequest,
  parsed: { owner: string; repo: string } | null
): string | undefined {
  return pr.repository || parsed?.repo
}

/** Resolve owner/repo for a PR using direct fields or URL parsing fallback. */
/* v8 ignore start */
function resolvePROwnerRepo(pr: PullRequest): { owner: string; repo: string } | null {
  const parsed = parseOwnerRepoFromUrl(pr.url)
  const owner = resolveOwner(pr, parsed)
  const repo = resolveRepo(pr, parsed)
  if (!owner || !repo) return null
  return { owner, repo }
}
/* v8 ignore stop */

type ApprovalRequest = {
  owner: string
  repo: string
  prKey: string
}

function resolveApprovalRequest(
  pr: PullRequest,
  approvingPrKeys: ReadonlySet<string>
): ApprovalRequest | null {
  if (pr.iApproved) return null
  const resolved = resolvePROwnerRepo(pr)
  if (!resolved) return null
  const prKey = buildPRKey(pr)
  if (approvingPrKeys.has(prKey)) return null
  return { ...resolved, prKey }
}

async function approveSidebarPR(
  accounts: GitHubAccount[],
  enqueue: UseSidebarPRTreeOptions['enqueueRef']['current'],
  request: ApprovalRequest,
  prId: number
): Promise<void> {
  await enqueue(
    async signal => {
      /* v8 ignore next */
      if (signal) throwIfAborted(signal)
      const client = new GitHubClient({ accounts }, 7)
      await client.approvePullRequest(request.owner, request.repo, prId)
    },
    { name: `approve-sidebar-pr-${request.owner}-${request.repo}-${prId}` }
  )
}

function clearApprovingPRKey(
  setApprovingPrKeys: React.Dispatch<React.SetStateAction<Set<string>>>,
  prKey: string
): void {
  setApprovingPrKeys(prev => {
    const next = new Set(prev)
    next.delete(prKey)
    return next
  })
}

function handleApprovePRError(error: unknown): void {
  /* v8 ignore start */
  if (isAbortError(error)) return
  /* v8 ignore stop */
  console.error('Failed to approve PR from sidebar:', error)
}

const PR_ITEMS: SidebarItem[] = [
  { id: 'pr-my-prs', label: 'My PRs' },
  { id: 'pr-needs-review', label: 'Needs Review' },
  { id: 'pr-need-a-nudge', label: 'Needs a nudge' },
  { id: 'pr-recently-merged', label: 'Recently Merged' },
]

function openPRReviewFromSidebar(pr: PullRequest): void {
  dispatchPRReviewOpen({
    prUrl: pr.url, prTitle: pr.title, prNumber: pr.id,
    repo: pr.repository, org: pr.org || '', author: pr.author,
  })
}

async function copyToClipboardFn(text: string): Promise<void> {
  /* v8 ignore start */
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return } catch (error: unknown) {
      console.warn('Clipboard API writeText failed, falling back to deprecated execCommand("copy")', error)
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
  try { document.execCommand('copy') } catch (_: unknown) {
    /* v8 ignore next */
    console.warn('execCommand("copy") failed')
  }
  document.body.removeChild(textArea)
}

const VIEW_ID_BY_CACHE_KEY: Record<string, string> = {
  'my-prs': 'pr-my-prs',
  'needs-review': 'pr-needs-review',
  'need-a-nudge': 'pr-need-a-nudge',
  'recently-merged': 'pr-recently-merged',
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
  const [prContextMenu, setPrContextMenu] = useState<{ x: number; y: number; pr: PullRequest } | null>(null)
  const [approvingPrKeys, setApprovingPrKeys] = useState<Set<string>>(new Set())
  const { newCounts: newPRCounts, newUrls: newPRUrls, markAsSeen: markPRsAsSeen } = useNewPRIndicator()

  useEffect(() => {
    const unsubscribe = dataCache.subscribe(key => {
      const viewId = VIEW_ID_BY_CACHE_KEY[key]
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

  const openTreePRContextMenu = (e: React.MouseEvent, pr: PullRequest) => { e.preventDefault(); setPrContextMenu({ x: e.clientX, y: e.clientY, pr }) }
  const closePrContextMenu = useCallback(() => setPrContextMenu(null), [])
  useEscapeToClose(!!prContextMenu, closePrContextMenu)

  const applyApproveToTree = useCallback((target: PullRequest) => {
    setPrTreeData(prev => {
      const next: Record<string, PullRequest[]> = { ...prev }
      for (const [groupId, items] of Object.entries(prev) as Array<[string, PullRequest[]]>) {
        next[groupId] = items.map(item => shouldApprove(item, target) ? { ...item, iApproved: true, approvalCount: item.approvalCount + 1 } : item)
      }
      return next
    })
  }, [])

  const handleApprovePR = useCallback(async (pr: PullRequest) => {
    const request = resolveApprovalRequest(pr, approvingPrKeys)
    if (!request) return
    setApprovingPrKeys(prev => new Set(prev).add(request.prKey))
    try {
      await approveSidebarPR(accounts, enqueueRef.current, request, pr.id)
      applyApproveToTree(pr)
    } catch (error: unknown) { handleApprovePRError(error) } finally { clearApprovingPRKey(setApprovingPrKeys, request.prKey) }
  }, [accounts, approvingPrKeys, applyApproveToTree, enqueueRef])

  return {
    prContextMenu, setPrContextMenu, approvingPrKeys, prItems: PR_ITEMS, prTreeData,
    expandedPrGroups: prGroups.set, expandedPRNodes: prNodes.set,
    togglePRGroup: prGroups.toggle, togglePRNode: prNodes.toggle,
    newPRCounts, newPRUrls, markPRsAsSeen, openTreePRContextMenu, handleApprovePR,
    copyToClipboard: copyToClipboardFn, openPRReview: openPRReviewFromSidebar,
  }
}
