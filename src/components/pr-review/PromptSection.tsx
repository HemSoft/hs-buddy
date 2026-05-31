import { useRef, useEffect } from 'react'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'

interface PromptSectionProps {
  prompt: string
  promptExpanded: boolean
  submitting: boolean
  savingDefault: boolean
  onPromptChange: (v: string) => void
  onToggleExpanded: () => void
  onResetPrompt: () => void
  onSaveAsDefault: () => void
}

function PromptActionButtons({
  submitting,
  savingDefault,
  prompt,
  onResetPrompt,
  onSaveAsDefault,
}: {
  submitting: boolean
  savingDefault: boolean
  prompt: string
  onResetPrompt: () => void
  onSaveAsDefault: () => void
}) {
  return (
    <div className="pr-review-prompt-actions">
      <div className="pr-review-prompt-actions-left">
        <button
          type="button"
          className="pr-review-btn-text"
          onClick={onResetPrompt}
          disabled={submitting || savingDefault}
        >
          Reset to default
        </button>
        <button
          type="button"
          className="pr-review-btn-text"
          onClick={onSaveAsDefault}
          disabled={submitting || savingDefault || !prompt.trim()}
        >
          {savingDefault ? 'Saving…' : 'Use as default'}
        </button>
      </div>
      <span className="pr-review-char-count">{prompt.length} chars</span>
    </div>
  )
}

export function PromptSection({
  prompt,
  promptExpanded,
  submitting,
  savingDefault,
  onPromptChange,
  onToggleExpanded,
  onResetPrompt,
  onSaveAsDefault,
}: PromptSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (promptExpanded && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`
    }
  }, [prompt, promptExpanded])

  return (
    <div className="pr-review-prompt-section">
      <button
        type="button"
        className="pr-review-prompt-header"
        onClick={onToggleExpanded}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleExpanded()
          }
        }}
      >
        <span className="pr-review-prompt-label">
          <FileText size={14} />
          <span>Prompt</span>
        </span>
        <span className="pr-review-prompt-toggle">
          <span className="pr-review-prompt-hint">
            {promptExpanded ? 'Click to collapse' : 'Click to edit'}
          </span>
          {promptExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {promptExpanded ? (
        <div className="pr-review-prompt-editor">
          <textarea
            aria-label="PR review prompt"
            ref={textareaRef}
            className="pr-review-prompt-textarea"
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            disabled={submitting}
            rows={6}
          />
          <PromptActionButtons
            submitting={submitting}
            savingDefault={savingDefault}
            prompt={prompt}
            onResetPrompt={onResetPrompt}
            onSaveAsDefault={onSaveAsDefault}
          />
        </div>
      ) : (
        <button
          type="button"
          className="pr-review-prompt-preview"
          onClick={onToggleExpanded}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggleExpanded()
            }
          }}
        >
          {prompt.length > 200 ? prompt.slice(0, 200) + '…' : prompt}
        </button>
      )}
    </div>
  )
}
