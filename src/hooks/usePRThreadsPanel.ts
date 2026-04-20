import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GitHubClient,
  type PRCommentReactionContent,
  type PRReviewComment,
  type PRThreadsResult,
} from '../api/github'
import { useGitHubAccounts } from './useConfig'
import { useLatestPRReviewRun } from './useConvex'
import { useTaskQueue } from './useTaskQueue'
import type { PRDetailInfo } from '../utils/prDetailView'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
import { applyReactionToResult } from '../utils/reactions'
import { getErrorMessage, isAbortError, throwIfAborted } from '../utils/errorUtils'

export function usePRThreadsPanel(pr: PRDetailInfo) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  const latestThreadsRequestRef = useRef(0)
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url), [pr.url])
  const owner = pr.org || ownerRepo?.owner
  const latestReview = useLatestPRReviewRun(owner, pr.repository, pr.id)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PRThreadsResult | null>(null)
  const [currentHeadSha, setCurrentHeadSha] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all')
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [showResolved, setShowResolved] = useState(true)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    if (!owner || !pr.repository || !pr.id) {
      setCurrentHeadSha(null)
      return
    }

    enqueueRef
      .current(
        /* v8 ignore start */
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRBranches(owner, pr.repository, pr.id)
          /* v8 ignore stop */
        },
        { name: `pr-head-${pr.repository}-${pr.id}` }
      )
      .then(result => setCurrentHeadSha(result.headSha || null))
      .catch(err => {
        /* v8 ignore start */
        if (isAbortError(err)) return
        /* v8 ignore stop */
        setCurrentHeadSha(null)
      })
  }, [accounts, owner, pr.repository, pr.id])

  const fetchThreads = useCallback(async () => {
    const requestId = latestThreadsRequestRef.current + 1
    latestThreadsRequestRef.current = requestId

    setLoading(true)
    setError(null)
    try {
      if (!ownerRepo) throw new Error('Could not parse owner/repo from PR URL')

      const result = await enqueueRef.current(
        /* v8 ignore start */
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRThreads(ownerRepo.owner, ownerRepo.repo, pr.id)
          /* v8 ignore stop */
        },
        { name: `pr-threads-${pr.repository}-${pr.id}` }
      )

      if (requestId !== latestThreadsRequestRef.current) {
        return
      }

      setData(result)
      /* v8 ignore start */
    } catch (err) {
      /* v8 ignore stop */
      /* v8 ignore start */
      if (isAbortError(err)) return
      /* v8 ignore stop */

      if (requestId !== latestThreadsRequestRef.current) {
        return
      }

      setError(getErrorMessage(err))
    } finally {
      if (requestId === latestThreadsRequestRef.current) {
        setLoading(false)
      }
    }
  }, [accounts, pr.id, pr.repository, ownerRepo])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  const handleReplyAdded = useCallback((threadId: string, comment: PRReviewComment) => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        threads: prev.threads.map(t =>
          t.id === threadId ? { ...t, comments: [...t.comments, comment] } : t
        ),
      }
    })
  }, [])

  const handleResolveToggled = useCallback((threadId: string, resolved: boolean) => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        threads: prev.threads.map(t => (t.id === threadId ? { ...t, isResolved: resolved } : t)),
      }
    })
  }, [])

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || sendingComment) return
    if (!ownerRepo) return

    setSendingComment(true)
    try {
      const newComment = await enqueueRef.current(
        /* v8 ignore start */
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          return await client.addPRComment(
            /* v8 ignore stop */
            ownerRepo.owner,
            ownerRepo.repo,
            pr.id,
            commentText.trim()
          )
        },
        { name: `add-comment-${pr.repository}-${pr.id}` }
      )
      setData(
        prev =>
          /* v8 ignore start */
          prev ? { ...prev, issueComments: [...prev.issueComments, newComment] } : prev
        /* v8 ignore stop */
      )
      setCommentText('')
    } catch (err) {
      console.error('Failed to add comment:', err)
    } finally {
      setSendingComment(false)
    }
  }, [commentText, sendingComment, ownerRepo, pr.id, pr.repository, accounts])

  const handleReactToComment = useCallback(
    async (commentId: string, content: PRCommentReactionContent) => {
      if (!ownerRepo) return

      try {
        await enqueueRef.current(
          /* v8 ignore start */
          async signal => {
            throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            await client.addCommentReaction(ownerRepo.owner, commentId, content)
            /* v8 ignore stop */
          },
          { name: `add-comment-reaction-${pr.repository}-${pr.id}-${commentId}-${content}` }
        )

        setData(prev => (prev ? applyReactionToResult(prev, commentId, content) : prev))
      } catch (err) {
        /* v8 ignore start */
        if (isAbortError(err)) return
        /* v8 ignore stop */
        console.error('Failed to add reaction:', err)
      }
    },
    [accounts, ownerRepo, pr.repository, pr.id]
  )

  const activeThreads = useMemo(
    () => data?.threads.filter(t => !t.isResolved) ?? [],
    [data?.threads]
  )
  const resolvedThreads = useMemo(
    () => data?.threads.filter(t => t.isResolved) ?? [],
    [data?.threads]
  )
  const outdatedThreads = useMemo(
    () => data?.threads.filter(t => t.isOutdated) ?? [],
    [data?.threads]
  )

  const threadSnapshotChanged = useMemo(
    () =>
      !!latestReview?.reviewedThreadStats &&
      (latestReview.reviewedThreadStats.unresolved !== activeThreads.length ||
        latestReview.reviewedThreadStats.outdated !== outdatedThreads.length),
    [latestReview?.reviewedThreadStats, activeThreads.length, outdatedThreads.length]
  )
  const needsRefresh = useMemo(
    () =>
      (!!latestReview?.reviewedHeadSha &&
        !!currentHeadSha &&
        latestReview.reviewedHeadSha !== currentHeadSha) ||
      threadSnapshotChanged,
    [latestReview?.reviewedHeadSha, currentHeadSha, threadSnapshotChanged]
  )

  const filteredThreads = useMemo(
    () =>
      data?.threads.filter(t => {
        if (filter === 'active') return !t.isResolved
        if (filter === 'resolved') return t.isResolved
        return true
      }) ?? [],
    [data?.threads, filter]
  )

  const openLatestReview = useCallback(() => {
    if (!latestReview) return
    window.dispatchEvent(
      new CustomEvent('copilot:open-result', { detail: { resultId: latestReview.resultId } })
    )
  }, [latestReview])

  const requestReReview = useCallback(() => {
    const prompt = latestReview?.reviewedHeadSha
      ? `Please re-review ${pr.url}. Focus only on commits after ${latestReview.reviewedHeadSha} and unresolved/outdated review conversations.`
      : `Please do a targeted re-review on ${pr.url}. Focus on newly pushed commits and unresolved review conversations.`

    window.dispatchEvent(
      new CustomEvent('pr-review:open', {
        detail: {
          prUrl: pr.url,
          prTitle: pr.title,
          prNumber: pr.id,
          repo: pr.repository,
          /* v8 ignore start */
          org: owner || '',
          /* v8 ignore stop */
          author: pr.author,
          initialPrompt: prompt,
        },
      })
    )
  }, [latestReview, pr.url, pr.title, pr.id, pr.repository, pr.author, owner])

  return {
    loading,
    error,
    data,
    filter,
    setFilter,
    showResolved,
    setShowResolved,
    commentText,
    setCommentText,
    sendingComment,
    latestReview,
    needsRefresh,
    activeThreads,
    resolvedThreads,
    filteredThreads,
    fetchThreads,
    handleReplyAdded,
    handleResolveToggled,
    handleAddComment,
    handleReactToComment,
    openLatestReview,
    requestReReview,
  }
}
