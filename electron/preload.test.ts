import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockOn, mockOff, mockSend, mockInvoke, exposedApis } = vi.hoisted(() => ({
  mockOn: vi.fn(),
  mockOff: vi.fn(),
  mockSend: vi.fn(),
  mockInvoke: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exposedApis: {} as Record<string, any>,
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, api: unknown) => {
      exposedApis[name] = api
    }),
  },
  ipcRenderer: {
    on: (...args: unknown[]) => mockOn(...args),
    off: (...args: unknown[]) => mockOff(...args),
    send: (...args: unknown[]) => mockSend(...args),
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

// Import triggers the module to execute and call exposeInMainWorld
import './preload'

describe('preload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ipcRenderer bridge', () => {
    it('exposes ipcRenderer API with on/off/send/invoke', () => {
      expect(exposedApis.ipcRenderer).toBeDefined()
      expect(exposedApis.ipcRenderer.on).toBeTypeOf('function')
      expect(exposedApis.ipcRenderer.off).toBeTypeOf('function')
      expect(exposedApis.ipcRenderer.send).toBeTypeOf('function')
      expect(exposedApis.ipcRenderer.invoke).toBeTypeOf('function')
    })

    it('on() wraps the listener and registers with ipcRenderer.on', () => {
      const listener = vi.fn()
      exposedApis.ipcRenderer.on('test-channel', listener)
      expect(mockOn).toHaveBeenCalledWith('test-channel', expect.any(Function))
      // The wrapper should NOT be the original listener (it wraps it)
      const registeredWrapper = mockOn.mock.calls[0][1]
      expect(registeredWrapper).not.toBe(listener)
    })

    it('on() wrapper forwards events to the original listener', () => {
      const listener = vi.fn()
      exposedApis.ipcRenderer.on('data-channel', listener)
      const registeredWrapper = mockOn.mock.calls[0][1]
      const mockEvent = { sender: {} }
      registeredWrapper(mockEvent, 'arg1', 'arg2')
      expect(listener).toHaveBeenCalledWith(mockEvent, 'arg1', 'arg2')
    })

    it('off() removes the correct wrapper registered by on()', () => {
      const listener = vi.fn()
      exposedApis.ipcRenderer.on('remove-channel', listener)
      const registeredWrapper = mockOn.mock.calls[0][1]

      exposedApis.ipcRenderer.off('remove-channel', listener)
      expect(mockOff).toHaveBeenCalledWith('remove-channel', registeredWrapper)
    })

    it('off() does nothing when listener was never registered', () => {
      const unknownListener = vi.fn()
      exposedApis.ipcRenderer.off('unknown-channel', unknownListener)
      expect(mockOff).not.toHaveBeenCalled()
    })

    it('send() forwards channel and args to ipcRenderer.send', () => {
      exposedApis.ipcRenderer.send('msg-channel', 'payload1', 'payload2')
      expect(mockSend).toHaveBeenCalledWith('msg-channel', 'payload1', 'payload2')
    })

    it('invoke() forwards channel and args to ipcRenderer.invoke', () => {
      exposedApis.ipcRenderer.invoke('invoke-channel', 'data')
      expect(mockInvoke).toHaveBeenCalledWith('invoke-channel', 'data')
    })
  })

  describe('shell bridge', () => {
    it('exposes shell API', () => {
      expect(exposedApis.shell).toBeDefined()
      expect(exposedApis.shell.openExternal).toBeTypeOf('function')
      expect(exposedApis.shell.openInAppBrowser).toBeTypeOf('function')
      expect(exposedApis.shell.fetchPageTitle).toBeTypeOf('function')
    })

    it('openExternal invokes shell:open-external', () => {
      exposedApis.shell.openExternal('https://example.com')
      expect(mockInvoke).toHaveBeenCalledWith('shell:open-external', 'https://example.com')
    })

    it('openInAppBrowser invokes shell:open-in-app-browser', () => {
      exposedApis.shell.openInAppBrowser('https://test.com', 'Title')
      expect(mockInvoke).toHaveBeenCalledWith(
        'shell:open-in-app-browser',
        'https://test.com',
        'Title'
      )
    })
  })

  describe('github bridge', () => {
    it('exposes github API', () => {
      expect(exposedApis.github).toBeDefined()
      expect(exposedApis.github.getCliToken).toBeTypeOf('function')
      expect(exposedApis.github.getActiveAccount).toBeTypeOf('function')
    })

    it('getCliToken invokes github:get-cli-token', () => {
      exposedApis.github.getCliToken('testuser')
      expect(mockInvoke).toHaveBeenCalledWith('github:get-cli-token', 'testuser')
    })

    it('getActiveAccount invokes github:get-active-account', () => {
      exposedApis.github.getActiveAccount()
      expect(mockInvoke).toHaveBeenCalledWith('github:get-active-account')
    })
  })

  describe('crew bridge', () => {
    it('exposes crew API', () => {
      expect(exposedApis.crew).toBeDefined()
      expect(exposedApis.crew.addProject).toBeTypeOf('function')
      expect(exposedApis.crew.listProjects).toBeTypeOf('function')
    })

    it('addProject invokes crew:add-project', () => {
      exposedApis.crew.addProject()
      expect(mockInvoke).toHaveBeenCalledWith('crew:add-project')
    })

    it('removeProject invokes crew:remove-project with projectId', () => {
      exposedApis.crew.removeProject('proj-123')
      expect(mockInvoke).toHaveBeenCalledWith('crew:remove-project', 'proj-123')
    })
  })

  describe('tempo bridge', () => {
    it('exposes tempo API', () => {
      expect(exposedApis.tempo).toBeDefined()
      expect(exposedApis.tempo.getToday).toBeTypeOf('function')
      expect(exposedApis.tempo.createWorklog).toBeTypeOf('function')
    })

    it('getToday invokes tempo:get-today', () => {
      exposedApis.tempo.getToday('2026-01-01')
      expect(mockInvoke).toHaveBeenCalledWith('tempo:get-today', '2026-01-01')
    })
  })

  describe('todoist bridge', () => {
    it('exposes todoist API', () => {
      expect(exposedApis.todoist).toBeDefined()
      expect(exposedApis.todoist.getUpcoming).toBeTypeOf('function')
      expect(exposedApis.todoist.getToday).toBeTypeOf('function')
      expect(exposedApis.todoist.completeTask).toBeTypeOf('function')
      expect(exposedApis.todoist.createTask).toBeTypeOf('function')
      expect(exposedApis.todoist.deleteTask).toBeTypeOf('function')
    })

    it('getToday invokes todoist:get-today', () => {
      exposedApis.todoist.getToday()
      expect(mockInvoke).toHaveBeenCalledWith('todoist:get-today')
    })

    it('completeTask invokes todoist:complete-task with taskId', () => {
      exposedApis.todoist.completeTask('task-1')
      expect(mockInvoke).toHaveBeenCalledWith('todoist:complete-task', 'task-1')
    })

    it('createTask invokes todoist:create-task with params', () => {
      const params = { content: 'Buy milk', due_date: '2026-01-01' }
      exposedApis.todoist.createTask(params)
      expect(mockInvoke).toHaveBeenCalledWith('todoist:create-task', params)
    })
  })

  describe('finance bridge', () => {
    it('exposes finance API', () => {
      expect(exposedApis.finance).toBeDefined()
      expect(exposedApis.finance.fetchQuote).toBeTypeOf('function')
    })

    it('fetchQuote invokes finance:fetch-quote', () => {
      exposedApis.finance.fetchQuote('AAPL')
      expect(mockInvoke).toHaveBeenCalledWith('finance:fetch-quote', 'AAPL')
    })
  })

  describe('slack bridge', () => {
    it('exposes slack API', () => {
      expect(exposedApis.slack).toBeDefined()
      expect(exposedApis.slack.nudgeAuthor).toBeTypeOf('function')
    })

    it('nudgeAuthor invokes slack:nudge-author with params', () => {
      const params = { githubLogin: 'user1', prTitle: 'Fix bug', prUrl: 'https://github.com/pr/1' }
      exposedApis.slack.nudgeAuthor(params)
      expect(mockInvoke).toHaveBeenCalledWith('slack:nudge-author', params)
    })
  })

  describe('filesystem bridge', () => {
    it('exposes filesystem API', () => {
      expect(exposedApis.filesystem).toBeDefined()
      expect(exposedApis.filesystem.readDir).toBeTypeOf('function')
      expect(exposedApis.filesystem.readFile).toBeTypeOf('function')
    })

    it('readDir invokes fs:read-dir', () => {
      exposedApis.filesystem.readDir('/tmp')
      expect(mockInvoke).toHaveBeenCalledWith('fs:read-dir', '/tmp')
    })

    it('readFile invokes fs:read-file', () => {
      exposedApis.filesystem.readFile('/tmp/file.txt')
      expect(mockInvoke).toHaveBeenCalledWith('fs:read-file', '/tmp/file.txt')
    })
  })

  describe('terminal bridge', () => {
    it('exposes terminal API', () => {
      expect(exposedApis.terminal).toBeDefined()
      expect(exposedApis.terminal.spawn).toBeTypeOf('function')
      expect(exposedApis.terminal.attach).toBeTypeOf('function')
      expect(exposedApis.terminal.write).toBeTypeOf('function')
      expect(exposedApis.terminal.resize).toBeTypeOf('function')
      expect(exposedApis.terminal.kill).toBeTypeOf('function')
    })

    it('spawn invokes terminal:spawn', () => {
      exposedApis.terminal.spawn({ cwd: '/home' })
      expect(mockInvoke).toHaveBeenCalledWith('terminal:spawn', { cwd: '/home' })
    })

    it('write sends terminal:write', () => {
      exposedApis.terminal.write('session-1', 'ls\n')
      expect(mockSend).toHaveBeenCalledWith('terminal:write', 'session-1', 'ls\n')
    })

    it('resize sends terminal:resize', () => {
      exposedApis.terminal.resize('session-1', 80, 24)
      expect(mockSend).toHaveBeenCalledWith('terminal:resize', 'session-1', 80, 24)
    })

    it('kill invokes terminal:kill', () => {
      exposedApis.terminal.kill('session-1')
      expect(mockInvoke).toHaveBeenCalledWith('terminal:kill', 'session-1')
    })
  })

  describe('ralph bridge', () => {
    it('exposes ralph API', () => {
      expect(exposedApis.ralph).toBeDefined()
      expect(exposedApis.ralph.launch).toBeTypeOf('function')
      expect(exposedApis.ralph.stop).toBeTypeOf('function')
      expect(exposedApis.ralph.list).toBeTypeOf('function')
      expect(exposedApis.ralph.getStatus).toBeTypeOf('function')
      expect(exposedApis.ralph.onStatusChange).toBeTypeOf('function')
      expect(exposedApis.ralph.offStatusChange).toBeTypeOf('function')
    })

    it('launch invokes ralph:launch with config', () => {
      const config = { repoPath: '/repo', scriptType: 'fix' }
      exposedApis.ralph.launch(config)
      expect(mockInvoke).toHaveBeenCalledWith('ralph:launch', config)
    })

    it('stop invokes ralph:stop', () => {
      exposedApis.ralph.stop('run-1')
      expect(mockInvoke).toHaveBeenCalledWith('ralph:stop', 'run-1')
    })

    it('list invokes ralph:list', () => {
      exposedApis.ralph.list()
      expect(mockInvoke).toHaveBeenCalledWith('ralph:list')
    })

    it('onStatusChange registers a listener and offStatusChange removes it', () => {
      const cb = vi.fn()
      exposedApis.ralph.onStatusChange(cb)
      expect(mockOn).toHaveBeenCalledWith('ralph:status-update', expect.any(Function))

      exposedApis.ralph.offStatusChange(cb)
      // The wrapper registered by on should be passed to off
      const registeredWrapper = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'ralph:status-update'
      )?.[1]
      expect(mockOff).toHaveBeenCalledWith('ralph:status-update', registeredWrapper)
    })
  })

  describe('copilot bridge', () => {
    it('exposes copilot API', () => {
      expect(exposedApis.copilot).toBeDefined()
      expect(exposedApis.copilot.execute).toBeTypeOf('function')
      expect(exposedApis.copilot.cancel).toBeTypeOf('function')
      expect(exposedApis.copilot.getActiveCount).toBeTypeOf('function')
      expect(exposedApis.copilot.listModels).toBeTypeOf('function')
      expect(exposedApis.copilot.chatSend).toBeTypeOf('function')
      expect(exposedApis.copilot.chatAbort).toBeTypeOf('function')
    })

    it('execute invokes copilot:execute with args', () => {
      const args = { prompt: 'hello', category: 'general' }
      exposedApis.copilot.execute(args)
      expect(mockInvoke).toHaveBeenCalledWith('copilot:execute', args)
    })

    it('cancel invokes copilot:cancel', () => {
      exposedApis.copilot.cancel('result-1')
      expect(mockInvoke).toHaveBeenCalledWith('copilot:cancel', 'result-1')
    })

    it('listModels invokes copilot:list-models', () => {
      exposedApis.copilot.listModels('user1')
      expect(mockInvoke).toHaveBeenCalledWith('copilot:list-models', 'user1')
    })

    it('chatAbort invokes copilot:chat-abort', () => {
      exposedApis.copilot.chatAbort()
      expect(mockInvoke).toHaveBeenCalledWith('copilot:chat-abort')
    })
  })

  describe('copilotSessions bridge', () => {
    it('exposes copilotSessions API', () => {
      expect(exposedApis.copilotSessions).toBeDefined()
      expect(exposedApis.copilotSessions.scan).toBeTypeOf('function')
      expect(exposedApis.copilotSessions.getSession).toBeTypeOf('function')
      expect(exposedApis.copilotSessions.computeDigest).toBeTypeOf('function')
    })

    it('scan invokes copilot-sessions:scan', () => {
      exposedApis.copilotSessions.scan()
      expect(mockInvoke).toHaveBeenCalledWith('copilot-sessions:scan')
    })

    it('getSession invokes copilot-sessions:get-session', () => {
      exposedApis.copilotSessions.getSession('/path/to/session')
      expect(mockInvoke).toHaveBeenCalledWith('copilot-sessions:get-session', '/path/to/session')
    })
  })
})
