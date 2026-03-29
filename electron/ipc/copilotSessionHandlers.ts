import * as path from 'path'
import { ipcMain } from 'electron'
import { scanCopilotSessions, getSessionDetail, getVSCodeStoragePath, computeSessionDigest, resolveWorkspaceName } from '../services/copilotSessionService'
import type { SessionDigest } from '../../src/types/copilotSession'

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

  ipcMain.handle('copilot-sessions:compute-digest', async (_event, filePath: string): Promise<SessionDigest | null> => {
    const storagePath = getVSCodeStoragePath()
    if (!storagePath) return null
    const normalized = path.resolve(filePath)
    if (!normalized.startsWith(path.resolve(storagePath)) || !normalized.endsWith('.jsonl')) {
      return null
    }
    const session = await getSessionDetail(filePath)
    if (!session) return null
    // Resolve workspace name from the workspace directory
    const wsDir = path.dirname(path.dirname(filePath))
    const workspaceName = resolveWorkspaceName(wsDir)
    return computeSessionDigest(session, workspaceName, '')
  })
}
