import { useState, useCallback, useRef } from 'react'
import type { AssistantMessage, AssistantContext } from '../types/assistant'
import { serializeContext } from './useAssistantContext'
import { getErrorMessage } from '../utils/errorUtils'
import { IPC_INVOKE } from '../ipc/contracts'

let messageIdCounter = 0
function nextId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

function shouldSkipAssistantMessage(text: string, isStreaming: boolean): boolean {
  return !text || isStreaming
}

function buildConversationHistory(messages: AssistantMessage[]) {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
  }))
}

function resolveChatRequest(
  context: AssistantContext,
  messages: AssistantMessage[],
  message: string,
  model?: string
) {
  const request = {
    message,
    context: serializeContext(context),
    conversationHistory: buildConversationHistory(messages),
  }
  if (model) {
    return { ...request, model }
  }
  return request
}

function resolveAssistantMessageContent(
  messages: AssistantMessage[],
  messageId: string,
  content: string
): AssistantMessage[] {
  return messages.map(m => (m.id === messageId ? { ...m, content } : m))
}

function resolveAssistantResponseContent(response: string | null | undefined): string {
  return response || '*No response received.*'
}

function resolveAssistantErrorContent(errorMsg: string): string {
  return `⚠️ Error: ${errorMsg}`
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
      if (shouldSkipAssistantMessage(trimmed, isStreaming)) return

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
        const response = await window.ipcRenderer.invoke(
          IPC_INVOKE.COPILOT_CHAT_SEND,
          resolveChatRequest(context, messages, trimmed, model)
        )

        if (abortRef.current) return

        setMessages(prev =>
          resolveAssistantMessageContent(
            prev,
            assistantMessage.id,
            resolveAssistantResponseContent(response)
          )
        )
      } catch (err: unknown) {
        if (abortRef.current) return
        const errorMsg = getErrorMessage(err)
        setMessages(prev =>
          resolveAssistantMessageContent(
            prev,
            assistantMessage.id,
            resolveAssistantErrorContent(errorMsg)
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
    window.ipcRenderer.invoke(IPC_INVOKE.COPILOT_CHAT_ABORT).catch(() => {})
  }, [])

  return {
    messages,
    isStreaming,
    sendMessage,
    clearConversation,
    abortResponse,
  }
}
