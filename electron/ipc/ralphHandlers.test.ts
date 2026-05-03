import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePaths: ['/repos/my-project'] }),
  },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('./ipcHandler', () => ({
  ipcHandler: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('../services/ralphService', () => ({
  launchLoop: vi.fn().mockResolvedValue({ runId: 'run-1', status: 'running' }),
  stopLoop: vi.fn().mockResolvedValue({ success: true }),
  listLoops: vi.fn().mockResolvedValue([{ runId: 'run-1', status: 'running' }]),
  getLoopStatus: vi.fn().mockResolvedValue({ runId: 'run-1', status: 'complete' }),
  getConfig: vi.fn().mockResolvedValue({ scripts: '/path/to/scripts' }),
  getScriptsPath: vi.fn().mockResolvedValue('/home/user/.ralph/scripts'),
  listTemplateScripts: vi.fn().mockResolvedValue(['audit.sh', 'deploy.sh']),
  setStatusChangeCallback: vi.fn(),
}))

import { ipcMain, dialog } from 'electron'
import { registerRalphHandlers } from './ralphHandlers'

describe('ralphHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  const mockWin = {
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  } as unknown as Electron.BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerRalphHandlers(mockWin)
  })

  it('registers expected channels', () => {
    expect(handlers.has('ralph:launch')).toBe(true)
    expect(handlers.has('ralph:stop')).toBe(true)
    expect(handlers.has('ralph:list')).toBe(true)
    expect(handlers.has('ralph:get-status')).toBe(true)
    expect(handlers.has('ralph:get-config')).toBe(true)
    expect(handlers.has('ralph:get-scripts-path')).toBe(true)
    expect(handlers.has('ralph:list-templates')).toBe(true)
    expect(handlers.has('ralph:select-directory')).toBe(true)
  })

  it('ralph:launch delegates to launchLoop', async () => {
    const { launchLoop } = await import('../services/ralphService')
    const handler = handlers.get('ralph:launch')!
    const config = { script: 'audit.sh', repo: '/repos/test' }
    const result = await handler({}, config)
    expect(launchLoop).toHaveBeenCalledWith(config)
    expect(result).toEqual({ runId: 'run-1', status: 'running' })
  })

  it('ralph:stop delegates to stopLoop', async () => {
    const { stopLoop } = await import('../services/ralphService')
    const handler = handlers.get('ralph:stop')!
    await handler({}, 'run-1')
    expect(stopLoop).toHaveBeenCalledWith('run-1')
  })

  it('ralph:list returns loops list', async () => {
    const handler = handlers.get('ralph:list')!
    const result = await handler({})
    expect(result).toEqual([{ runId: 'run-1', status: 'running' }])
  })

  it('ralph:select-directory opens dialog and returns path', async () => {
    const handler = handlers.get('ralph:select-directory')!
    const result = await handler({}, '/default')
    expect(dialog.showOpenDialog).toHaveBeenCalled()
    expect(result).toBe('/repos/my-project')
  })

  it('ralph:select-directory returns null when dialog is canceled', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    const handler = handlers.get('ralph:select-directory')!
    const result = await handler({})
    expect(result).toBeNull()
  })
})
