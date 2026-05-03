import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('../../src/utils/detectLanguage', () => ({
  detectLanguage: vi.fn(() => 'typescript'),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessageWithFallback: vi.fn((err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback
  ),
}))

vi.mock('../../src/utils/dirEntryUtils', () => ({
  shouldIncludeDirEntry: vi.fn(() => true),
  compareDirEntries: vi.fn((a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name)
  ),
}))

import { ipcMain } from 'electron'
import { readdir, readFile, stat } from 'node:fs/promises'
import { registerFilesystemHandlers } from './filesystemHandlers'

describe('filesystemHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerFilesystemHandlers()
  })

  it('registers expected channels', () => {
    expect(handlers.has('fs:read-dir')).toBe(true)
    expect(handlers.has('fs:read-file')).toBe(true)
  })

  describe('fs:read-dir', () => {
    const invoke = (dirPath: string) => handlers.get('fs:read-dir')!({}, dirPath)

    it('returns directory entries sorted', async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: 'b.ts', isDirectory: () => false },
        { name: 'a.ts', isDirectory: () => false },
      ] as never)
      vi.mocked(stat).mockResolvedValue({ size: 100, isFile: () => true } as never)

      const result = await invoke('/some/path')
      expect(result.entries).toHaveLength(2)
      expect(result.entries[0].name).toBe('a.ts')
      expect(result.entries[1].name).toBe('b.ts')
      expect(result.error).toBeUndefined()
    })

    it('returns error when readdir fails', async () => {
      vi.mocked(readdir).mockRejectedValue(new Error('ENOENT'))
      const result = await invoke('/nonexistent')
      expect(result.entries).toEqual([])
      expect(result.error).toBe('ENOENT')
    })
  })

  describe('fs:read-file', () => {
    const invoke = (filePath: string) => handlers.get('fs:read-file')!({}, filePath)

    it('reads file content and detects language', async () => {
      vi.mocked(stat).mockResolvedValue({ size: 50, isFile: () => true } as never)
      vi.mocked(readFile).mockResolvedValue('const x = 1;')

      const result = await invoke('/some/file.ts')
      expect(result.content).toBe('const x = 1;')
      expect(result.language).toBe('typescript')
      expect(result.size).toBe(50)
      expect(result.error).toBeUndefined()
    })

    it('returns error for binary files', async () => {
      const result = await invoke('/some/image.png')
      expect(result.content).toBe('')
      expect(result.language).toBe('binary')
      expect(result.error).toBe('Binary file — cannot preview')
    })

    it('returns error for files exceeding 1MB', async () => {
      vi.mocked(stat).mockResolvedValue({ size: 2_000_000, isFile: () => true } as never)
      const result = await invoke('/some/large.ts')
      expect(result.content).toBe('')
      expect(result.error).toContain('File too large')
    })

    it('returns error when stat fails', async () => {
      vi.mocked(stat).mockRejectedValue(new Error('Permission denied'))
      const result = await invoke('/no/access.ts')
      expect(result.content).toBe('')
      expect(result.error).toBe('Permission denied')
    })
  })
})
