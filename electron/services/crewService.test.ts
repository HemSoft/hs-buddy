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

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFileCb(...args),
}))

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn().mockResolvedValue({ stdout: '' }),
}))

vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecFileAsync),
}))

vi.mock('../../src/utils/githubUrl', () => ({
  parseGitRemote: vi.fn(() => null),
  isGitHubHost: vi.fn(() => false),
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
  beforeEach(async () => {
    vi.resetAllMocks()
    mockExecFileAsync.mockResolvedValue({ stdout: '' })
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue('[]')
    // Re-apply defaults for module-level mocks cleared by resetAllMocks
    const { dialog } = await import('electron')
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
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
    it('returns cancelled when dialog is dismissed', async () => {
      const result = await addProjectFromPicker()
      expect(result).toEqual({ success: false, error: 'Cancelled' })
    })

    it('returns error when folder is not a git repo', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/folder'],
      })
      // runGit returns null → not a git repo
      mockExecFileAsync.mockRejectedValue(new Error('not a git repo'))

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Not a git repository')
    })

    it('returns error when no origin remote', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      // First call: git rev-parse --show-toplevel → success
      // Second call: git remote get-url origin → fails
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockRejectedValueOnce(new Error('no origin'))

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toContain('No origin remote')
    })

    it('returns error when origin is not GitHub', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      // git rev-parse → /some/repo, git remote get-url origin → gitlab url
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'https://gitlab.com/org/repo.git' })
      // parseGitRemote returns result but isGitHubHost returns false
      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'gitlab.com',
        slug: 'org/repo',
        scheme: 'https',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(false)

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toContain('not a GitHub repository')
    })

    it('creates new project on valid GitHub repo', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      // git rev-parse → /some/repo
      // git remote get-url origin → github url
      // git symbolic-ref → origin/main
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/owner/repo.git' })
        .mockResolvedValueOnce({ stdout: 'origin/main' })

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'github.com',
        slug: 'owner/repo',
        scheme: 'https',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(true)

      // No existing projects
      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('[]')

      const result = await addProjectFromPicker()
      expect(result.success).toBe(true)
      expect(result.project).toBeDefined()
      expect(result.project!.githubSlug).toBe('owner/repo')
      expect(result.project!.defaultBranch).toBe('main')
    })

    it('returns existing project if gitRoot matches', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/owner/repo.git' })
        .mockResolvedValueOnce({ stdout: 'origin/main' })

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'github.com',
        slug: 'owner/repo',
        scheme: 'https',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(true)

      mockExistsSync.mockReturnValue(true)
      const existingProjects = [
        { id: 'existing-1', gitRoot: '/some/repo', lastOpenedAt: 1000, githubSlug: 'owner/repo' },
      ]
      mockReadFileSync.mockReturnValue(JSON.stringify(existingProjects))

      const result = await addProjectFromPicker()
      expect(result.success).toBe(true)
      expect(result.project!.id).toBe('existing-1')
      // lastOpenedAt should be updated
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('uses parentWindow for dialog when provided', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })

      const mockWindow = {
        isDestroyed: vi.fn(() => false),
      }
      await addProjectFromPicker(
        mockWindow as unknown as Parameters<typeof addProjectFromPicker>[0]
      )
      expect(dialog.showOpenDialog).toHaveBeenCalledWith(mockWindow, expect.any(Object))
    })
  })

  describe('addProjectFromPicker — SSH resolution', () => {
    it('resolves SSH remote via ssh -G to GitHub host', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      // git rev-parse → /some/repo
      // git remote get-url origin → SSH URL
      // ssh -G host → resolves to github.com
      // git symbolic-ref → origin/main
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' }) // git rev-parse --show-toplevel
        .mockResolvedValueOnce({ stdout: 'git@corp-gh:owner/repo.git' }) // git remote get-url origin
        .mockResolvedValueOnce({ stdout: 'hostname github.com\nuser git\n' }) // ssh -G corp-gh
        .mockResolvedValueOnce({ stdout: 'origin/develop' }) // git symbolic-ref

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'corp-gh',
        slug: 'owner/repo',
        scheme: 'ssh',
      } as ReturnType<typeof parseGitRemote>)
      // First call: isGitHubHost('corp-gh') → false (not directly GitHub)
      // Second call: isGitHubHost('github.com') → true (resolved via SSH)
      vi.mocked(isGitHubHost).mockReturnValueOnce(false).mockReturnValueOnce(true)

      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('[]')

      const result = await addProjectFromPicker()
      expect(result.success).toBe(true)
      expect(result.project!.githubSlug).toBe('owner/repo')
      expect(result.project!.defaultBranch).toBe('develop')
    })

    it('rejects SSH remote when resolved host is not GitHub', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'git@internal:owner/repo.git' })
        .mockResolvedValueOnce({ stdout: 'hostname internal.corp.com\n' }) // ssh -G

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'internal',
        slug: 'owner/repo',
        scheme: 'ssh',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(false)

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toContain('not a GitHub repository')
    })

    it('rejects SSH remote when ssh -G fails', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'git@unknown:owner/repo.git' })
        .mockRejectedValueOnce(new Error('ssh not found')) // ssh -G fails

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'unknown',
        slug: 'owner/repo',
        scheme: 'ssh',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(false)

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toContain('not a GitHub repository')
    })

    it('falls back to rev-parse when symbolic-ref fails', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' }) // git rev-parse --show-toplevel
        .mockResolvedValueOnce({ stdout: 'https://github.com/owner/repo.git' }) // git remote get-url
        .mockRejectedValueOnce(new Error('no symbolic ref')) // git symbolic-ref fails
        .mockResolvedValueOnce({ stdout: 'feature-branch' }) // git rev-parse --abbrev-ref HEAD

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'github.com',
        slug: 'owner/repo',
        scheme: 'https',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(true)

      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('[]')

      const result = await addProjectFromPicker()
      expect(result.success).toBe(true)
      expect(result.project!.defaultBranch).toBe('feature-branch')
    })

    it('defaults to main when both symbolic-ref and rev-parse fail', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/owner/repo.git' })
        .mockRejectedValueOnce(new Error('no symbolic ref'))
        .mockRejectedValueOnce(new Error('no HEAD'))

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'github.com',
        slug: 'owner/repo',
        scheme: 'https',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(true)

      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('[]')

      const result = await addProjectFromPicker()
      expect(result.success).toBe(true)
      expect(result.project!.defaultBranch).toBe('main')
    })
    it('rejects SSH remote when ssh -G has no hostname line', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'git@custom:owner/repo.git' })
        .mockResolvedValueOnce({ stdout: 'user git\nport 22\n' }) // ssh -G returns no hostname line

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'custom',
        slug: 'owner/repo',
        scheme: 'ssh',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(false)

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toContain('not a GitHub repository')
    })

    it('rejects non-ssh non-github remote', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/some/repo'],
      })
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '/some/repo' })
        .mockResolvedValueOnce({ stdout: 'https://gitlab.com/owner/repo.git' })

      const { parseGitRemote, isGitHubHost } = await import('../../src/utils/githubUrl')
      vi.mocked(parseGitRemote).mockReturnValue({
        host: 'gitlab.com',
        slug: 'owner/repo',
        scheme: 'https',
      } as ReturnType<typeof parseGitRemote>)
      vi.mocked(isGitHubHost).mockReturnValue(false)

      const result = await addProjectFromPicker()
      expect(result.success).toBe(false)
      expect(result.error).toContain('not a GitHub repository')
    })
  })

  describe('undoFile', () => {
    it('returns false for unknown project', async () => {
      mockExistsSync.mockReturnValue(false)
      mockReadFileSync.mockReturnValue('[]')
      const result = await undoFile('nonexistent', 'file.ts')
      expect(result).toBe(false)
    })

    it('returns false when git checkout fails', async () => {
      mockExistsSync.mockReturnValue(true)
      const projects = [{ id: 'proj-1', gitRoot: '/repo' }]
      mockReadFileSync.mockReturnValue(JSON.stringify(projects))
      mockExecFileAsync.mockRejectedValue(new Error('checkout failed'))

      const result = await undoFile('proj-1', 'src/file.ts')
      expect(result).toBe(false)
    })

    it('returns true and removes file from changed files on success', async () => {
      mockExistsSync.mockReturnValue(true)
      const projects = [{ id: 'proj-1', gitRoot: '/repo' }]
      const sessions = [
        {
          id: 'sess-1',
          projectId: 'proj-1',
          status: 'idle',
          conversationHistory: [],
          changedFiles: [
            { filePath: 'src/file.ts', status: 'modified' },
            { filePath: 'src/other.ts', status: 'modified' },
          ],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]
      // First reads: projects, then sessions (for modifySession)
      let readCount = 0
      mockReadFileSync.mockImplementation(() => {
        readCount++
        // Odd calls: projects path, even calls: sessions path
        if (readCount <= 1) return JSON.stringify(projects)
        return JSON.stringify(sessions)
      })
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      const result = await undoFile('proj-1', 'src/file.ts')
      expect(result).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalled()
      // Verify changedFiles no longer includes the undone file
      const writtenSessions = JSON.parse(mockWriteFileSync.mock.calls.at(-1)?.[1] as string)
      const updatedSession = writtenSessions.find((s: Record<string, unknown>) => s.id === 'sess-1')
      expect(updatedSession.changedFiles).not.toContainEqual(
        expect.objectContaining({ path: 'src/file.ts' })
      )
    })
  })
})
