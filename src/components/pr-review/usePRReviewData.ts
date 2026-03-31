import { useState, useEffect, useCallback, useRef } from 'react'
import { useCopilotSettings, useGitHubAccounts } from '../../hooks/useConfig'
import { useBuddyStatsMutations } from '../../hooks/useConvex'
import { GitHubClient } from '../../api/github'
import { getErrorMessage } from '../../utils/errorUtils'
import type { PRReviewInfo } from './PRReviewInfo'

const DEFAULT_PROMPT_TEMPLATE = (url: string) =>
  `Please do a thorough PR review on ${url}. Analyze the code changes for bugs, security issues, performance problems, and code quality. Categorize findings by severity: 🔴 Critical, 🟡 Medium, 🟢 Nitpick.`

const PR_URL_TOKEN = '{{prUrl}}'

const resolvePromptTemplate = (template: string, prUrl: string) =>
  template.includes(PR_URL_TOKEN) ? template.split(PR_URL_TOKEN).join(prUrl) : template

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
    if (initializedRef.current) return
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
      .invoke('config:get-copilot-pr-review-prompt-template')
      .then((template: string) => {
        const normalized = (template || '').trim()
        if (!normalized) return
        setSavedDefaultTemplate(normalized)
        setPrompt(current => {
          if (current !== fallbackPrompt) return current
          return resolvePromptTemplate(normalized, prInfo.prUrl)
        })
      })
      .catch(() => {
        // Non-blocking: use built-in default if config fetch fails
      })
  }, [prInfo.initialPrompt, prInfo.prUrl])

  const buildReviewSnapshot = useCallback(async () => {
    if (!prInfo.org || !prInfo.repo || !prInfo.prNumber) {
      return undefined
    }
    try {
      const client = new GitHubClient({ accounts: githubAccounts }, 7)
      const [branches, history] = await Promise.all([
        client.fetchPRBranches(prInfo.org, prInfo.repo, prInfo.prNumber),
        client.fetchPRHistory(prInfo.org, prInfo.repo, prInfo.prNumber),
      ])
      return {
        reviewedHeadSha: branches.headSha || undefined,
        reviewedThreadStats: {
          total: history.threadsTotal,
          unresolved: history.threadsUnaddressed,
          outdated: history.threadsOutdated,
        },
      }
    } catch {
      return undefined
    }
  }, [githubAccounts, prInfo.org, prInfo.repo, prInfo.prNumber])

  const handleRunNow = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      incrementStat({ field: 'copilotPrReviews' }).catch(() => {})
      const snapshot = await buildReviewSnapshot()
      const result = await window.copilot.execute({
        prompt,
        category: 'pr-review',
        model,
        metadata: {
          prUrl: prInfo.prUrl,
          prTitle: prInfo.prTitle,
          prNumber: prInfo.prNumber,
          repo: prInfo.repo,
          org: prInfo.org,
          author: prInfo.author,
          ghAccount: account || undefined,
          reviewedHeadSha: snapshot?.reviewedHeadSha,
          reviewedThreadStats: snapshot?.reviewedThreadStats,
        },
      })
      if (result.success && result.resultId) {
        window.dispatchEvent(
          new CustomEvent('copilot:open-result', { detail: { resultId: result.resultId } })
        )
        onSubmitted?.(result.resultId)
      } else {
        setError(result.error ?? 'Failed to start PR review')
      }
    } catch (err) {
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
          incrementStat({ field: 'copilotPrReviews' }).catch(() => {})
          const result = await window.copilot.execute({
            prompt,
            category: 'pr-review',
            model,
            metadata: {
              prUrl: prInfo.prUrl,
              prTitle: prInfo.prTitle,
              prNumber: prInfo.prNumber,
              repo: prInfo.repo,
              org: prInfo.org,
              author: prInfo.author,
              ghAccount: account || undefined,
              scheduledAt: Date.now(),
              reviewedHeadSha: snapshot?.reviewedHeadSha,
              reviewedThreadStats: snapshot?.reviewedThreadStats,
            },
          })
          if (result.success && result.resultId) {
            window.dispatchEvent(
              new CustomEvent('copilot:open-result', { detail: { resultId: result.resultId } })
            )
          }
        } catch (err) {
          console.error('Scheduled PR review failed:', err)
        }
      }, delayMs)
      setScheduled(true)
    } catch (err) {
      setError(getErrorMessage(err))
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
      await window.ipcRenderer.invoke('config:set-copilot-pr-review-prompt-template', template)
      setSavedDefaultTemplate(template)
    } catch (err) {
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
