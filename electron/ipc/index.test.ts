import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(() => '/home/user'), quit: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
  net: { fetch: vi.fn() },
  BrowserWindow: class {},
}))

// Mock all handler registrations
vi.mock('./instrumentIpc', () => ({ instrumentIpcHandlers: vi.fn() }))
vi.mock('./configHandlers', () => ({ registerConfigHandlers: vi.fn() }))
vi.mock('./cacheHandlers', () => ({ registerCacheHandlers: vi.fn() }))
vi.mock('./githubHandlers', () => ({ registerGitHubHandlers: vi.fn() }))
vi.mock('./windowHandlers', () => ({ registerWindowHandlers: vi.fn() }))
vi.mock('./shellHandlers', () => ({ registerShellHandlers: vi.fn() }))
vi.mock('./copilotHandlers', () => ({ registerCopilotHandlers: vi.fn() }))
vi.mock('./crewHandlers', () => ({ registerCrewHandlers: vi.fn() }))
vi.mock('./tempoHandlers', () => ({ registerTempoHandlers: vi.fn() }))
vi.mock('./copilotSessionHandlers', () => ({ registerCopilotSessionHandlers: vi.fn() }))
vi.mock('./todoistHandlers', () => ({ registerTodoistHandlers: vi.fn() }))
vi.mock('./financeHandlers', () => ({ registerFinanceHandlers: vi.fn() }))
vi.mock('./terminalHandlers', () => ({ registerTerminalHandlers: vi.fn() }))
vi.mock('./filesystemHandlers', () => ({ registerFilesystemHandlers: vi.fn() }))
vi.mock('./ralphHandlers', () => ({ registerRalphHandlers: vi.fn() }))
vi.mock('./slackHandlers', () => ({ registerSlackHandlers: vi.fn() }))

import { registerAllHandlers } from './index'
import { instrumentIpcHandlers } from './instrumentIpc'
import { registerConfigHandlers } from './configHandlers'
import { registerWindowHandlers } from './windowHandlers'
import { registerCrewHandlers } from './crewHandlers'

describe('ipc/index', () => {
  it('registerAllHandlers calls instrumentIpcHandlers first', () => {
    const mockWin = {} as Electron.BrowserWindow
    registerAllHandlers(mockWin)
    expect(instrumentIpcHandlers).toHaveBeenCalled()
  })

  it('registerAllHandlers registers all handler groups', () => {
    const mockWin = {} as Electron.BrowserWindow
    registerAllHandlers(mockWin)
    expect(registerConfigHandlers).toHaveBeenCalled()
    expect(registerWindowHandlers).toHaveBeenCalledWith(mockWin)
    expect(registerCrewHandlers).toHaveBeenCalledWith(mockWin)
  })
})
