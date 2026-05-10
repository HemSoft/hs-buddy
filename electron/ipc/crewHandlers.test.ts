import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('../services/crewService', () => ({
  addProjectFromPicker: vi.fn().mockResolvedValue({ id: 'p1', path: '/project' }),
  listProjects: vi.fn(() => [{ id: 'p1', path: '/project' }]),
  removeProject: vi.fn(() => true),
  getSession: vi.fn(() => ({ projectId: 'p1', status: 'idle', messages: [] })),
  createOrGetSession: vi.fn(() => ({ projectId: 'p1', status: 'idle', messages: [] })),
  addMessageToSession: vi.fn(),
  updateSessionStatus: vi.fn(),
  updateSessionChangedFiles: vi.fn(),
  clearSession: vi.fn(),
  undoFile: vi.fn(),
}))

import { ipcMain } from 'electron'
import { registerCrewHandlers } from './crewHandlers'

describe('crewHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>
  const mockWin = { isDestroyed: vi.fn(() => false) } as unknown as Electron.BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerCrewHandlers(mockWin)
  })

  it('registers expected channels', () => {
    expect(handlers.has('crew:add-project')).toBe(true)
    expect(handlers.has('crew:list-projects')).toBe(true)
    expect(handlers.has('crew:remove-project')).toBe(true)
    expect(handlers.has('crew:get-session')).toBe(true)
    expect(handlers.has('crew:create-session')).toBe(true)
    expect(handlers.has('crew:add-message')).toBe(true)
    expect(handlers.has('crew:update-session-status')).toBe(true)
    expect(handlers.has('crew:update-changed-files')).toBe(true)
    expect(handlers.has('crew:clear-session')).toBe(true)
    expect(handlers.has('crew:undo-file')).toBe(true)
  })

  it('crew:list-projects returns project list', async () => {
    const handler = handlers.get('crew:list-projects')!
    const result = await handler({})
    expect(result).toEqual([{ id: 'p1', path: '/project' }])
  })

  it('crew:remove-project calls removeProject', async () => {
    const { removeProject } = await import('../services/crewService')
    const handler = handlers.get('crew:remove-project')!
    await handler({}, 'p1')
    expect(removeProject).toHaveBeenCalledWith('p1')
  })

  it('crew:get-session returns session state', async () => {
    const handler = handlers.get('crew:get-session')!
    const result = await handler({}, 'p1')
    expect(result).toEqual({ projectId: 'p1', status: 'idle', messages: [] })
  })

  it('crew:clear-session clears the session', async () => {
    const { clearSession } = await import('../services/crewService')
    const handler = handlers.get('crew:clear-session')!
    await handler({}, 'p1')
    expect(clearSession).toHaveBeenCalledWith('p1')
  })

  it('crew:add-project delegates to addProjectFromPicker', async () => {
    const { addProjectFromPicker } = await import('../services/crewService')
    const handler = handlers.get('crew:add-project')!
    const result = await handler({})
    expect(addProjectFromPicker).toHaveBeenCalledWith(mockWin)
    expect(result).toEqual({ id: 'p1', path: '/project' })
  })

  it('crew:create-session creates or gets a session', async () => {
    const { createOrGetSession } = await import('../services/crewService')
    const handler = handlers.get('crew:create-session')!
    const result = await handler({}, 'p1')
    expect(createOrGetSession).toHaveBeenCalledWith('p1')
    expect(result).toEqual({ projectId: 'p1', status: 'idle', messages: [] })
  })

  it('crew:add-message adds a message to session', async () => {
    const { addMessageToSession } = await import('../services/crewService')
    const handler = handlers.get('crew:add-message')!
    const message = { role: 'user', content: 'Hello', timestamp: 12345 }
    await handler({}, 'p1', message)
    expect(addMessageToSession).toHaveBeenCalledWith('p1', message)
  })

  it('crew:update-session-status updates session status', async () => {
    const { updateSessionStatus } = await import('../services/crewService')
    const handler = handlers.get('crew:update-session-status')!
    await handler({}, 'p1', 'active')
    expect(updateSessionStatus).toHaveBeenCalledWith('p1', 'active')
  })

  it('crew:update-changed-files updates changed files', async () => {
    const { updateSessionChangedFiles } = await import('../services/crewService')
    const handler = handlers.get('crew:update-changed-files')!
    const files = [{ path: '/src/test.ts', status: 'modified' }]
    await handler({}, 'p1', files)
    expect(updateSessionChangedFiles).toHaveBeenCalledWith('p1', files)
  })

  it('crew:undo-file calls undoFile', async () => {
    const { undoFile } = await import('../services/crewService')
    const handler = handlers.get('crew:undo-file')!
    await handler({}, 'p1', '/src/test.ts')
    expect(undoFile).toHaveBeenCalledWith('p1', '/src/test.ts')
  })
})
