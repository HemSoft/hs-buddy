import type { BrowserWindow } from 'electron'
import { instrumentIpcHandlers } from './instrumentIpc'
import { registerConfigHandlers } from './configHandlers'
import { registerCacheHandlers } from './cacheHandlers'
import { registerGitHubHandlers } from './githubHandlers'
import { registerWindowHandlers } from './windowHandlers'
import { registerShellHandlers } from './shellHandlers'
import { registerCopilotHandlers } from './copilotHandlers'
import { registerCrewHandlers } from './crewHandlers'
import { registerTempoHandlers } from './tempoHandlers'
import { registerCopilotSessionHandlers } from './copilotSessionHandlers'
import { registerTodoistHandlers } from './todoistHandlers'
import { registerFinanceHandlers } from './financeHandlers'
import { registerTerminalHandlers } from './terminalHandlers'

export function registerAllHandlers(win: BrowserWindow): void {
  // Patch ipcMain.handle before any handlers register — gives every
  // handler automatic OTel spans and metrics for free.
  instrumentIpcHandlers()

  registerConfigHandlers()
  registerCacheHandlers()
  registerGitHubHandlers()
  registerWindowHandlers(win)
  registerShellHandlers()
  registerCopilotHandlers()
  registerCrewHandlers(win)
  registerTempoHandlers()
  registerCopilotSessionHandlers()
  registerTodoistHandlers()
  registerFinanceHandlers()
  registerTerminalHandlers(win)
}
