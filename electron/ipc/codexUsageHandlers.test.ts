import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_INVOKE } from '../../src/ipc/contracts'

const { handle, fetchCodexUsage } = vi.hoisted(() => ({
  handle: vi.fn(),
  fetchCodexUsage: vi.fn(),
}))

vi.mock('electron', () => ({ ipcMain: { handle } }))
vi.mock('../services/codexUsageService', () => ({ fetchCodexUsage }))

import { registerCodexUsageHandlers } from './codexUsageHandlers'

describe('registerCodexUsageHandlers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers a credential-safe Codex usage invoke handler', async () => {
    const expected = { success: false, error: 'Sign in.' }
    fetchCodexUsage.mockResolvedValue(expected)
    registerCodexUsageHandlers()

    expect(handle).toHaveBeenCalledWith(IPC_INVOKE.CODEX_GET_USAGE, expect.any(Function))
    const handler = handle.mock.calls[0][1]
    await expect(handler()).resolves.toEqual(expected)
  })
})
