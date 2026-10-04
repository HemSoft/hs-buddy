import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
}))

vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), stat: vi.fn() }))

vi.mock('../config', () => ({
  configManager: {
    hasGitHubAccount: vi.fn(() => true),
    getUsageProviderOverrides: vi.fn(() => ({ 'hemsoft/hemsoft': 'codex' })),
    getUsageProviderDefaultOverrides: vi.fn(() => ({ 'hemsoft/hemsoft': 'codex' })),
    replaceGitHubAccounts: vi.fn(),
    setUsageProviderOverride: vi.fn(),
  },
}))

import { ipcMain } from 'electron'
import { configManager } from '../config'
import { registerConfigHandlers } from './configHandlers'

const setUsageProviderOverride = vi.mocked(configManager.setUsageProviderOverride)
const hasGitHubAccount = vi.mocked(configManager.hasGitHubAccount)
const getUsageProviderOverrides = vi.mocked(configManager.getUsageProviderOverrides)
const getUsageProviderDefaultOverrides = vi.mocked(configManager.getUsageProviderDefaultOverrides)
const replaceGitHubAccounts = vi.mocked(configManager.replaceGitHubAccounts)
const seededProviderSnapshot = { 'hemsoft/hemsoft': 'codex' as const }

function seedProviderSnapshotsAfterUnassignedMirror() {
  getUsageProviderOverrides.mockReturnValue({})
  getUsageProviderDefaultOverrides.mockReturnValue({})
  replaceGitHubAccounts.mockImplementationOnce(accounts => {
    if (accounts[0]?.usageProvider === undefined) {
      getUsageProviderOverrides.mockReturnValue(seededProviderSnapshot)
      getUsageProviderDefaultOverrides.mockReturnValue(seededProviderSnapshot)
    }
  })
}

type TestHandler = (...args: unknown[]) => unknown
let handler: TestHandler
let syncHandler: TestHandler

beforeEach(() => {
  vi.clearAllMocks()
  hasGitHubAccount.mockReset().mockReturnValue(true)
  getUsageProviderOverrides.mockReturnValue({ 'hemsoft/hemsoft': 'codex' })
  getUsageProviderDefaultOverrides.mockReturnValue({ 'hemsoft/hemsoft': 'codex' })
  vi.mocked(ipcMain.handle).mockImplementation((channel, registeredHandler) => {
    if (channel === 'config:set-usage-provider-override') handler = registeredHandler as TestHandler
    if (channel === 'config:sync-github-accounts') syncHandler = registeredHandler as TestHandler
  })
  registerConfigHandlers()
})

describe('usage provider override config handler', () => {
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

  it('returns reconciled provider snapshots while mirroring an unassigned account', () => {
    seedProviderSnapshotsAfterUnassignedMirror()

    expect(
      syncHandler({}, [
        {
          username: 'HemSoft',
          org: 'HemSoft',
          repoRoot: 'D:\\github\\HemSoft',
          ignored: 'value',
        },
      ])
    ).toEqual({
      success: true,
      usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
      usageProviderDefaultOverrides: { 'hemsoft/hemsoft': 'codex' },
    })
    expect(replaceGitHubAccounts).toHaveBeenCalledWith([
      {
        username: 'HemSoft',
        org: 'HemSoft',
        repoRoot: 'D:\\github\\HemSoft',
      },
    ])
  })
})

describe('usage provider account snapshot validation', () => {
  it.each([undefined, 'copilot', 'codex'] as const)(
    'accepts optional snapshot provider %s and persists only the validated account',
    usageProvider => {
      const account = {
        username: 'alice',
        org: 'acme',
        ...(usageProvider ? { usageProvider } : {}),
      }
      expect(syncHandler({}, [{ ...account, ignored: 'discard me' }])).toEqual({
        success: true,
        usageProviderOverrides: { 'hemsoft/hemsoft': 'codex' },
        usageProviderDefaultOverrides: { 'hemsoft/hemsoft': 'codex' },
      })
      expect(replaceGitHubAccounts).toHaveBeenCalledExactlyOnceWith([account])
    }
  )

  it.each(['unsupported', '', null, 42, true, {}, []])(
    'rejects snapshot provider %j before any config mutation, including a preceding valid account',
    usageProvider => {
      expect(
        syncHandler({}, [
          { username: 'valid', org: 'acme', usageProvider: 'copilot' },
          { username: 'invalid', org: 'acme', usageProvider },
        ])
      ).toEqual({ success: false, error: 'Usage provider must be Copilot or Codex' })
      expect(replaceGitHubAccounts).not.toHaveBeenCalled()
      expect(setUsageProviderOverride).not.toHaveBeenCalled()
    }
  )

  it('rejects invalid account snapshots', () => {
    expect(syncHandler({}, [{ username: 'bad/name', org: 'HemSoft' }])).toMatchObject({
      success: false,
    })
    expect(syncHandler({}, 'not-an-array')).toEqual({
      success: false,
      error: 'GitHub accounts must be an array',
    })
    expect(replaceGitHubAccounts).not.toHaveBeenCalled()
  })
})
