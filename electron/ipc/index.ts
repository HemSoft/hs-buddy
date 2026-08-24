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
import { registerFilesystemHandlers } from './filesystemHandlers'
import { registerRalphHandlers } from './ralphHandlers'
import { registerSlackHandlers } from './slackHandlers'
import { registerPollenHandlers } from './pollenHandlers'
import { registerCopilotMetricsHandlers } from './copilotMetricsHandlers'
import { registerCodexUsageHandlers } from './codexUsageHandlers'
import type { WindowProvider } from './windowProvider'

export function registerAllHandlers(getWindow: WindowProvider): void {
  // Patch ipcMain.handle before any handlers register — gives every
  // handler automatic OTel spans and metrics for free.
  instrumentIpcHandlers()

  registerConfigHandlers()
  registerCacheHandlers()
  registerGitHubHandlers()
  registerWindowHandlers()
  registerShellHandlers()
  registerCopilotHandlers()
  registerCrewHandlers()
  registerTempoHandlers()
  registerCopilotSessionHandlers()
  registerTodoistHandlers()
  registerFinanceHandlers()
  registerTerminalHandlers()
  registerFilesystemHandlers()
  registerRalphHandlers(getWindow)
  registerSlackHandlers()
  registerPollenHandlers()
  registerCopilotMetricsHandlers()
  registerCodexUsageHandlers()
}
