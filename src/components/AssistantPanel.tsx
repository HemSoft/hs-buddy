import { useState, useRef, useEffect } from 'react'
import { Sparkles, Trash2, Send, Loader2, StopCircle } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import type { AssistantContext } from '../types/assistant'
import { useAssistantConversation } from '../hooks/useAssistantConversation'
import './AssistantPanel.css'

interface AssistantPanelProps {
  context: AssistantContext
}

const SUGGESTED_PROMPTS: Record<string, string[]> = {
  'pr-detail': ['Summarize this PR', 'List unresolved threads', 'Suggest improvements'],
  'repo-detail': ['Show recent activity', 'Explain this repo'],
  'pr-list': ['Show my open PRs', 'What needs my review?'],
  welcome: ['What can you do?', 'Show my open PRs', 'Help me get started'],
}

export function AssistantPanel({ context }: AssistantPanelProps) {
  const { messages, isStreaming, sendMessage, clearConversation, abortResponse } =
    useAssistantConversation(context)
  const [input, setInput] = useState('')
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  const handleSend = () => {
    if (!input.trim() || isStreaming) return
    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestion = (prompt: string) => {
    sendMessage(prompt)
  }

  const suggestions = SUGGESTED_PROMPTS[context.viewType] || SUGGESTED_PROMPTS.welcome

  return (
    <div className="assistant-panel">
      {/* Header */}
      <div className="assistant-header">
        <div className="assistant-header-left">
          <Sparkles size={16} className="assistant-header-icon" />
          <span className="assistant-header-title">Copilot Assistant</span>
        </div>
        <div className="assistant-header-actions">
          <button
            className="assistant-header-btn"
            onClick={clearConversation}
            title="Clear conversation"
            aria-label="Clear conversation"
            disabled={messages.length === 0}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Conversation area */}
      <div className="assistant-conversation">
        {messages.length === 0 ? (
          <div className="assistant-empty-state">
            <Sparkles size={32} className="assistant-empty-icon" />
            <p className="assistant-empty-text">
              Ask me anything about what you&apos;re viewing, or about Buddy itself.
              I can help with PRs, repos, issues, and more.
            </p>
            <div className="assistant-suggestions">
              {suggestions.map(prompt => (
                <button
                  key={prompt}
                  className="assistant-suggestion-btn"
                  onClick={() => handleSuggestion(prompt)}
                  disabled={isStreaming}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`assistant-message assistant-message-${msg.role}`}
              >
                {msg.role === 'assistant' ? (
                  msg.content ? (
                    <div className="assistant-message-markdown" data-color-mode="dark">
                      <MarkdownPreview
                        source={msg.content}
                        style={{ backgroundColor: 'transparent', color: 'var(--text-primary)' }}
                      />
                    </div>
                  ) : (
                    <div className="assistant-message-loading">
                      <Loader2 size={14} className="spin" />
                      <span>Thinking...</span>
                    </div>
                  )
                ) : (
                  <div className="assistant-message-text">{msg.content}</div>
                )}
              </div>
            ))}
            <div ref={conversationEndRef} />
          </>
        )}
      </div>

      {/* Context badge bar */}
      {context.viewId && (
        <div className="assistant-context-bar">
          <span className="assistant-context-badge" title={context.summary}>
            {context.summary}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="assistant-input-area">
        <textarea
          ref={textareaRef}
          className="assistant-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={1}
          disabled={isStreaming}
        />
        <div className="assistant-input-actions">
          {isStreaming ? (
            <button className="assistant-stop-btn" onClick={abortResponse} title="Stop">
              <StopCircle size={16} />
            </button>
          ) : (
            <button
              className="assistant-send-btn"
              onClick={handleSend}
              disabled={!input.trim()}
              title="Send (Enter)"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
