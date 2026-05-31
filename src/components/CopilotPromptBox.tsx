import { useRef, useEffect, useCallback, useState } from 'react'
import { Send, Loader2, Sparkles, History } from 'lucide-react'
import { useCopilotResultsRecent, useCopilotActiveCount } from '../hooks/useConvex'
import { useCopilotSettings, useGitHubAccounts } from '../hooks/useConfig'
import { AccountPicker } from './shared/AccountPicker'
import { ModelPicker } from './shared/ModelPicker'
import { PremiumUsageBadge } from './shared/PremiumUsageBadge'
import { InlineDropdown, type DropdownOption } from './InlineDropdown'
import { formatDistanceToNow } from '../utils/dateUtils'
import { getStatusEmoji } from './shared/statusDisplay'
import { getErrorMessage } from '../utils/errorUtils'
import { modLabel } from '../utils/platform'
import './CopilotPromptBox.css'

function computeActiveStats(activeCount: { pending?: number; running?: number } | undefined) {
  const pendingCount = activeCount?.pending ?? 0
  const runningCount = activeCount?.running ?? 0
  return { pendingCount, runningCount, totalActive: pendingCount + runningCount }
}

function buildCopilotMetadata(account: string | null): { ghAccount: string } | undefined {
  return account ? { ghAccount: account } : undefined
}

function extractGitHubOrgsFromText(text: string): string[] {
  const urlPattern = /github\.com\/([a-zA-Z0-9_.-]+)(?:\/[a-zA-Z0-9_.-]+)?/gi
  const orgs: string[] = []
  let match: RegExpExecArray | null
  while ((match = urlPattern.exec(text)) !== null) orgs.push(match[1].toLowerCase())
  return orgs
}

interface CopilotPromptBoxProps {
  /** Called when user opens a result tab */
  onOpenResult?: (resultId: string) => void
}

const CATEGORY_OPTIONS: DropdownOption[] = [
  { value: 'general', label: 'General' },
  { value: 'pr-review', label: 'PR Review' },
  { value: 'code-analysis', label: 'Code Analysis' },
  { value: 'documentation', label: 'Documentation' },
]

interface CopilotPromptState {
  prompt: string
  category: string
  submitting: boolean
  error: string | null
  localAccount: string
  localModel: string
}

