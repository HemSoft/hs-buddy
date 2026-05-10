import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLaunchLoop = vi.fn().mockResolvedValue({ runId: 'run-1', status: 'running' })
const mockStopLoop = vi.fn().mockResolvedValue({ success: true })
const mockListLoops = vi.fn().mockResolvedValue([{ runId: 'run-1', status: 'running' }])
const mockGetLoopStatus = vi.fn().mockResolvedValue({ runId: 'run-1', status: 'completed' })
const mockGetConfig = vi.fn().mockResolvedValue({ version: '1.0.0' })
const mockGetScriptsPath = vi.fn().mockResolvedValue('C:\\ralph\\scripts')
const mockListTemplateScripts = vi.fn().mockResolvedValue([{ filename: 'audit.ps1' }])
const mockSetStatusChangeCallback = vi.fn()

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePaths: ['C:\\repos\\my-project'] }),
  },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('./ipcHandler', () => ({
  ipcHandler: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('../services/ralphService', () => ({
  launchLoop: (...args: unknown[]) => mockLaunchLoop(...args),
  stopLoop: (...args: unknown[]) => mockStopLoop(...args),
  listLoops: (...args: unknown[]) => mockListLoops(...args),
  getLoopStatus: (...args: unknown[]) => mockGetLoopStatus(...args),
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  getScriptsPath: (...args: unknown[]) => mockGetScriptsPath(...args),
  listTemplateScripts: (...args: unknown[]) => mockListTemplateScripts(...args),
  setStatusChangeCallback: (...args: unknown[]) => mockSetStatusChangeCallback(...args),
}))

import { ipcMain, dialog } from 'electron'
import { registerRalphHandlers } from './ralphHandlers'
import { IPC_PUSH } from '../../src/ipc/contracts'

describe('ralphHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  const mockWin = {
    isDestroyed: vi.fn(),
    webContents: { send: vi.fn() },
  } as unknown as Electron.BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    mockWin.isDestroyed.mockReturnValue(false)
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

  it('pushes status updates when the window is alive', () => {
    const callback = mockSetStatusChangeCallback.mock.calls[0][0] as (run: unknown) => void
    const run = { runId: 'run-1', status: 'running' }

    callback(run)

    expect(mockWin.webContents.send).toHaveBeenCalledWith(IPC_PUSH.RALPH_STATUS_UPDATE, run)
  })

  it('does not push status updates when the window is destroyed', () => {
    const callback = mockSetStatusChangeCallback.mock.calls[0][0] as (run: unknown) => void
    mockWin.isDestroyed.mockReturnValue(true)

    callback({ runId: 'run-1', status: 'running' })

    expect(mockWin.webContents.send).not.toHaveBeenCalled()
  })

  it('ralph:launch delegates to launchLoop', async () => {
    const handler = handlers.get('ralph:launch')!
    const config = { script: 'audit.sh', repo: 'C:\\repos\\test' }
    const result = await handler({}, config)
    expect(mockLaunchLoop).toHaveBeenCalledWith(config)
    expect(result).toEqual({ runId: 'run-1', status: 'running' })
  })

  it('ralph:stop delegates to stopLoop', async () => {
    const handler = handlers.get('ralph:stop')!
    await handler({}, 'run-1')
    expect(mockStopLoop).toHaveBeenCalledWith('run-1')
  })

  it('ralph:list returns loops list', async () => {
    const handler = handlers.get('ralph:list')!
    const result = await handler({})
    expect(result).toEqual([{ runId: 'run-1', status: 'running' }])
  })

  it('ralph:get-status delegates to getLoopStatus', async () => {
    const handler = handlers.get('ralph:get-status')!
    const result = await handler({}, 'run-1')

    expect(mockGetLoopStatus).toHaveBeenCalledWith('run-1')
    expect(result).toEqual({ runId: 'run-1', status: 'completed' })
  })

  it('ralph:get-config delegates to getConfig', async () => {
    const handler = handlers.get('ralph:get-config')!
    const result = await handler({}, 'models')

    expect(mockGetConfig).toHaveBeenCalledWith('models')
    expect(result).toEqual({ version: '1.0.0' })
  })

  it('ralph:get-scripts-path delegates to getScriptsPath', async () => {
    const handler = handlers.get('ralph:get-scripts-path')!
    const result = await handler({})

    expect(mockGetScriptsPath).toHaveBeenCalled()
    expect(result).toBe('C:\\ralph\\scripts')
  })

  it('ralph:list-templates delegates to listTemplateScripts', async () => {
    const handler = handlers.get('ralph:list-templates')!
    const result = await handler({})

    expect(mockListTemplateScripts).toHaveBeenCalled()
    expect(result).toEqual([{ filename: 'audit.ps1' }])
  })

  it('ralph:select-directory opens dialog and returns path', async () => {
    const handler = handlers.get('ralph:select-directory')!
    const result = await handler({}, 'C:\\default')
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      mockWin,
      expect.objectContaining({ defaultPath: 'C:\\default', title: 'Select Repository' })
    )
    expect(result).toBe('C:\\repos\\my-project')
  })

  it('ralph:select-directory returns null when dialog is canceled', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    const handler = handlers.get('ralph:select-directory')!
    const result = await handler({})
    expect(result).toBeNull()
  })
})
