import * as path from 'path'
import { ipcMain } from 'electron'
import { scanCopilotSessions, getSessionDetail, getVSCodeStoragePath, computeSessionDigest, resolveWorkspaceName } from '../services/copilotSessionService'
import type { SessionDigest } from '../../src/types/copilotSession'

/** Validates filePath is inside VS Code storage and is a .jsonl file. Returns normalized path or null. */
function validateSessionPath(filePath: string): string | null {
  const storagePath = getVSCodeStoragePath()
  if (!storagePath) return null
  const normalized = path.resolve(filePath)
  const resolvedStorage = path.resolve(storagePath)
  // Boundary-safe: require path separator after storage root to prevent prefix attacks
  if (!(normalized === resolvedStorage || normalized.startsWith(resolvedStorage + path.sep))) return null
  if (!normalized.endsWith('.jsonl')) return null
  return normalized
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

  ipcMain.handle('copilot-sessions:compute-digest', async (_event, filePath: string): Promise<SessionDigest | null> => {
    const normalized = validateSessionPath(filePath)
    if (!normalized) return null
    const session = await getSessionDetail(normalized)
    if (!session) return null
    const wsDir = path.dirname(path.dirname(normalized))
    const workspaceName = resolveWorkspaceName(wsDir)
    return computeSessionDigest(session, workspaceName, '')
  })
}
