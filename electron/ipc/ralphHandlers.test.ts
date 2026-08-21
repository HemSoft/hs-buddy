import type { RalphRunInfo } from '../../src/types/ralph'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: {
    showOpenDialog: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePaths: ['/repos/my-project'] }),
  },
  ipcMain: { handle: vi.fn() },
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

import { BrowserWindow, dialog, ipcMain } from 'electron'
import { registerRalphHandlers } from './ralphHandlers'

function mockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  } as unknown as Electron.BrowserWindow
}

describe('ralphHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  let currentWindow: Electron.BrowserWindow | null
  let initialWindow: Electron.BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    initialWindow = mockWindow()
    currentWindow = initialWindow
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(initialWindow)
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerRalphHandlers(() => currentWindow)
  })

  it('registers expected channels', () => {
    expect([...handlers.keys()]).toEqual([
      'ralph:launch',
      'ralph:stop',
      'ralph:list',
      'ralph:get-status',
      'ralph:get-config',
      'ralph:get-scripts-path',
      'ralph:list-templates',
      'ralph:select-directory',
    ])
  })

  it('delegates loop operations to the Ralph service', async () => {
    const service = await import('../services/ralphService')
    const config = { script: 'audit.sh', repo: '/repos/test' }

    await expect(handlers.get('ralph:launch')!({}, config)).resolves.toEqual({
      runId: 'run-1',
      status: 'running',
    })
    await handlers.get('ralph:stop')!({}, 'run-1')
    await expect(handlers.get('ralph:list')!({})).resolves.toEqual([
      { runId: 'run-1', status: 'running' },
    ])
    await expect(handlers.get('ralph:get-status')!({}, 'run-1')).resolves.toEqual({
      runId: 'run-1',
      status: 'completed',
    })

    expect(service.launchLoop).toHaveBeenCalledWith(config)
    expect(service.stopLoop).toHaveBeenCalledWith('run-1')
    expect(service.getLoopStatus).toHaveBeenCalledWith('run-1')
  })

  it('delegates Ralph configuration operations', async () => {
    const service = await import('../services/ralphService')

    await expect(handlers.get('ralph:get-config')!({}, 'global')).resolves.toEqual({
      scripts: '/path/to/scripts',
    })
    await expect(handlers.get('ralph:get-scripts-path')!({})).resolves.toBe(
      '/home/user/.ralph/scripts'
    )
    await expect(handlers.get('ralph:list-templates')!({})).resolves.toEqual([
      'audit.sh',
      'deploy.sh',
    ])

    expect(service.getConfig).toHaveBeenCalledWith('global')
    expect(service.getScriptsPath).toHaveBeenCalled()
    expect(service.listTemplateScripts).toHaveBeenCalled()
  })

  it('opens the directory dialog against the invoking window', async () => {
    const sender = {} as Electron.WebContents
    const result = await handlers.get('ralph:select-directory')!({ sender }, '/default')

    expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(sender)
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(initialWindow, {
      properties: ['openDirectory'],
      title: 'Select Repository',
      defaultPath: '/default',
    })
    expect(result).toBe('/repos/my-project')
  })

  it('returns null when directory selection is canceled', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })

    await expect(handlers.get('ralph:select-directory')!({ sender: {} })).resolves.toBeNull()
  })

  it('rejects directory selection without an attached sender window', async () => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)

    await expect(handlers.get('ralph:select-directory')!({ sender: {} })).rejects.toThrow(
      'IPC sender is not attached to a BrowserWindow'
    )
  })

  it('delivers status changes to the recreated current window', async () => {
    const { setStatusChangeCallback } = await import('../services/ralphService')
    const callback = vi.mocked(setStatusChangeCallback).mock.calls.at(0)?.[0]
    const recreatedWindow = mockWindow()
    const run = { runId: 'run-1', status: 'completed' } as RalphRunInfo
    currentWindow = recreatedWindow

    if (!callback) throw new Error('setStatusChangeCallback was not registered')
    callback(run)

    expect(initialWindow.webContents.send).not.toHaveBeenCalled()
    expect(recreatedWindow.webContents.send).toHaveBeenCalledWith('ralph:status-update', run)
  })

  it('skips status delivery when no current window exists', async () => {
    const { setStatusChangeCallback } = await import('../services/ralphService')
    const callback = vi.mocked(setStatusChangeCallback).mock.calls.at(0)?.[0]
    currentWindow = null

    if (!callback) throw new Error('setStatusChangeCallback was not registered')
    callback({ runId: 'run-1', status: 'completed' } as RalphRunInfo)

    expect(initialWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('skips status delivery when the current window is destroyed', async () => {
    const { setStatusChangeCallback } = await import('../services/ralphService')
    const callback = vi.mocked(setStatusChangeCallback).mock.calls.at(0)?.[0]
    vi.mocked(initialWindow.isDestroyed).mockReturnValue(true)

    if (!callback) throw new Error('setStatusChangeCallback was not registered')
    callback({ runId: 'run-1', status: 'completed' } as RalphRunInfo)

    expect(initialWindow.webContents.send).not.toHaveBeenCalled()
  })
})
