import { useState, useCallback, useRef } from 'react'
import type { AssistantMessage, AssistantContext } from '../types/assistant'
import { serializeContext } from './useAssistantContext'

let messageIdCounter = 0
function nextId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

/**
 * Manages conversation state, streaming, and abort for the assistant panel.
 * Conversations are ephemeral (React state only, not persisted to Convex).
 */
export function useAssistantConversation(context: AssistantContext) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef(false)

  const sendMessage = useCallback(
    async (text: string, model?: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      const userMessage: AssistantMessage = {
        id: nextId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
        contextSnapshot: context.summary,
      }

      const assistantMessage: AssistantMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }

      setMessages(prev => [...prev, userMessage, assistantMessage])
      setIsStreaming(true)
      abortRef.current = false

      try {
        const systemPrompt = serializeContext(context)

        // Build conversation history for multi-turn
        const history = messages.map(m => ({
          role: m.role,
          content: m.content,
        }))

        const response = await window.ipcRenderer.invoke('copilot:chat-send', {
          message: trimmed,
          context: systemPrompt,
          conversationHistory: history,
          ...(model ? { model } : {}),
        })

        if (abortRef.current) return

        // Update the assistant message with the response
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: response || '*No response received.*' }
              : m
          )
        )
      } catch (err) {
        if (abortRef.current) return
        const errorMsg = err instanceof Error ? err.message : String(err)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id ? { ...m, content: `⚠️ Error: ${errorMsg}` } : m
          )
        )
      } finally {
        setIsStreaming(false)
      }
    },
    [messages, context, isStreaming]
  )

  const clearConversation = useCallback(() => {
    setMessages([])
    setIsStreaming(false)
    abortRef.current = true
  }, [])

  const abortResponse = useCallback(() => {
    abortRef.current = true
    setIsStreaming(false)
    setMessages(prev =>
      prev.map(m =>
        m.role === 'assistant' && !m.content ? { ...m, content: '*(response aborted)*' } : m
      )
    )
    window.ipcRenderer.invoke('copilot:chat-abort').catch(() => {})
  }, [])

  return {
    messages,
    isStreaming,
    sendMessage,
    clearConversation,
    abortResponse,
  }
}
