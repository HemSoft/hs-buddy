import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-app') },
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
}))

const mockExistsSync = vi.fn().mockReturnValue(false)
const mockReadFileSync = vi.fn().mockReturnValue('[]')
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}))

const mockExecFileCb = vi.fn()
const mockExecFileAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ stdout: '' }))

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFileCb(...args),
}))

vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecFileAsync),
}))

vi.mock('../../src/utils/githubUrl', () => ({
  parseGitRemote: vi.fn(() => null),
  isGitHubHost: vi.fn(() => false),
}))

import { dialog } from 'electron'
import { parseGitRemote, isGitHubHost } from '../../src/utils/githubUrl'
import {
  addProjectFromPicker,
  listProjects,
  removeProject,
  getSession,
  clearSession,
  createOrGetSession,
  addMessageToSession,
  updateSessionStatus,
  updateSessionChangedFiles,
  undoFile,
} from './crewService'

describe('crewService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('[]')
    mockExecFileAsync.mockReset().mockResolvedValue({ stdout: '' })
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    vi.mocked(parseGitRemote).mockReturnValue(null)
    vi.mocked(isGitHubHost).mockReturnValue(false)
  })

  describe('listProjects', () => {
    it('returns empty array when no projects file exists', () => {
      const result = listProjects()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it('returns parsed projects from file', () => {
      mockExistsSync.mockReturnValue(true)
      const projects = [{ id: 'proj-1', displayName: 'Test', localPath: '/tmp' }]
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))

      const result = listProjects()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('proj-1')
    })

    it('returns empty array on JSON parse error', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not valid json{{{')

      const result = listProjects()
      expect(result).toHaveLength(0)
    })
  })

  describe('removeProject', () => {
    it('returns false for unknown project', () => {
      const result = removeProject('nonexistent')
      expect(result).toBe(false)
    })

    it('removes project and writes updated list', () => {
      mockExistsSync.mockReturnValue(true)
      const projects = [
        { id: 'proj-1', displayName: 'Test1' },
        { id: 'proj-2', displayName: 'Test2' },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))

      const result = removeProject('proj-1')
      expect(result).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalled()
      const writtenData = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(writtenData).toHaveLength(1)
      expect(writtenData[0].id).toBe('proj-2')
    })
  })

  describe('getSession', () => {
    it('returns null for unknown project', () => {
      const result = getSession('nonexistent')
      expect(result).toBeNull()
    })

    it('returns session when found', () => {
      mockExistsSync.mockReturnValue(true)
      const sessions = [{ id: 'sess-1', projectId: 'proj-1', status: 'idle' }]
      mockReadFileSync.mockReturnValue(JSON.stringify(sessions))

      const result = getSession('proj-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('sess-1')
    })
  })

  describe('createOrGetSession', () => {
    it('creates a new session when none exists', () => {
      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('[]')

      const session = createOrGetSession('proj-new')
      expect(session.projectId).toBe('proj-new')
      expect(session.status).toBe('idle')
      expect(session.conversationHistory).toEqual([])
      expect(session.changedFiles).toEqual([])
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('returns existing session if found', () => {
      mockExistsSync.mockReturnValue(true)
      const existing = [
        {
          id: 'sess-existing',
          projectId: 'proj-1',
          status: 'active',
          conversationHistory: [{ role: 'user', content: 'hello' }],
          changedFiles: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(existing))

      const session = createOrGetSession('proj-1')
      expect(session.id).toBe('sess-existing')
      expect(session.status).toBe('active')
    })
  })

  describe('addMessageToSession', () => {
    it('returns null when session does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const result = addMessageToSession('nonexistent', {
        role: 'user',
        content: 'hi',
      } as Parameters<typeof addMessageToSession>[1])
      expect(result).toBeNull()
    })

    it('appends message to existing session', () => {
      mockExistsSync.mockReturnValue(true)
      const sessions = [
        {
          id: 'sess-1',
          projectId: 'proj-1',
          status: 'idle',
          conversationHistory: [],
          changedFiles: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(sessions))

      const result = addMessageToSession('proj-1', {
        role: 'user',
        content: 'test message',
      } as Parameters<typeof addMessageToSession>[1])
      expect(result).not.toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(written[0].conversationHistory).toHaveLength(1)
      expect(written[0].conversationHistory[0].content).toBe('test message')
    })
  })

  describe('updateSessionStatus', () => {
    it('returns null when session does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const result = updateSessionStatus('nonexistent', 'active')
      expect(result).toBeNull()
    })

    it('updates status of existing session', () => {
      mockExistsSync.mockReturnValue(true)
      const sessions = [
        {
          id: 'sess-1',
          projectId: 'proj-1',
          status: 'idle',
          conversationHistory: [],
          changedFiles: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(sessions))

      const result = updateSessionStatus('proj-1', 'active')
      expect(result).not.toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(written[0].status).toBe('active')
    })
  })

  describe('updateSessionChangedFiles', () => {
    it('updates changed files for session', () => {
      mockExistsSync.mockReturnValue(true)
      const sessions = [
        {
          id: 'sess-1',
          projectId: 'proj-1',
          status: 'idle',
          conversationHistory: [],
          changedFiles: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(sessions))

      const files = [{ filePath: 'src/main.ts', status: 'modified' }]
      const result = updateSessionChangedFiles(
        'proj-1',
        files as Parameters<typeof updateSessionChangedFiles>[1]
      )
      expect(result).not.toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(written[0].changedFiles).toHaveLength(1)
      expect(written[0].changedFiles[0].filePath).toBe('src/main.ts')
    })
  })

  describe('clearSession', () => {
    it('returns false for unknown project', () => {
      const result = clearSession('nonexistent')
      expect(result).toBe(false)
    })

    it('removes session and writes updated list', () => {
      mockExistsSync.mockReturnValue(true)
      const sessions = [
        {
          id: 'sess-1',
          projectId: 'proj-1',
          status: 'idle',
          conversationHistory: [],
          changedFiles: [],
        },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(sessions))

      const result = clearSession('proj-1')
      expect(result).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalled()
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(written).toHaveLength(0)
    })
  })

  describe('addProjectFromPicker', () => {
    function mockValidFolderSelection(): void {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['D:\\test\\repo'],
      })
      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--show-toplevel')) return { stdout: 'D:\\test\\repo' }
        if (args.includes('get-url')) return { stdout: 'https://github.com/owner/repo.git' }
        if (args.includes('symbolic-ref')) return { stdout: 'origin/main' }
        return { stdout: '' }
      })
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'github.com',
        slug: 'owner/repo',
        scheme: 'https',
      })
      vi.mocked(isGitHubHost).mockReturnValue(true)
    }

    it('returns cancelled when dialog is cancelled', async () => {
      await expect(addProjectFromPicker()).resolves.toEqual({
        success: false,
        error: 'Cancelled',
      })
    })

    it('returns an error when folder is not a git repository', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['D:\\test\\repo'],
      })
      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--show-toplevel')) {
          throw new Error('not a repo')
        }
        return { stdout: '' }
      })

      await expect(addProjectFromPicker()).resolves.toEqual({
        success: false,
        error: 'Not a git repository',
      })
    })

    it('returns an error when no origin remote exists', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['D:\\test\\repo'],
      })
      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--show-toplevel')) return { stdout: 'D:\\test\\repo' }
        if (args.includes('get-url')) {
          throw new Error('missing origin')
        }
        return { stdout: '' }
      })

      await expect(addProjectFromPicker()).resolves.toEqual({
        success: false,
        error: 'No origin remote found',
      })
    })

    it('returns an error when origin remote is not GitHub', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['D:\\test\\repo'],
      })
      mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('--show-toplevel')) return { stdout: 'D:\\test\\repo' }
        if (args.includes('get-url')) return { stdout: 'https://gitlab.com/owner/repo.git' }
        return { stdout: '' }
      })
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'gitlab.com',
        slug: 'owner/repo',
        scheme: 'https',
      })

      await expect(addProjectFromPicker()).resolves.toEqual({
        success: false,
        error: 'Origin remote is not a GitHub repository',
      })
    })

    it('returns the existing project and updates lastOpenedAt', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
      try {
        mockValidFolderSelection()
        mockExistsSync.mockReturnValue(true)
        mockReadFileSync.mockReturnValue(
          JSON.stringify([
            {
              id: 'proj-1',
              displayName: 'repo',
              localPath: 'D:\\test\\repo',
              gitRoot: 'D:\\test\\repo',
              githubSlug: 'owner/repo',
              defaultBranch: 'main',
              lastOpenedAt: 123,
              lastActiveAt: 456,
            },
          ])
        )

        const result = await addProjectFromPicker()

        expect(result).toEqual({
          success: true,
          project: {
            id: 'proj-1',
            displayName: 'repo',
            localPath: 'D:\\test\\repo',
            gitRoot: 'D:\\test\\repo',
            githubSlug: 'owner/repo',
            defaultBranch: 'main',
            lastOpenedAt: 1_700_000_000_000,
            lastActiveAt: 456,
          },
        })
        expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
        const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
        expect(written[0].lastOpenedAt).toBe(1_700_000_000_000)
      } finally {
        nowSpy.mockRestore()
      }
    })

    it('returns a new project when folder is valid and not already added', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456)
      try {
        mockValidFolderSelection()

        const result = await addProjectFromPicker()

        expect(result).toEqual({
          success: true,
          project: expect.objectContaining({
            id: expect.stringMatching(/^crew-1700000000000-/),
            displayName: 'repo',
            localPath: 'D:\\test\\repo',
            gitRoot: 'D:\\test\\repo',
            githubSlug: 'owner/repo',
            defaultBranch: 'main',
            lastOpenedAt: 1_700_000_000_000,
            lastActiveAt: 1_700_000_000_000,
          }),
        })
        expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
        const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
        expect(written).toHaveLength(1)
        expect(written[0]).toEqual(
          expect.objectContaining({
            displayName: 'repo',
            gitRoot: 'D:\\test\\repo',
            githubSlug: 'owner/repo',
            defaultBranch: 'main',
          })
        )
      } finally {
        nowSpy.mockRestore()
        randomSpy.mockRestore()
      }
    })
  })

  describe('undoFile', () => {
    it('returns false when the project does not exist', async () => {
      await expect(undoFile('missing-project', 'src/file.ts')).resolves.toBe(false)
    })

    it('returns false when git checkout fails', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation((filePath: unknown) => {
        if (String(filePath).includes('projects.json')) {
          return JSON.stringify([{ id: 'proj-1', gitRoot: 'D:\\test\\repo' }])
        }
        return '[]'
      })
      mockExecFileAsync.mockRejectedValue(new Error('git checkout failed'))

      await expect(undoFile('proj-1', 'src/file.ts')).resolves.toBe(false)
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it('returns true and removes the file from the session on success', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation((filePath: unknown) => {
        if (String(filePath).includes('projects.json')) {
          return JSON.stringify([{ id: 'proj-1', gitRoot: 'D:\\test\\repo' }])
        }
        if (String(filePath).includes('sessions.json')) {
          return JSON.stringify([
            {
              id: 'sess-1',
              projectId: 'proj-1',
              changedFiles: [
                { filePath: 'src/file.ts', status: 'modified' },
                { filePath: 'src/keep.ts', status: 'modified' },
              ],
              conversationHistory: [],
            },
          ])
        }
        return '[]'
      })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await expect(undoFile('proj-1', 'src/file.ts')).resolves.toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(written[0].changedFiles).toEqual([{ filePath: 'src/keep.ts', status: 'modified' }])
    })
  })
})
