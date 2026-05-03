import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  originalHandle,
  mockWithSpan,
  mockRecordIpcCall,
  mockEmitLog,
  mockClassifyIpcResult,
  mockApplyIpcSpanAttributes,
} = vi.hoisted(() => ({
  originalHandle: vi.fn(),
  mockWithSpan: vi.fn(async (_name: unknown, _attrs: unknown, fn: (span: unknown) => unknown) => {
    const mockSpan = { setAttribute: vi.fn() }
    return fn(mockSpan)
  }),
  mockRecordIpcCall: vi.fn(),
  mockEmitLog: vi.fn(),
  mockClassifyIpcResult: vi.fn(() => 'success'),
  mockApplyIpcSpanAttributes: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: originalHandle,
  },
}))

vi.mock('../telemetry', () => ({
  withSpan: (...args: unknown[]) => (mockWithSpan as (...a: unknown[]) => unknown)(...args),
  recordIpcCall: (...args: unknown[]) => mockRecordIpcCall(...args),
  emitLog: (...args: unknown[]) => mockEmitLog(...args),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  getErrorStack: vi.fn((err: unknown) => (err instanceof Error ? err.stack : undefined)),
}))

vi.mock('../../src/utils/ipcClassification', () => ({
  classifyIpcResult: (...args: unknown[]) =>
    (mockClassifyIpcResult as (...a: unknown[]) => unknown)(...args),
  applyIpcSpanAttributes: (...args: unknown[]) =>
    (mockApplyIpcSpanAttributes as (...a: unknown[]) => unknown)(...args),
}))

import { ipcMain } from 'electron'
import { instrumentIpcHandlers } from './instrumentIpc'

describe('instrumentIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('patches ipcMain.handle to wrap handlers with telemetry', () => {
    instrumentIpcHandlers()
    // After instrumentation, ipcMain.handle should be replaced with the wrapping function
    expect(ipcMain.handle).not.toBe(originalHandle)
  })

  it('is idempotent — calling twice does not double-patch', () => {
    instrumentIpcHandlers()
    const afterFirst = ipcMain.handle
    instrumentIpcHandlers()
    const afterSecond = ipcMain.handle
    expect(afterFirst).toBe(afterSecond)
  })

  it('wrapped handle invokes withSpan and recordIpcCall on success', async () => {
    instrumentIpcHandlers()

    // The patched ipcMain.handle delegates to originalHandle with a wrapped listener
    const patchedHandle = ipcMain.handle as unknown as (
      channel: string,
      listener: (...args: unknown[]) => unknown
    ) => void

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let registeredListener: any
    originalHandle.mockImplementation((_channel: unknown, listener: unknown) => {
      registeredListener = listener
    })

    const userHandler = vi.fn().mockResolvedValue({ data: 'ok' })
    patchedHandle('test:channel', userHandler)

    // Simulate invoking the wrapped handler
    const mockEvent = {} as Electron.IpcMainInvokeEvent
    const result = await registeredListener(mockEvent, 'arg1', 'arg2')

    expect(result).toEqual({ data: 'ok' })
    expect(mockWithSpan).toHaveBeenCalledWith(
      'ipc/test:channel',
      { 'ipc.channel': 'test:channel' },
      expect.any(Function)
    )
    expect(mockRecordIpcCall).toHaveBeenCalledWith('test:channel', expect.any(Number), false)
    expect(mockClassifyIpcResult).toHaveBeenCalledWith({ data: 'ok' })
    expect(mockApplyIpcSpanAttributes).toHaveBeenCalled()
  })

  it('wrapped handle logs error and re-throws on handler failure', async () => {
    instrumentIpcHandlers()

    const patchedHandle = ipcMain.handle as unknown as (
      channel: string,
      listener: (...args: unknown[]) => unknown
    ) => void

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let registeredListener: any
    originalHandle.mockImplementation((_channel: unknown, listener: unknown) => {
      registeredListener = listener
    })

    const testError = new Error('Handler exploded')
    mockWithSpan.mockRejectedValueOnce(testError)

    const userHandler = vi.fn()
    patchedHandle('test:failing', userHandler)

    const mockEvent = {} as Electron.IpcMainInvokeEvent
    await expect(registeredListener(mockEvent)).rejects.toThrow('Handler exploded')

    expect(mockEmitLog).toHaveBeenCalledWith(
      'ERROR',
      'IPC handler failed: test:failing',
      expect.objectContaining({ 'ipc.channel': 'test:failing' })
    )
    expect(mockRecordIpcCall).toHaveBeenCalledWith('test:failing', expect.any(Number), true)
  })
})
