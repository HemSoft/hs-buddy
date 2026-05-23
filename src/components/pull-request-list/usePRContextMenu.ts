import { useState, useCallback } from 'react'
import type { PullRequest } from '../../types/pullRequest'
import type { GitHubAccount } from '../../types/config'
import type { Id } from '../../../convex/_generated/dataModel'
import { GitHubClient } from '../../api/github'
import { parseOwnerRepoFromUrl } from '../../utils/githubUrl'
import { buildAddressCommentsPrompt } from '../../utils/assistantPrompts'
import { throwIfAborted } from '../../utils/errorUtils'
import { dispatchPRReviewOpen } from '../../utils/prReviewEvents'

export interface UsePRContextMenuOptions {
  accounts: GitHubAccount[]
  bookmarks:
    | Array<{ _id: Id<'repoBookmarks'>; owner?: string | null; repo?: string | null }>
    | null
    | undefined
  bookmarkedRepoKeys: Set<string>
  recentlyMergedDays: number
  premiumModel: string
  createBookmark: (data: {
    folder: string
    owner: string
    repo: string
    url: string
    description: string
  }) => Promise<unknown>
  removeBookmark: (data: { id: Id<'repoBookmarks'> }) => Promise<unknown>
  enqueueRef: React.MutableRefObject<
    (fn: (signal: AbortSignal) => Promise<unknown>, meta: { name: string }) => Promise<unknown>
  >
}

export function usePRContextMenu(opts: UsePRContextMenuOptions) {
  const {
    accounts,
    bookmarks,
    bookmarkedRepoKeys,
    recentlyMergedDays,
    premiumModel,
    createBookmark,
    removeBookmark,
    enqueueRef,
  } = opts

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pr: PullRequest } | null>(
    null
  )

  const handleContextMenu = useCallback((e: React.MouseEvent, pr: PullRequest) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, pr })
  }, [])

  const handleBookmarkRepo = useCallback(async () => {
    if (!contextMenu) return
    const { pr } = contextMenu
    const org = pr.org || ''
    const repoName = pr.repository
    const key = `${org}/${repoName}`
    if (bookmarkedRepoKeys.has(key)) {
      /* v8 ignore start */
      const bookmark = (bookmarks ?? []).find(b => b.owner === org && b.repo === repoName)
      /* v8 ignore stop */
      /* v8 ignore start */
      if (bookmark) await removeBookmark({ id: bookmark._id })
      /* v8 ignore stop */
    } else {
      await createBookmark({
        folder: org,
        owner: org,
        repo: repoName,
        url: pr.url.replace(/\/pull\/\d+$/, ''),
        description: '',
      })
    }
    setContextMenu(null)
  }, [contextMenu, bookmarks, bookmarkedRepoKeys, createBookmark, removeBookmark])

  const handleAIReview = useCallback(async () => {
    if (!contextMenu) return
    const { pr } = contextMenu
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
    setContextMenu(null)
  }, [contextMenu])

  const handleRequestCopilotReview = useCallback(async () => {
    if (!contextMenu) return
    const { pr } = contextMenu
    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo) return
    try {
      await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, recentlyMergedDays)
          await client.requestCopilotReview(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `copilot-review-${pr.repository}-${pr.id}` }
      )
    } catch (err: unknown) {
      console.error('Failed to request Copilot review:', err)
    }
    setContextMenu(null)
  }, [contextMenu, accounts, recentlyMergedDays, enqueueRef])

  const handleAddressComments = useCallback(() => {
    if (!contextMenu) return
    const { pr } = contextMenu
    const org = pr.org || pr.source
    const prompt = buildAddressCommentsPrompt({
      prId: pr.id,
      org,
      repository: pr.repository,
      url: pr.url,
    })
    window.dispatchEvent(
      new CustomEvent('assistant:send-prompt', { detail: { prompt, model: premiumModel } })
    )
    setContextMenu(null)
  }, [contextMenu, premiumModel])

  const handleCopyLink = useCallback(async () => {
    if (!contextMenu) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(contextMenu.pr.url)
      }
    } catch (error: unknown) {
      console.error('Failed to copy PR link:', error)
    }
    setContextMenu(null)
  }, [contextMenu])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  return {
    contextMenu,
    handleContextMenu,
    handleBookmarkRepo,
    handleAIReview,
    handleRequestCopilotReview,
    handleAddressComments,
    handleCopyLink,
    closeContextMenu,
  }
}
