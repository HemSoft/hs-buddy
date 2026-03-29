import * as path from 'path'
import { ipcMain } from 'electron'
import { scanCopilotSessions, getSessionDetail, getVSCodeStoragePath } from '../services/copilotSessionService'

export function registerCopilotSessionHandlers(): void {
  ipcMain.handle('copilot-sessions:scan', () => {
    return scanCopilotSessions()
  })

  ipcMain.handle('copilot-sessions:get-session', (_event, filePath: string) => {
    const storagePath = getVSCodeStoragePath()
    if (!storagePath) return null
    const normalized = path.resolve(filePath)
    if (!normalized.startsWith(path.resolve(storagePath)) || !normalized.endsWith('.jsonl')) {
      return null
    }
    return getSessionDetail(filePath)
  })
}
