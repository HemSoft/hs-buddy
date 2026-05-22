import { useState, useEffect, useCallback, useRef } from 'react'
import { useCopilotSettings, useGitHubAccounts } from '../../hooks/useConfig'
import { useBuddyStatsMutations } from '../../hooks/useConvex'
import { GitHubClient } from '../../api/github'
import { getErrorMessage } from '../../utils/errorUtils'
import { IPC_INVOKE } from '../../ipc/contracts'
import type { PRReviewInfo } from './PRReviewInfo'

const DEFAULT_PROMPT_TEMPLATE = (url: string) =>
  `Please do a thorough PR review on ${url}. Analyze the code changes for bugs, security issues, performance problems, and code quality. Categorize findings by severity: 🔴 Critical, 🟡 Medium, 🟢 Nitpick.`

const PR_URL_TOKEN = '{{prUrl}}'

type ReviewSnapshot =
  | { reviewedHeadSha: string | undefined; reviewedThreadStats: Record<string, number> }
  | undefined

/** Build the metadata object for a Copilot PR review execution. */
function buildReviewMetadata(
  prInfo: PRReviewInfo,
  account: string,
  snapshot: ReviewSnapshot,
  extra?: Record<string, unknown>
) {
  return {
    prUrl: prInfo.prUrl,
    prTitle: prInfo.prTitle,
    prNumber: prInfo.prNumber,
    repo: prInfo.repo,
    org: prInfo.org,
    author: prInfo.author,
    /* v8 ignore start */
    ghAccount: account || undefined,
    /* v8 ignore stop */
    reviewedHeadSha: snapshot?.reviewedHeadSha,
    reviewedThreadStats: snapshot?.reviewedThreadStats,
    ...extra,
  }
}

/** Handle the result of a Copilot review execution. */
function handleReviewResult(
  result: { success: boolean; resultId?: string | null; error?: string },
  setError: (msg: string) => void,
  onSubmitted?: (resultId: string) => void
) {
  if (result.success && result.resultId) {
    window.dispatchEvent(
      new CustomEvent('copilot:open-result', { detail: { resultId: result.resultId } })
    )
    onSubmitted?.(result.resultId)
  } else {
    setError(result.error ?? 'Failed to start PR review')
  }
}

const resolvePromptTemplate = (template: string, prUrl: string) =>
  template.includes(PR_URL_TOKEN) ? template.split(PR_URL_TOKEN).join(prUrl) : template

function canBuildReviewSnapshot(prInfo: PRReviewInfo): boolean {
  return Boolean(prInfo.org) && Boolean(prInfo.repo) && Boolean(prInfo.prNumber)
}

async function fetchReviewSnapshot(
  prInfo: PRReviewInfo,
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
): Promise<ReviewSnapshot> {
  if (!canBuildReviewSnapshot(prInfo)) {
    return undefined
  }

  try {
    const { org, repo, prNumber } = prInfo
    const client = new GitHubClient({ accounts }, 7)
    const [branches, history] = await Promise.all([
      client.fetchPRBranches(org, repo, prNumber),
      client.fetchPRHistory(org, repo, prNumber),
    ])
    const reviewedHeadSha = branches.headSha ? branches.headSha : undefined
    return {
      reviewedHeadSha,
      reviewedThreadStats: {
        total: history.threadsTotal,
        unresolved: history.threadsUnaddressed,
        outdated: history.threadsOutdated,
      },
    }
  } catch (_: unknown) {
    return undefined
  }
}

