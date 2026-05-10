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
const mockExecFileAsync = vi.fn()

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFileCb(...args),
}))

vi.mock('util', () => ({
  promisify: vi.fn(
    () =>
      (...args: unknown[]) =>
        mockExecFileAsync(...args)
  ),
}))

vi.mock('../../src/utils/githubUrl', () => ({
  parseGitRemote: vi.fn(() => null),
  isGitHubHost: vi.fn(() => false),
}))

import { dialog } from 'electron'
import { parseGitRemote, isGitHubHost } from '../../src/utils/githubUrl'
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

function setStoredData({
  projects = [],
  sessions = [],
  projectsExists = true,
  sessionsExists = true,
}: {
  projects?: unknown[]
  sessions?: unknown[]
  projectsExists?: boolean
  sessionsExists?: boolean
} = {}): void {
  mockExistsSync.mockImplementation(filePath => {
    const normalized = String(filePath)
    if (normalized.endsWith('projects.json')) return projectsExists
    if (normalized.endsWith('sessions.json')) return sessionsExists
    return false
  })

  mockReadFileSync.mockImplementation(filePath => {
    const normalized = String(filePath)
    if (normalized.endsWith('projects.json')) return JSON.stringify(projects)
    if (normalized.endsWith('sessions.json')) return JSON.stringify(sessions)
    return '[]'
  })
}

