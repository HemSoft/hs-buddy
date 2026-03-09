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
      <div
        className="pr-review-prompt-header"
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleExpanded()
          }
        }}
      >
        <div className="pr-review-prompt-label">
          <FileText size={14} />
          <span>Prompt</span>
        </div>
        <div className="pr-review-prompt-toggle">
          <span className="pr-review-prompt-hint">
            {promptExpanded ? 'Click to collapse' : 'Click to edit'}
          </span>
          {promptExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {promptExpanded ? (
        <div className="pr-review-prompt-editor">
          <textarea
            ref={textareaRef}
            className="pr-review-prompt-textarea"
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            disabled={submitting}
            rows={6}
          />
          <div className="pr-review-prompt-actions">
            <div className="pr-review-prompt-actions-left">
              <button
                className="pr-review-btn-text"
                onClick={onResetPrompt}
                disabled={submitting || savingDefault}
              >
                Reset to default
              </button>
              <button
                className="pr-review-btn-text"
                onClick={onSaveAsDefault}
                disabled={submitting || savingDefault || !prompt.trim()}
              >
                {savingDefault ? 'Saving…' : 'Use as default'}
              </button>
            </div>
            <span className="pr-review-char-count">{prompt.length} chars</span>
          </div>
        </div>
      ) : (
        <div className="pr-review-prompt-preview" onClick={onToggleExpanded}>
          {prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt}
        </div>
      )}
    </div>
  )
}
