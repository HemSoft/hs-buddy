import { ipcMain } from 'electron'
import { getCopilotService } from '../services/copilotService'

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
        const errorMessage = error instanceof Error ? error.message : String(error)
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
}