export function usePRReviewData(prInfo: PRReviewInfo, onSubmitted?: (resultId: string) => void) {
  const { model: configuredModel, ghAccount: configuredAccount } = useCopilotSettings()
  const { accounts: githubAccounts } = useGitHubAccounts()
  const { increment: incrementStat } = useBuddyStatsMutations()

  const [account, setAccount] = useState('')
  const [model, setModel] = useState(configuredModel || 'claude-sonnet-4.5')
  const [savedDefaultTemplate, setSavedDefaultTemplate] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)

  const getDefaultPrompt = useCallback(() => {
    if (prInfo.initialPrompt) return prInfo.initialPrompt
    if (savedDefaultTemplate.trim()) {
      return resolvePromptTemplate(savedDefaultTemplate, prInfo.prUrl)
    }
    return DEFAULT_PROMPT_TEMPLATE(prInfo.prUrl)
  }, [prInfo.initialPrompt, prInfo.prUrl, savedDefaultTemplate])

  const [prompt, setPrompt] = useState(() => getDefaultPrompt())
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState(false)
  const [scheduleDelay, setScheduleDelay] = useState(5)

  const initializedRef = useRef(false)
  const loadedDefaultRef = useRef(false)

  useEffect(() => {
    /* v8 ignore start */
    if (initializedRef.current) return
    /* v8 ignore stop */
    initializedRef.current = true
    const matchedAccount = githubAccounts.find(
      a => a.org.toLowerCase() === prInfo.org.toLowerCase()
    )
    if (matchedAccount) {
      setAccount(matchedAccount.username)
    } else if (configuredAccount) {
      setAccount(configuredAccount)
    }
    if (configuredModel) {
      setModel(configuredModel)
    }
  }, [githubAccounts, prInfo.org, configuredAccount, configuredModel])

  useEffect(() => {
    if (loadedDefaultRef.current || prInfo.initialPrompt) return
    loadedDefaultRef.current = true
    const fallbackPrompt = DEFAULT_PROMPT_TEMPLATE(prInfo.prUrl)
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_COPILOT_PR_REVIEW_PROMPT_TEMPLATE)
      .then((template: string) => {
        const normalized = (template || '').trim()
        if (!normalized) return
        setSavedDefaultTemplate(normalized)
        setPrompt(current => {
          if (current !== fallbackPrompt) return current
          return resolvePromptTemplate(normalized, prInfo.prUrl)
        })
      })
      /* v8 ignore start */
      .catch(() => {
        /* v8 ignore stop */
        // Non-blocking: use built-in default if config fetch fails
      })
  }, [prInfo.initialPrompt, prInfo.prUrl])

  const buildReviewSnapshot = useCallback(async () => {
    return fetchReviewSnapshot(prInfo, githubAccounts)
  }, [githubAccounts, prInfo])

  const handleRunNow = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      /* v8 ignore start */
      incrementStat({ field: 'copilotPrReviews' }).catch(() => {})
      /* v8 ignore stop */
      const snapshot = await buildReviewSnapshot()
      const result = await window.copilot.execute({
        prompt,
        category: 'pr-review',
        model,
        metadata: buildReviewMetadata(prInfo, account, snapshot),
      })
      handleReviewResult(result, setError, onSubmitted)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }, [prompt, model, account, prInfo, submitting, incrementStat, onSubmitted, buildReviewSnapshot])

  const handleSchedule = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const delayMs = scheduleDelay * 60 * 1000
      const snapshot = await buildReviewSnapshot()
      setTimeout(async () => {
        try {
          /* v8 ignore start */
          incrementStat({ field: 'copilotPrReviews' }).catch(() => {})
          /* v8 ignore stop */
          const result = await window.copilot.execute({
            prompt,
            category: 'pr-review',
            model,
            metadata: buildReviewMetadata(prInfo, account, snapshot, {
              scheduledAt: Date.now(),
            }),
          })
          /* v8 ignore start */
          if (result.success && result.resultId) {
            /* v8 ignore stop */
            window.dispatchEvent(
              new CustomEvent('copilot:open-result', { detail: { resultId: result.resultId } })
            )
          }
        } catch (err: unknown) {
          console.error('Scheduled PR review failed:', err)
        }
      }, delayMs)
      setScheduled(true)
    } catch (err: unknown) {
      /* v8 ignore start */
      setError(getErrorMessage(err))
      /* v8 ignore stop */
    } finally {
      setSubmitting(false)
    }
  }, [
    prompt,
    model,
    account,
    prInfo,
    scheduleDelay,
    submitting,
    incrementStat,
    buildReviewSnapshot,
  ])

  const handleResetPrompt = useCallback(() => {
    setPrompt(getDefaultPrompt())
  }, [getDefaultPrompt])

  const handleSaveAsDefault = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || savingDefault) return
    setSavingDefault(true)
    setError(null)
    try {
      const template = trimmed.split(prInfo.prUrl).join(PR_URL_TOKEN)
      await window.ipcRenderer.invoke(
        IPC_INVOKE.CONFIG_SET_COPILOT_PR_REVIEW_PROMPT_TEMPLATE,
        template
      )
      setSavedDefaultTemplate(template)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSavingDefault(false)
    }
  }, [prompt, prInfo.prUrl, savingDefault])

  return {
    account,
    setAccount,
    model,
    setModel,
    prompt,
    setPrompt,
    promptExpanded,
    setPromptExpanded,
    submitting,
    error,
    scheduled,
    scheduleDelay,
    setScheduleDelay,
    savingDefault,
    handleRunNow,
    handleSchedule,
    handleResetPrompt,
    handleSaveAsDefault,
  }
}
