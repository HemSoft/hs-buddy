/**
 * Type definitions for the Global Copilot Assistant Panel.
 */

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  contextSnapshot?: string
}

export interface AssistantContext {
  viewType: string
  viewId: string | null
  summary: string
  metadata: Record<string, unknown>
}
