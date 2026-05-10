import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockShowOpenDialog = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-app') },
  BrowserWindow: class {},
  dialog: { showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args) },
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

const mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: '' })

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('util', () => ({
  promisify: vi.fn(
    () =>
      (...args: unknown[]) =>
        mockExecFileAsync(...args)
  ),
}))

const mockParseGitRemote = vi.fn().mockReturnValue(null)
const mockIsGitHubHost = vi.fn().mockReturnValue(false)

vi.mock('../../src/utils/githubUrl', () => ({
  parseGitRemote: (...args: unknown[]) => mockParseGitRemote(...args),
  isGitHubHost: (...args: unknown[]) => mockIsGitHubHost(...args),
}))

import {
  listProjects,
  removeProject,
  getSession,
  clearSession,
  createOrGetSession,
  addMessageToSession,
  updateSessionStatus,
  updateSessionChangedFiles,
  addProjectFromPicker,
  undoFile,
} from './crewService'

describe('crewService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('[]')
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
    it('returns cancelled when dialog is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cancelled')
    })

    it('returns error when folder is not a git repo', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/not-a-repo'],
      })
      // git rev-parse fails
      mockExecFileAsync.mockRejectedValue(new Error('not a git repo'))

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not a git repository')
    })

    it('returns error when no origin remote', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/repo'],
      })
      // First call: rev-parse --show-toplevel succeeds
      // Second call: remote get-url origin fails
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/tmp/repo\n' })
        .mockRejectedValueOnce(new Error('no remote'))

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toBe('No origin remote found')
    })

    it('returns error when origin is not GitHub', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/repo'],
      })
      // rev-parse succeeds, remote get-url succeeds but not github
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/tmp/repo\n' })
        .mockResolvedValueOnce({ stdout: 'https://gitlab.com/user/repo.git\n' })
        .mockRejectedValue(new Error('no')) // any further calls
      mockParseGitRemote.mockReturnValue({ host: 'gitlab.com', slug: 'user/repo', scheme: 'https' })
      mockIsGitHubHost.mockReturnValue(false)

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Origin remote is not a GitHub repository')
    })

    it('succeeds with valid GitHub repo', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/my-project'],
      })
      // rev-parse succeeds, remote get-url succeeds, is github
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/tmp/my-project\n' }) // rev-parse --show-toplevel
        .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' }) // remote get-url origin
        .mockResolvedValueOnce({ stdout: 'origin/main\n' }) // symbolic-ref
      mockParseGitRemote.mockReturnValue({ host: 'github.com', slug: 'user/repo', scheme: 'https' })
      mockIsGitHubHost.mockReturnValue(true)
      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('[]')

      const result = await addProjectFromPicker()
      expect(result.success).toBe(true)
      expect(result.project).toBeDefined()
      expect(result.project!.githubSlug).toBe('user/repo')
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('returns existing project when gitRoot already registered', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/existing'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/tmp/existing\n' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n' })
        .mockResolvedValueOnce({ stdout: 'origin/main\n' })
      mockParseGitRemote.mockReturnValue({ host: 'github.com', slug: 'user/repo', scheme: 'https' })
      mockIsGitHubHost.mockReturnValue(true)
      // Already has a project with this gitRoot
      mockExistsSync.mockReturnValue(true)
      const projects = [
        {
          id: 'proj-existing',
          displayName: 'repo',
          localPath: '/tmp/existing',
          gitRoot: '/tmp/existing',
          githubSlug: 'user/repo',
          defaultBranch: 'main',
          lastOpenedAt: 1000,
          lastActiveAt: 1000,
        },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))

      const result = await addProjectFromPicker()
      expect(result.success).toBe(true)
      expect(result.project!.id).toBe('proj-existing')
    })
  })

  describe('undoFile', () => {
    it('returns false when project not found', async () => {
      mockExistsSync.mockReturnValue(false)
      const result = await undoFile('nonexistent', 'src/main.ts')
      expect(result).toBe(false)
    })

    it('returns false when git checkout fails', async () => {
      mockExistsSync.mockReturnValue(true)
      const projects = [
        {
          id: 'proj-1',
          displayName: 'Test',
          localPath: '/tmp/repo',
          gitRoot: '/tmp/repo',
          githubSlug: 'user/repo',
        },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))
      mockExecFileAsync.mockRejectedValue(new Error('git checkout failed'))

      const result = await undoFile('proj-1', 'src/main.ts')
      expect(result).toBe(false)
    })

    it('restores file and removes from changed files', async () => {
      mockExistsSync.mockReturnValue(true)
      const projects = [
        {
          id: 'proj-1',
          displayName: 'Test',
          localPath: '/tmp/repo',
          gitRoot: '/tmp/repo',
          githubSlug: 'user/repo',
        },
      ]
      const sessions = [
        {
          id: 'sess-1',
          projectId: 'proj-1',
          status: 'active',
          conversationHistory: [],
          changedFiles: [
            { filePath: 'src/main.ts', status: 'modified' },
            { filePath: 'src/other.ts', status: 'modified' },
          ],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]
      // First read is projects, second is sessions (for modifySession)
      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify(projects))
        .mockReturnValueOnce(JSON.stringify(sessions))
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      const result = await undoFile('proj-1', 'src/main.ts')
      expect(result).toBe(true)
      // Should have written sessions with src/main.ts removed
      const lastWriteCall = mockWriteFileSync.mock.calls[mockWriteFileSync.mock.calls.length - 1]
      const written = JSON.parse(lastWriteCall[1] as string)
      expect(written[0].changedFiles).toHaveLength(1)
      expect(written[0].changedFiles[0].filePath).toBe('src/other.ts')
    })
  })
})
