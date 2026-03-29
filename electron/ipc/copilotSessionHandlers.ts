import { ipcMain } from 'electron'
import { scanCopilotSessions, getSessionDetail } from '../services/copilotSessionService'

export function registerCopilotSessionHandlers(): void {
  ipcMain.handle('copilot-sessions:scan', () => {
    return scanCopilotSessions()
  })

  ipcMain.handle('copilot-sessions:get-session', (_event, filePath: string) => {
    return getSessionDetail(filePath)
  })
}
