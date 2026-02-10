import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Sparkles, History } from 'lucide-react'
import { useCopilotResultsRecent, useCopilotActiveCount } from '../hooks/useConvex'
import { useCopilotSettings, useGitHubAccounts } from '../hooks/useConfig'
import { AccountPicker } from './shared/AccountPicker'
import { ModelPicker } from './shared/ModelPicker'
import { InlineDropdown } from './InlineDropdown'
import type { DropdownOption } from './InlineDropdown'
import './CopilotPromptBox.css'

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

export function CopilotPromptBox({ onOpenResult }: CopilotPromptBoxProps) {
  const [prompt, setPrompt] = useState('')
  const [category, setCategory] = useState('general')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const recentResults = useCopilotResultsRecent(10)
  const activeCount = useCopilotActiveCount()
  const { model: configuredModel, ghAccount } = useCopilotSettings()
  const { accounts: githubAccounts } = useGitHubAccounts()

  // Local state for account/model
  const [localAccount, setLocalAccount] = useState(ghAccount)
  const [localModel, setLocalModel] = useState(configuredModel)
  // Track whether the account was auto-detected (vs. manually chosen)
  const autoDetectedRef = useRef(false)

  // Sync local state from Convex once it loads (one-time initialization)
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!initializedRef.current && configuredModel) {
      initializedRef.current = true
      setLocalAccount(ghAccount)
      setLocalModel(configuredModel)
    }
  }, [ghAccount, configuredModel])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [prompt])

  /**
   * Auto-detect the correct GitHub account from org/owner in the prompt text.
   * Only auto-switches if the user hasn't manually picked a different account.
   */
  const resolveAccountFromPrompt = useCallback((text: string) => {
    const urlPattern = /github\.com\/([a-zA-Z0-9_.-]+)(?:\/[a-zA-Z0-9_.-]+)?/gi
    const orgs: string[] = []
    let match: RegExpExecArray | null
    while ((match = urlPattern.exec(text)) !== null) {
      orgs.push(match[1].toLowerCase())
    }

    if (orgs.length === 0) {
      // No GitHub URL — if we previously auto-detected, revert to default
      if (autoDetectedRef.current) {
        autoDetectedRef.current = false
        setLocalAccount(ghAccount)
      }
      return
    }

    // Find the first org that matches a configured account
    for (const org of orgs) {
      const acct = githubAccounts.find(a => a.org.toLowerCase() === org)
      if (acct) {
        if (localAccount !== acct.username) {
          autoDetectedRef.current = true
          setLocalAccount(acct.username)
        }
        return
      }
    }
  }, [githubAccounts, ghAccount, localAccount])

  // Run auto-detection when prompt text changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => resolveAccountFromPrompt(prompt), 300)
    return () => clearTimeout(timer)
  }, [prompt, resolveAccountFromPrompt])

  const handleSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const result = await window.copilot.execute({
        prompt: trimmed,
        category,
        model: localModel,
        metadata: localAccount ? { ghAccount: localAccount } : undefined,
      })

      if (result.success && result.resultId) {
        setPrompt('')
        // Open the result tab
        onOpenResult?.(result.resultId)
      } else {
        setError(result.error ?? 'Unknown error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatRelativeTime = (ts: number) => {
    const now = Date.now()
    const diff = now - ts
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  const statusEmoji = (status: string) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return '🔄'
      case 'completed': return '✅'
      case 'failed': return '❌'
      default: return '•'
    }
  }

  const pendingCount = activeCount?.pending ?? 0
  const runningCount = activeCount?.running ?? 0
  const totalActive = pendingCount + runningCount

  return (
    <div className="copilot-prompt-box">
      {/* Header */}
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

      {/* Prompt input area */}
      <div className="copilot-prompt-input-area">
        <textarea
          ref={textareaRef}
          className="copilot-prompt-textarea"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Copilot anything... (Ctrl+Enter to send)"
          rows={3}
          disabled={submitting}
        />
        <div className="copilot-prompt-controls">
          <div className="copilot-prompt-selectors">
            {/* Account selector */}
            <AccountPicker
              value={localAccount}
              onChange={(val) => { autoDetectedRef.current = false; setLocalAccount(val) }}
              disabled={submitting}
              title="GitHub account for Copilot"
            />

            {/* Model selector */}
            <ModelPicker
              value={localModel}
              onChange={setLocalModel}
              ghAccount={localAccount}
              disabled={submitting}
              title="Copilot model"
              className="copilot-model-dropdown"
            />
          </div>
          <div className="copilot-prompt-actions">
            {/* Category selector */}
            <InlineDropdown
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={setCategory}
              disabled={submitting}
              align="right"
            />
            <button
              className="copilot-prompt-submit"
              onClick={handleSubmit}
              disabled={!prompt.trim() || submitting}
              title="Send prompt (Ctrl+Enter)"
            >
              {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="copilot-prompt-error">
          {error}
        </div>
      )}

      {/* Recent results */}
      {recentResults && recentResults.length > 0 && (
        <div className="copilot-recent-results">
          <div className="copilot-recent-header">
            <History size={14} />
            <span>Recent</span>
          </div>
          <div className="copilot-recent-list">
            {recentResults.map(r => (
              <div
                key={r._id}
                className="copilot-recent-item"
                onClick={() => onOpenResult?.(r._id)}
                title={r.prompt}
              >
                <span className="copilot-recent-status">{statusEmoji(r.status)}</span>
                <span className="copilot-recent-prompt">
                  {r.prompt.length > 80 ? r.prompt.slice(0, 80) + '...' : r.prompt}
                </span>
                <span className="copilot-recent-time">{formatRelativeTime(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