function RecentResults({
  results,
  onOpenResult,
}: {
  results: NonNullable<ReturnType<typeof useCopilotResultsRecent>>
  onOpenResult?: (resultId: string) => void
}) {
  return (
    <div className="copilot-recent-results">
      <div className="copilot-recent-header">
        <History size={14} />
        <span>Recent</span>
      </div>
      <div className="copilot-recent-list">
        {results.map(r => (
          <button
            type="button"
            key={r._id}
            className="copilot-recent-item"
            onClick={() => onOpenResult?.(r._id)}
            title={r.prompt}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpenResult?.(r._id)
              }
            }}
          >
            <span className="copilot-recent-status">{getStatusEmoji(r.status)}</span>
            <span className="copilot-recent-prompt">
              {r.prompt.length > 80 ? r.prompt.slice(0, 80) + '…' : r.prompt}
            </span>
            <span className="copilot-recent-time">{formatDistanceToNow(r.createdAt)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PromptInputArea({
  state,
  setState,
  submitting,
  textareaRef,
  handleSubmit,
  handleKeyDown,
  localAccount,
  localModel,
  category,
  autoDetectedRef,
}: {
  state: CopilotPromptState
  setState: React.Dispatch<React.SetStateAction<CopilotPromptState>>
  submitting: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  handleSubmit: () => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  localAccount: string
  localModel: string
  category: string
  autoDetectedRef: React.MutableRefObject<boolean>
}) {
  return (
    <div className="copilot-prompt-input-area">
      <textarea
        aria-label="Copilot prompt"
        ref={textareaRef}
        className="copilot-prompt-textarea"
        value={state.prompt}
        onChange={e => setState(previousState => ({ ...previousState, prompt: e.target.value }))}
        onKeyDown={handleKeyDown}
        placeholder={`Ask Copilot anything… (${modLabel}+Enter to send)`}
        rows={3}
        disabled={submitting}
      />
      <div className="copilot-prompt-controls">
        <div className="copilot-prompt-selectors">
          <AccountPicker
            value={localAccount}
            onChange={val => {
              autoDetectedRef.current = false
              setState(previousState => ({ ...previousState, localAccount: val }))
            }}
            disabled={submitting}
            title="GitHub account for Copilot"
          />
          {localAccount && <PremiumUsageBadge username={localAccount} />}
          <ModelPicker
            value={localModel}
            onChange={val => setState(previousState => ({ ...previousState, localModel: val }))}
            ghAccount={localAccount}
            disabled={submitting}
            title="Copilot model"
            className="copilot-model-dropdown"
          />
        </div>
        <div className="copilot-prompt-actions">
          <InlineDropdown
            value={category}
            options={CATEGORY_OPTIONS}
            onChange={val => setState(previousState => ({ ...previousState, category: val }))}
            disabled={submitting}
            align="right"
          />
          <button
            type="button"
            className="copilot-prompt-submit"
            onClick={handleSubmit}
            disabled={!state.prompt.trim() || submitting}
            title={`Send prompt (${modLabel}+Enter)`}
          >
            {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CopilotPromptBox({ onOpenResult }: CopilotPromptBoxProps) {
  const { model: configuredModel, ghAccount } = useCopilotSettings()
  const { accounts: githubAccounts } = useGitHubAccounts()
  const [state, setState] = useState<CopilotPromptState>({
    prompt: '',
    category: 'general',
    submitting: false,
    error: null,
    localAccount: ghAccount,
    localModel: configuredModel,
  })
  const { prompt, category, submitting, error, localAccount, localModel } = state
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recentResults = useCopilotResultsRecent(10)
  const activeCount = useCopilotActiveCount()
  const autoDetectedRef = useRef(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current && configuredModel) {
      initializedRef.current = true
      setState(prev => ({ ...prev, localAccount: ghAccount, localModel: configuredModel }))
    }
  }, [ghAccount, configuredModel])

  useEffect(() => {
    /* v8 ignore start */
    if (textareaRef.current) {
      /* v8 ignore stop */
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [prompt])

  const resolveAccountFromPrompt = useCallback(
    (text: string) => {
      const orgs = extractGitHubOrgsFromText(text)
      if (orgs.length === 0) {
        /* v8 ignore start */
        if (autoDetectedRef.current) {
          autoDetectedRef.current = false
          setState(prev => ({ ...prev, localAccount: ghAccount }))
        }
        /* v8 ignore stop */
        return
      }
      const matchedAcct = orgs
        .map(org => githubAccounts.find(a => a.org.toLowerCase() === org))
        .find(Boolean)
      if (!matchedAcct) return
      if (localAccount !== matchedAcct.username) {
        autoDetectedRef.current = true
        setState(prev => ({ ...prev, localAccount: matchedAcct.username }))
      }
    },
    [githubAccounts, ghAccount, localAccount]
  )

  useEffect(() => {
    const t = setTimeout(() => resolveAccountFromPrompt(prompt), 300)
    return () => clearTimeout(t)
  }, [prompt, resolveAccountFromPrompt])

  const handleSubmitResult = (result: {
    success?: boolean
    resultId?: string | null
    error?: string
  }) => {
    if (result.success && result.resultId) {
      setState(prev => ({ ...prev, prompt: '', error: null }))
      onOpenResult?.(result.resultId)
    } else {
      setState(prev => ({ ...prev, error: result.error ?? 'Unknown error' }))
    }
  }

  const handleSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || submitting) return
    setState(prev => ({ ...prev, submitting: true, error: null }))
    try {
      const result = await window.copilot.execute({
        prompt: trimmed,
        category,
        model: localModel,
        metadata: buildCopilotMetadata(localAccount),
      })
      handleSubmitResult(result)
    } catch (err: unknown) {
      setState(prev => ({ ...prev, error: getErrorMessage(err) }))
    } finally {
      setState(prev => ({ ...prev, submitting: false }))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }
  const { totalActive } = computeActiveStats(activeCount)

  return (
    <div className="copilot-prompt-box">
      <div className="copilot-prompt-header">
        <div className="copilot-prompt-title">
          <Sparkles size={18} />
          <h2>Copilot SDK</h2>
        </div>
        {totalActive > 0 && (
          <span className="copilot-active-badge">
            <Loader2 size={12} className="spin" />
            {totalActive} active
          </span>
        )}
      </div>
      <PromptInputArea
        state={state}
        setState={setState}
        submitting={submitting}
        textareaRef={textareaRef}
        handleSubmit={handleSubmit}
        handleKeyDown={handleKeyDown}
        localAccount={localAccount}
        localModel={localModel}
        category={category}
        autoDetectedRef={autoDetectedRef}
      />
      {error && <div className="copilot-prompt-error">{error}</div>}
      {recentResults && recentResults.length > 0 && (
        <RecentResults results={recentResults} onOpenResult={onOpenResult} />
      )}
    </div>
  )
}
