import type { RalphRunInfo } from '../../src/types/ralph'
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
  getLoopStatus: vi.fn().mockResolvedValue({ runId: 'run-1', status: 'completed' }),
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

  it('ralph:get-status delegates to getLoopStatus', async () => {
    const { getLoopStatus } = await import('../services/ralphService')
    const handler = handlers.get('ralph:get-status')!
    const result = await handler({}, 'run-1')
    expect(getLoopStatus).toHaveBeenCalledWith('run-1')
    expect(result).toEqual({ runId: 'run-1', status: 'completed' })
  })

  it('ralph:get-config delegates to getConfig', async () => {
    const { getConfig } = await import('../services/ralphService')
    const handler = handlers.get('ralph:get-config')!
    const result = await handler({}, 'global')
    expect(getConfig).toHaveBeenCalledWith('global')
    expect(result).toEqual({ scripts: '/path/to/scripts' })
  })

  it('ralph:get-scripts-path delegates to getScriptsPath', async () => {
    const { getScriptsPath } = await import('../services/ralphService')
    const handler = handlers.get('ralph:get-scripts-path')!
    const result = await handler({})
    expect(getScriptsPath).toHaveBeenCalled()
    expect(result).toBe('/home/user/.ralph/scripts')
  })

  it('ralph:list-templates delegates to listTemplateScripts', async () => {
    const { listTemplateScripts } = await import('../services/ralphService')
    const handler = handlers.get('ralph:list-templates')!
    const result = await handler({})
    expect(listTemplateScripts).toHaveBeenCalled()
    expect(result).toEqual(['audit.sh', 'deploy.sh'])
  })

  it('status change callback sends update to renderer', async () => {
    const { setStatusChangeCallback } = await import('../services/ralphService')
    const callback = vi.mocked(setStatusChangeCallback).mock.calls.at(0)?.[0]
    if (typeof callback !== 'function') {
      throw new Error('setStatusChangeCallback was not registered')
    }
    const run = { runId: 'run-1', status: 'completed' } as RalphRunInfo
    callback(run)
    expect(mockWin.webContents.send).toHaveBeenCalledWith('ralph:status-update', run)
  })

  it('status change callback skips destroyed window', async () => {
    const { setStatusChangeCallback } = await import('../services/ralphService')
    const callback = vi.mocked(setStatusChangeCallback).mock.calls.at(0)?.[0]
    if (typeof callback !== 'function') {
      throw new Error('setStatusChangeCallback was not registered')
    }
    vi.mocked(mockWin.isDestroyed).mockReturnValue(true)
    callback({ runId: 'run-1', status: 'completed' } as RalphRunInfo)
    expect(mockWin.webContents.send).not.toHaveBeenCalled()
  })

  it('ralph:select-directory returns null when dialog is canceled', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    const handler = handlers.get('ralph:select-directory')!
    const result = await handler({})
    expect(result).toBeNull()
  })

  it('ralph:get-status delegates to getLoopStatus', async () => {
    const { getLoopStatus } = await import('../services/ralphService')
    const handler = handlers.get('ralph:get-status')!
    await handler({}, 'run-1')
    expect(getLoopStatus).toHaveBeenCalledWith('run-1')
  })

  it('ralph:get-config delegates to getConfig', async () => {
    const { getConfig } = await import('../services/ralphService')
    const handler = handlers.get('ralph:get-config')!
    await handler({}, 'models')
    expect(getConfig).toHaveBeenCalledWith('models')
  })

  it('ralph:get-scripts-path delegates to getScriptsPath', async () => {
    const { getScriptsPath } = await import('../services/ralphService')
    const handler = handlers.get('ralph:get-scripts-path')!
    const result = await handler({})
    expect(getScriptsPath).toHaveBeenCalled()
    expect(result).toBe('/home/user/.ralph/scripts')
  })

  it('ralph:list-templates delegates to listTemplateScripts', async () => {
    const { listTemplateScripts } = await import('../services/ralphService')
    const handler = handlers.get('ralph:list-templates')!
    const result = await handler({})
    expect(listTemplateScripts).toHaveBeenCalled()
    expect(result).toEqual(['audit.sh', 'deploy.sh'])
  })

  it('status change callback sends push to renderer', async () => {
    const { setStatusChangeCallback } = await import('../services/ralphService')
    // The callback was registered during registerRalphHandlers
    const callback = vi.mocked(setStatusChangeCallback).mock.calls[0][0]!
    expect(callback).toBeDefined()

    // Simulate a status change
    const run = { runId: 'run-1', status: 'completed' }
    callback(run as never)
    expect(mockWin.webContents.send).toHaveBeenCalledWith('ralph:status-update', run)
  })

  it('status change callback does not send when window is destroyed', async () => {
    const { setStatusChangeCallback } = await import('../services/ralphService')
    const callback = vi.mocked(setStatusChangeCallback).mock.calls[0][0]!

    vi.mocked(mockWin.isDestroyed).mockReturnValue(true)
    callback({ runId: 'run-1', status: 'completed' } as never)
    expect(mockWin.webContents.send).not.toHaveBeenCalled()
  })
})
