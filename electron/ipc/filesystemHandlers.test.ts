import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('../services/fileSnapshots', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/fileSnapshots')>()),
  readFileSnapshot: vi.fn(),
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
import { readdir, stat } from 'node:fs/promises'
import { registerFilesystemHandlers } from './filesystemHandlers'
import { FileTooLargeError, readFileSnapshot } from '../services/fileSnapshots'

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

    it('skips entries excluded by shouldIncludeDirEntry', async () => {
      const { shouldIncludeDirEntry } = await import('../../src/utils/dirEntryUtils')
      vi.mocked(shouldIncludeDirEntry)
        .mockReturnValueOnce(false) // skip first
        .mockReturnValueOnce(true) // include second

      vi.mocked(readdir).mockResolvedValue([
        { name: 'node_modules', isDirectory: () => true },
        { name: 'src', isDirectory: () => true },
      ] as never)
      vi.mocked(stat).mockResolvedValue({ size: 0, isFile: () => false } as never)

      const result = await invoke('/project')
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].name).toBe('src')
    })

    it('skips entries that fail stat', async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: 'good.ts', isDirectory: () => false },
        { name: 'broken.ts', isDirectory: () => false },
      ] as never)
      vi.mocked(stat)
        .mockResolvedValueOnce({ size: 50 } as never)
        .mockRejectedValueOnce(new Error('Permission denied'))

      const result = await invoke('/project')
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].name).toBe('good.ts')
      expect(result.error).toBeUndefined()
    })
  })

  describe('fs:read-file', () => {
    const invoke = (filePath: string) => handlers.get('fs:read-file')!({}, filePath)

    it('reads file content and detects language', async () => {
      vi.mocked(readFileSnapshot).mockResolvedValue({
        data: Buffer.from('const x = 1;'),
        stats: { size: 50 } as never,
      })

      const result = await invoke('/some/file.ts')
      expect(result.content).toBe('const x = 1;')
      expect(result.language).toBe('typescript')
      expect(result.size).toBe(Buffer.byteLength('const x = 1;'))
      expect(readFileSnapshot).toHaveBeenCalledWith(expect.stringContaining('file.ts'), 1_048_576)
      expect(result.error).toBeUndefined()
    })

    it('returns error for binary files', async () => {
      const result = await invoke('/some/image.png')
      expect(result.content).toBe('')
      expect(result.language).toBe('binary')
      expect(result.error).toBe('Binary file — cannot preview')
    })

    it('returns error for files exceeding 1MB', async () => {
      vi.mocked(readFileSnapshot).mockRejectedValue(new FileTooLargeError(2_000_000))
      const result = await invoke('/some/large.ts')
      expect(result.content).toBe('')
      expect(result.error).toContain('File too large')
    })

    it('returns error when the opened-file read fails', async () => {
      vi.mocked(readFileSnapshot).mockRejectedValue(new Error('Permission denied'))
      const result = await invoke('/no/access.ts')
      expect(result.content).toBe('')
      expect(result.error).toBe('Permission denied')
    })
  })
})