describe('crewService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockExecFileAsync.mockReset()
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('[]')
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
    it('returns cancelled when the picker is dismissed', async () => {
      const parentWindow = { isDestroyed: vi.fn(() => true) }

      const result = await addProjectFromPicker(parentWindow as never)

      expect(result).toEqual({ success: false, error: 'Cancelled' })
      expect(dialog.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: ['openDirectory'],
          title: 'Select a project folder',
        })
      )
    })

    it('returns an error when the selected folder is not a git repository', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/workspace/not-a-repo'],
      })
      mockExecFileAsync.mockRejectedValueOnce(new Error('not a repo'))

      const result = await addProjectFromPicker()

      expect(result).toEqual({ success: false, error: 'Not a git repository' })
      expect(mockExecFileAsync).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], {
        cwd: '/workspace/not-a-repo',
        timeout: 5000,
      })
    })

    it('returns an error when the repository has no origin remote', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/workspace/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/workspace/repo\n' })
        .mockRejectedValueOnce(new Error('missing origin'))

      const result = await addProjectFromPicker()

      expect(result).toEqual({ success: false, error: 'No origin remote found' })
    })

    it('returns an error when the origin remote is not GitHub', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/workspace/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/workspace/repo\n' })
        .mockResolvedValueOnce({ stdout: 'https://gitlab.example.com/owner/repo.git\n' })
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'gitlab.example.com',
        slug: 'owner/repo',
        scheme: 'https',
      })

      const result = await addProjectFromPicker()

      expect(result).toEqual({
        success: false,
        error: 'Origin remote is not a GitHub repository',
      })
    })

    it('adds a new project after resolving a GitHub SSH remote', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
      vi.spyOn(Math, 'random').mockReturnValue(0.123456)
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/workspace/repo'],
      })
      setStoredData({ projectsExists: false })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/workspace/repo\n' })
        .mockResolvedValueOnce({ stdout: 'git@gh-alias:owner/cool-repo.git\n' })
        .mockResolvedValueOnce({ stdout: 'hostname github.com\n' })
        .mockResolvedValueOnce({ stdout: 'origin/trunk\n' })
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'gh-alias',
        slug: 'owner/cool-repo',
        scheme: 'ssh',
      })
      vi.mocked(isGitHubHost).mockReturnValueOnce(false).mockReturnValueOnce(true)
      const parentWindow = { isDestroyed: vi.fn(() => false) }

      const result = await addProjectFromPicker(parentWindow as never)

      expect(dialog.showOpenDialog).toHaveBeenCalledWith(
        parentWindow,
        expect.objectContaining({ title: 'Select a project folder' })
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(3, 'ssh', ['-G', 'gh-alias'], {
        timeout: 5000,
      })
      expect(result).toEqual({
        success: true,
        project: expect.objectContaining({
          displayName: 'cool-repo',
          gitRoot: '/workspace/repo',
          githubSlug: 'owner/cool-repo',
          defaultBranch: 'trunk',
        }),
      })
      const writtenProjects = JSON.parse(
        mockWriteFileSync.mock.calls[mockWriteFileSync.mock.calls.length - 1][1] as string
      )
      expect(writtenProjects).toEqual([
        expect.objectContaining({
          displayName: 'cool-repo',
          gitRoot: '/workspace/repo',
          githubSlug: 'owner/cool-repo',
          defaultBranch: 'trunk',
        }),
      ])
    })

    it('reuses an existing project and falls back to the current branch name', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_123)
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/workspace/repo'],
      })
      setStoredData({
        projects: [
          {
            id: 'crew-existing',
            displayName: 'cool-repo',
            localPath: '/workspace/repo',
            gitRoot: '/workspace/repo',
            githubSlug: 'owner/cool-repo',
            defaultBranch: 'main',
            lastOpenedAt: 1,
            lastActiveAt: 2,
          },
        ],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/workspace/repo\n' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/owner/cool-repo.git\n' })
        .mockRejectedValueOnce(new Error('missing origin head'))
        .mockResolvedValueOnce({ stdout: 'develop\n' })
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'github.com',
        slug: 'owner/cool-repo',
        scheme: 'https',
      })
      vi.mocked(isGitHubHost).mockReturnValue(true)

      const result = await addProjectFromPicker()

      expect(result).toEqual({
        success: true,
        project: expect.objectContaining({
          id: 'crew-existing',
          lastOpenedAt: 1_700_000_000_123,
        }),
      })
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        3,
        'git',
        ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
        { cwd: '/workspace/repo', timeout: 5000 }
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        4,
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: '/workspace/repo', timeout: 5000 }
      )
    })
  })

  describe('undoFile', () => {
    it('returns false for an unknown project', async () => {
      setStoredData({ projectsExists: false })

      await expect(undoFile('missing-project', 'src/file.ts')).resolves.toBe(false)
    })

    it('returns false when git checkout fails', async () => {
      setStoredData({
        projects: [
          {
            id: 'proj-1',
            displayName: 'Repo',
            localPath: '/workspace/repo',
            gitRoot: '/workspace/repo',
            githubSlug: 'owner/repo',
            defaultBranch: 'main',
            lastOpenedAt: 1,
            lastActiveAt: 1,
          },
        ],
        sessionsExists: false,
      })
      mockExecFileAsync.mockRejectedValueOnce(new Error('checkout failed'))

      await expect(undoFile('proj-1', 'src/file.ts')).resolves.toBe(false)
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it('reverts a file and removes it from the changed-file list', async () => {
      setStoredData({
        projects: [
          {
            id: 'proj-1',
            displayName: 'Repo',
            localPath: '/workspace/repo',
            gitRoot: '/workspace/repo',
            githubSlug: 'owner/repo',
            defaultBranch: 'main',
            lastOpenedAt: 1,
            lastActiveAt: 1,
          },
        ],
        sessions: [
          {
            id: 'session-1',
            projectId: 'proj-1',
            status: 'active',
            conversationHistory: [],
            changedFiles: [
              { filePath: 'src/file.ts', status: 'modified' },
              { filePath: 'src/keep.ts', status: 'modified' },
            ],
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      })
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '' })

      await expect(undoFile('proj-1', 'src/file.ts')).resolves.toBe(true)

      const writtenSessions = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
      expect(writtenSessions[0].changedFiles).toEqual([
        { filePath: 'src/keep.ts', status: 'modified' },
      ])
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['checkout', 'HEAD', '--', 'src/file.ts'],
        { cwd: '/workspace/repo', timeout: 5000 }
      )
    })
  })
})
