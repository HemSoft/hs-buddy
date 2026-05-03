import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => {
    throw new Error('ENOENT')
  }),
  createReadStream: vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
  })),
}))

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
    close: vi.fn(),
  })),
}))

vi.mock('../../src/utils/copilotSessionParsing', () => ({
  parseKeyPath: vi.fn(() => null),
  resolveFolderOrWorkspaceName: vi.fn(() => 'test-workspace'),
  parseScanChunk: vi.fn(() => null),
  processSessionLine: vi.fn(),
}))

vi.mock('../../src/utils/sessionDigest', () => ({
  aggregateResults: vi.fn(() => ({ totalTokens: 100 })),
}))

import { getVSCodeStoragePath, resolveWorkspaceName } from './copilotSessionService'

describe('copilotSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getVSCodeStoragePath returns a string', () => {
    const result = getVSCodeStoragePath()
    expect(typeof result).toBe('string')
  })

  it('resolveWorkspaceName returns basename when workspace.json read fails', () => {
    const name = resolveWorkspaceName('/workspaces/abc123')
    expect(name).toBe('abc123')
  })
})
