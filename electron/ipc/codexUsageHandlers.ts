import { ipcMain } from 'electron'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import { fetchCodexUsage } from '../services/codexUsageService'

export function registerCodexUsageHandlers(): void {
  ipcMain.handle(IPC_INVOKE.CODEX_GET_USAGE, () => fetchCodexUsage())
}
