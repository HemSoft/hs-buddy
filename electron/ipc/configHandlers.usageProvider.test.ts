import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
}))

vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), stat: vi.fn() }))

vi.mock('../config', () => ({
  configManager: { hasGitHubAccount: vi.fn(() => true), setUsageProviderOverride: vi.fn() },
}))

import { ipcMain } from 'electron'
import { configManager } from '../config'
import { registerConfigHandlers } from './configHandlers'

const setUsageProviderOverride = vi.mocked(configManager.setUsageProviderOverride)
const hasGitHubAccount = vi.mocked(configManager.hasGitHubAccount)

describe('usage provider override config handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (...args: any[]) => any

  beforeEach(() => {
    vi.clearAllMocks()
    hasGitHubAccount.mockReset().mockReturnValue(true)
    vi.mocked(ipcMain.handle).mockImplementation((channel, registeredHandler) => {
      if (channel === 'config:set-usage-provider-override') handler = registeredHandler
    })
    registerConfigHandlers()
  })

  it('persists a valid local provider', () => {
    expect(handler({}, 'HemSoft', 'HemSoft', 'codex')).toEqual({ success: true })
    expect(setUsageProviderOverride).toHaveBeenCalledWith('HemSoft', 'HemSoft', 'codex')
  })

  it('clears a local provider when Convex becomes authoritative', () => {
    hasGitHubAccount.mockReturnValue(false)
    expect(handler({}, 'HemSoft', 'HemSoft', null)).toEqual({ success: true })
    expect(setUsageProviderOverride).toHaveBeenCalledWith('HemSoft', 'HemSoft', null)
  })

  it('rejects a provider for an account that is not configured locally', () => {
    hasGitHubAccount.mockReturnValue(false)

    expect(handler({}, 'HemSoft', 'HemSoft', 'codex')).toEqual({
      success: false,
      error: 'Account is not configured locally',
    })
    expect(setUsageProviderOverride).not.toHaveBeenCalled()
  })

  it('rejects invalid identities and providers', () => {
    expect(handler({}, 'bad/name', 'HemSoft', 'codex')).toMatchObject({ success: false })
    expect(handler({}, 'HemSoft', 'HemSoft', 'other')).toEqual({
      success: false,
      error: 'Usage provider must be Copilot or Codex',
    })
    expect(setUsageProviderOverride).not.toHaveBeenCalled()
  })
})
