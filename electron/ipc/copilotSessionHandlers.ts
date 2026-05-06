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
import { IPC_INVOKE } from '../../src/ipc/contracts'

/** Validates filePath is inside VS Code storage and is a .jsonl file. Returns normalized path or null. */
function validateSessionPath(filePath: string): string | null {
  return validateSessionPathPure(filePath, getVSCodeStoragePath(), path.resolve, path.sep)
}

export function registerCopilotSessionHandlers(): void {
  ipcMain.handle(IPC_INVOKE.COPILOT_SESSIONS_SCAN, () => {
    return scanCopilotSessions()
  })

  ipcMain.handle(IPC_INVOKE.COPILOT_SESSIONS_GET_SESSION, (_event, filePath: string) => {
    const normalized = validateSessionPath(filePath)
    if (!normalized) return null
    return getSessionDetail(normalized)
  })

  ipcMain.handle(
    IPC_INVOKE.COPILOT_SESSIONS_COMPUTE_DIGEST,
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
