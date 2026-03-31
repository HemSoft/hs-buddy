import type { BrowserWindow } from 'electron'
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

export function registerAllHandlers(win: BrowserWindow): void {
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
}
