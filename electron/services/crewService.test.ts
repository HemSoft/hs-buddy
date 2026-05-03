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

vi.mock('util', () => ({
  promisify: vi.fn(_fn => vi.fn().mockResolvedValue({ stdout: '' })),
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
})
