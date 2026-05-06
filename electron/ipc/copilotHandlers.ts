import { ipcMain } from 'electron'
import { getCopilotService } from '../services/copilotService'
import { sendChatMessage, abortChat, sendPrompt } from '../services/copilotClient'
import { getErrorMessage } from '../../src/utils/errorUtils'
import { IPC_INVOKE } from '../../src/ipc/contracts'

/**
 * IPC handlers for Copilot SDK integration.
 *
 * Bridges renderer process requests to the CopilotService in the main process.
 */
export function registerCopilotHandlers(): void {
  // Execute a prompt via Copilot SDK
  ipcMain.handle(
    IPC_INVOKE.COPILOT_EXECUTE,
    async (
      _event,
      args: { prompt: string; category?: string; metadata?: unknown; model?: string }
    ) => {
      try {
        const service = getCopilotService()
        const result = await service.executePrompt({
          prompt: args.prompt,
          category: args.category,
          metadata: args.metadata,
          model: args.model,
        })
        return result
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error('[CopilotHandlers] Execute failed:', errorMessage)
        return { resultId: null, success: false, error: errorMessage }
      }
    }
  )

  // Cancel an in-progress prompt
  ipcMain.handle(IPC_INVOKE.COPILOT_CANCEL, async (_event, resultId: string) => {
    try {
      const service = getCopilotService()
      const cancelled = service.cancelPrompt(resultId)
      return { success: cancelled }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // Get count of active prompts
  ipcMain.handle(IPC_INVOKE.COPILOT_ACTIVE_COUNT, async () => {
    const service = getCopilotService()
    return service.getActiveCount()
  })

  // List available models from Copilot SDK
  // Optionally accepts a GitHub account name to switch to before listing.
  ipcMain.handle(IPC_INVOKE.COPILOT_LIST_MODELS, async (_event, ghAccount?: string) => {
    try {
      const service = getCopilotService()
      return await service.listModels(ghAccount)
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error('[CopilotHandlers] listModels failed:', errorMessage)
      return { error: errorMessage }
    }
  })

  // Chat: send message with context and conversation history
  ipcMain.handle(
    IPC_INVOKE.COPILOT_CHAT_SEND,
    async (
      _event,
      args: {
        message: string
        context: string
        conversationHistory: Array<{ role: string; content: string }>
        model?: string
        ghAccount?: string
      }
    ) => {
      try {
        return await sendChatMessage(args)
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error('[CopilotHandlers] chat-send failed:', errorMessage)
        throw new Error(errorMessage, { cause: error })
      }
    }
  )

  // Chat: abort in-flight response
  ipcMain.handle(IPC_INVOKE.COPILOT_CHAT_ABORT, async () => {
    abortChat()
    return { success: true }
  })

  // Quick prompt: one-shot prompt that doesn't share state with chat
  ipcMain.handle(
    IPC_INVOKE.COPILOT_QUICK_PROMPT,
    async (_event, args: { prompt: string; model?: string }) => {
      try {
        return await sendPrompt({ prompt: args.prompt, model: args.model, timeout: 30_000 })
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        console.error('[CopilotHandlers] quick-prompt failed:', errorMessage)
        throw new Error(errorMessage, { cause: error })
      }
    }
  )
}
