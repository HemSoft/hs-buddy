import { ipcMain } from 'electron'
import { getCopilotService } from '../services/copilotService'
import { sendChatMessage, abortChat } from '../services/copilotClient'
import { getErrorMessage } from '../utils'

/**
 * IPC handlers for Copilot SDK integration.
 *
 * Bridges renderer process requests to the CopilotService in the main process.
 */
export function registerCopilotHandlers(): void {
  // Execute a prompt via Copilot SDK
  ipcMain.handle(
    'copilot:execute',
    async (_event, args: { prompt: string; category?: string; metadata?: unknown; model?: string }) => {
      try {
        const service = getCopilotService()
        const result = await service.executePrompt({
          prompt: args.prompt,
          category: args.category,
          metadata: args.metadata,
          model: args.model,
        })
        return result
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        console.error('[CopilotHandlers] Execute failed:', errorMessage)
        return { resultId: null, success: false, error: errorMessage }
      }
    }
  )

  // Cancel an in-progress prompt
  ipcMain.handle('copilot:cancel', async (_event, resultId: string) => {
    try {
      const service = getCopilotService()
      const cancelled = service.cancelPrompt(resultId)
      return { success: cancelled }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Get count of active prompts
  ipcMain.handle('copilot:active-count', async () => {
    const service = getCopilotService()
    return service.getActiveCount()
  })

  // List available models from Copilot SDK
  // Optionally accepts a GitHub account name to switch to before listing.
  ipcMain.handle('copilot:list-models', async (_event, ghAccount?: string) => {
    try {
      const service = getCopilotService()
      return await service.listModels(ghAccount)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      console.error('[CopilotHandlers] listModels failed:', errorMessage)
      return { error: errorMessage }
    }
  })

  // Chat: send message with context and conversation history
  ipcMain.handle(
    'copilot:chat-send',
    async (_event, args: { message: string; context: string; conversationHistory: Array<{ role: string; content: string }> }) => {
      try {
        return await sendChatMessage(args)
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        console.error('[CopilotHandlers] chat-send failed:', errorMessage)
        throw new Error(errorMessage)
      }
    }
  )

  // Chat: abort in-flight response
  ipcMain.handle('copilot:chat-abort', async () => {
    abortChat()
    return { success: true }
  })

}
