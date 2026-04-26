import * as path from 'path'
import { ipcMain } from 'electron'
import {
  scanCopilotSessions,
  getSessionDetail,
  getVSCodeStoragePath,
  computeSessionDigest,
  resolveWorkspaceName,
} from '../services/copilotSessionService'
import { validateSessionPath as validateSessionPathPure } from '../../src/utils/copilotSessionParsing'
import type { SessionDigest } from '../../src/types/copilotSession'

/** Validates filePath is inside VS Code storage and is a .jsonl file. Returns normalized path or null. */
function validateSessionPath(filePath: string): string | null {
  return validateSessionPathPure(filePath, getVSCodeStoragePath(), path.resolve, path.sep)
}

export function registerCopilotSessionHandlers(): void {
  ipcMain.handle('copilot-sessions:scan', () => {
    return scanCopilotSessions()
  })

  ipcMain.handle('copilot-sessions:get-session', (_event, filePath: string) => {
    const normalized = validateSessionPath(filePath)
    if (!normalized) return null
    return getSessionDetail(normalized)
  })

  ipcMain.handle(
    'copilot-sessions:compute-digest',
    async (_event, filePath: string): Promise<SessionDigest | null> => {
      const normalized = validateSessionPath(filePath)
      if (!normalized) return null
      const session = await getSessionDetail(normalized)
      if (!session) return null
      const wsDir = path.dirname(path.dirname(normalized))
      const workspaceName = resolveWorkspaceName(wsDir)
      return computeSessionDigest(session, workspaceName, '', Date.now())
    }
  )
}
