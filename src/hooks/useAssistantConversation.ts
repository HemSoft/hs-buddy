import { useState, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import type { AssistantMessage, AssistantContext } from '../types/assistant'
import { serializeContext } from './useAssistantContext'
import { getErrorMessage } from '../utils/errorUtils'
import { IPC_INVOKE } from '../ipc/contracts'

let messageIdCounter = 0
function nextId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

function shouldSkipMessageSend(trimmed: string, isStreaming: boolean): boolean {
  return !trimmed || isStreaming
}

function buildConversationHistory(messages: AssistantMessage[]) {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }))
}

function buildChatRequest(
  message: string,
  context: AssistantContext,
  history: Array<{ role: AssistantMessage['role']; content: string }>,
  model?: string
) {
  const request = {
    message,
    context: serializeContext(context),
    conversationHistory: history,
  }
  if (model) {
    return { ...request, model }
  }
  return request
}

function resolveAssistantResponse(response: string | null | undefined): string {
  return response || '*No response received.*'
}

function updateAssistantMessage(
  setMessages: Dispatch<SetStateAction<AssistantMessage[]>>,
  messageId: string,
  content: string
) {
  setMessages(prev => prev.map(message => (message.id === messageId ? { ...message, content } : message)))
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
      if (shouldSkipMessageSend(trimmed, isStreaming)) return

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
          buildChatRequest(trimmed, context, buildConversationHistory(messages), model)
        )

        if (abortRef.current) return
        updateAssistantMessage(
          setMessages,
          assistantMessage.id,
          resolveAssistantResponse(response as string | null | undefined)
        )
      } catch (err: unknown) {
        if (abortRef.current) return
        updateAssistantMessage(setMessages, assistantMessage.id, `⚠️ Error: ${getErrorMessage(err)}`)
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
