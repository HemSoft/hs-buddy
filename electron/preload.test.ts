import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC_INVOKE, IPC_SEND, IPC_PUSH } from '../src/ipc/contracts'

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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.SHELL_OPEN_EXTERNAL, 'https://example.com')
    })

    it('openInAppBrowser invokes shell:open-in-app-browser', () => {
      exposedApis.shell.openInAppBrowser('https://test.com', 'Title')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.SHELL_OPEN_IN_APP_BROWSER,
        'https://test.com',
        'Title'
      )
    })

    it('fetchPageTitle invokes shell:fetch-page-title', () => {
      exposedApis.shell.fetchPageTitle('https://example.com')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.SHELL_FETCH_PAGE_TITLE,
        'https://example.com'
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.GITHUB_GET_CLI_TOKEN, 'testuser')
    })

    it('getActiveAccount invokes github:get-active-account', () => {
      exposedApis.github.getActiveAccount()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.GITHUB_GET_ACTIVE_ACCOUNT)
    })

    it('switchAccount invokes github:switch-account', () => {
      exposedApis.github.switchAccount('testuser')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.GITHUB_SWITCH_ACCOUNT, 'testuser')
    })

    it('getCopilotUsage invokes github:get-copilot-usage', () => {
      exposedApis.github.getCopilotUsage('test-org', 'testuser')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.GITHUB_GET_COPILOT_USAGE,
        'test-org',
        'testuser'
      )
    })

    it('getCopilotQuota invokes github:get-copilot-quota', () => {
      exposedApis.github.getCopilotQuota('testuser')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.GITHUB_GET_COPILOT_QUOTA, 'testuser')
    })

    it('getCopilotBudget invokes github:get-copilot-budget', () => {
      exposedApis.github.getCopilotBudget('test-org', 'testuser')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.GITHUB_GET_COPILOT_BUDGET,
        'test-org',
        'testuser'
      )
    })

    it('getCopilotMemberUsage invokes github:get-copilot-member-usage', () => {
      exposedApis.github.getCopilotMemberUsage('test-org', 'member1', 'testuser')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.GITHUB_GET_COPILOT_MEMBER_USAGE,
        'test-org',
        'member1',
        'testuser'
      )
    })

    it('getUserPremiumRequests invokes github:get-user-premium-requests', () => {
      exposedApis.github.getUserPremiumRequests('test-org', 'member1', 'testuser')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.GITHUB_GET_USER_PREMIUM_REQUESTS,
        'test-org',
        'member1',
        'testuser'
      )
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_ADD_PROJECT)
    })

    it('removeProject invokes crew:remove-project with projectId', () => {
      exposedApis.crew.removeProject('proj-123')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_REMOVE_PROJECT, 'proj-123')
    })

    it('listProjects invokes crew:list-projects', () => {
      exposedApis.crew.listProjects()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_LIST_PROJECTS)
    })

    it('getSession invokes crew:get-session with projectId', () => {
      exposedApis.crew.getSession('proj-123')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_GET_SESSION, 'proj-123')
    })

    it('createSession invokes crew:create-session with projectId', () => {
      exposedApis.crew.createSession('proj-123')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_CREATE_SESSION, 'proj-123')
    })

    it('addMessage invokes crew:add-message with projectId and message', () => {
      const message = { role: 'user', content: 'hello', timestamp: 1234567890 }
      exposedApis.crew.addMessage('proj-123', message)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_ADD_MESSAGE, 'proj-123', message)
    })

    it('updateSessionStatus invokes crew:update-session-status with projectId and status', () => {
      exposedApis.crew.updateSessionStatus('proj-123', 'active')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.CREW_UPDATE_SESSION_STATUS,
        'proj-123',
        'active'
      )
    })

    it('updateChangedFiles invokes crew:update-changed-files with projectId and files', () => {
      const files = [{ path: 'src/app.ts', status: 'modified' }]
      exposedApis.crew.updateChangedFiles('proj-123', files)
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.CREW_UPDATE_CHANGED_FILES,
        'proj-123',
        files
      )
    })

    it('clearSession invokes crew:clear-session with projectId', () => {
      exposedApis.crew.clearSession('proj-123')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_CLEAR_SESSION, 'proj-123')
    })

    it('undoFile invokes crew:undo-file with projectId and filePath', () => {
      exposedApis.crew.undoFile('proj-123', 'src/app.ts')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.CREW_UNDO_FILE, 'proj-123', 'src/app.ts')
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_GET_TODAY, '2026-01-01')
    })

    it('getRange invokes tempo:get-range with from/to payload', () => {
      exposedApis.tempo.getRange('2026-01-01', '2026-01-07')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_GET_RANGE, {
        from: '2026-01-01',
        to: '2026-01-07',
      })
    })

    it('getWeek invokes tempo:get-week with weekStart/weekEnd payload', () => {
      exposedApis.tempo.getWeek('2026-01-05', '2026-01-11')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_GET_WEEK, {
        weekStart: '2026-01-05',
        weekEnd: '2026-01-11',
      })
    })

    it('createWorklog invokes tempo:create-worklog with payload', () => {
      const payload = { issueKey: 'PROJ-1', hours: 2, date: '2026-01-01', description: 'Testing' }
      exposedApis.tempo.createWorklog(payload)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_CREATE_WORKLOG, payload)
    })

    it('updateWorklog invokes tempo:update-worklog with worklogId and payload', () => {
      const payload = { hours: 3, description: 'Updated' }
      exposedApis.tempo.updateWorklog(123, payload)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_UPDATE_WORKLOG, {
        worklogId: 123,
        payload,
      })
    })

    it('deleteWorklog invokes tempo:delete-worklog with worklogId', () => {
      exposedApis.tempo.deleteWorklog(123)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_DELETE_WORKLOG, 123)
    })

    it('getAccounts invokes tempo:get-accounts', () => {
      exposedApis.tempo.getAccounts()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_GET_ACCOUNTS)
    })

    it('getProjectAccounts invokes tempo:get-project-accounts with projectKey', () => {
      exposedApis.tempo.getProjectAccounts('PROJ')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_GET_PROJECT_ACCOUNTS, 'PROJ')
    })

    it('getCapexMap invokes tempo:get-capex-map with issue keys', () => {
      exposedApis.tempo.getCapexMap(['PROJ-1', 'PROJ-2'])
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_GET_CAPEX_MAP, ['PROJ-1', 'PROJ-2'])
    })

    it('getSchedule invokes tempo:get-schedule with from/to payload', () => {
      exposedApis.tempo.getSchedule('2026-01-01', '2026-01-07')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TEMPO_GET_SCHEDULE, {
        from: '2026-01-01',
        to: '2026-01-07',
      })
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_GET_TODAY)
    })

    it('completeTask invokes todoist:complete-task with taskId', () => {
      exposedApis.todoist.completeTask('task-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_COMPLETE_TASK, 'task-1')
    })

    it('createTask invokes todoist:create-task with params', () => {
      const params = { content: 'Buy milk', due_date: '2026-01-01' }
      exposedApis.todoist.createTask(params)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_CREATE_TASK, params)
    })

    it('getUpcoming invokes todoist:get-upcoming with days', () => {
      exposedApis.todoist.getUpcoming(7)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_GET_UPCOMING, 7)
    })

    it('reopenTask invokes todoist:reopen-task with taskId', () => {
      exposedApis.todoist.reopenTask('task-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_REOPEN_TASK, 'task-1')
    })

    it('updateTask invokes todoist:update-task with taskId and params', () => {
      const params = { content: 'Buy bread', priority: 3 }
      exposedApis.todoist.updateTask('task-1', params)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_UPDATE_TASK, {
        taskId: 'task-1',
        params,
      })
    })

    it('deleteTask invokes todoist:delete-task with taskId', () => {
      exposedApis.todoist.deleteTask('task-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_DELETE_TASK, 'task-1')
    })

    it('getProjects invokes todoist:get-projects', () => {
      exposedApis.todoist.getProjects()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TODOIST_GET_PROJECTS)
    })
  })

  describe('finance bridge', () => {
    it('exposes finance API', () => {
      expect(exposedApis.finance).toBeDefined()
      expect(exposedApis.finance.fetchQuote).toBeTypeOf('function')
    })

    it('fetchQuote invokes finance:fetch-quote', () => {
      exposedApis.finance.fetchQuote('AAPL')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.FINANCE_FETCH_QUOTE, 'AAPL')
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.SLACK_NUDGE_AUTHOR, params)
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.FILESYSTEM_READ_DIR, '/tmp')
    })

    it('readFile invokes fs:read-file', () => {
      exposedApis.filesystem.readFile('/tmp/file.txt')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.FILESYSTEM_READ_FILE, '/tmp/file.txt')
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TERMINAL_SPAWN, { cwd: '/home' })
    })

    it('write sends terminal:write', () => {
      exposedApis.terminal.write('session-1', 'ls\n')
      expect(mockSend).toHaveBeenCalledWith(IPC_SEND.TERMINAL_WRITE, 'session-1', 'ls\n')
    })

    it('resize sends terminal:resize', () => {
      exposedApis.terminal.resize('session-1', 80, 24)
      expect(mockSend).toHaveBeenCalledWith(IPC_SEND.TERMINAL_RESIZE, 'session-1', 80, 24)
    })

    it('kill invokes terminal:kill', () => {
      exposedApis.terminal.kill('session-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TERMINAL_KILL, 'session-1')
    })

    it('attach invokes terminal:attach', () => {
      exposedApis.terminal.attach('session-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TERMINAL_ATTACH, 'session-1')
    })

    it('resolveRepoPath invokes terminal:resolve-repo-path', () => {
      exposedApis.terminal.resolveRepoPath('HemSoft', 'hs-buddy')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.TERMINAL_RESOLVE_REPO_PATH, {
        owner: 'HemSoft',
        repo: 'hs-buddy',
      })
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_LAUNCH, config)
    })

    it('stop invokes ralph:stop', () => {
      exposedApis.ralph.stop('run-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_STOP, 'run-1')
    })

    it('list invokes ralph:list', () => {
      exposedApis.ralph.list()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_LIST)
    })

    it('getStatus invokes ralph:get-status', () => {
      exposedApis.ralph.getStatus('run-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_GET_STATUS, 'run-1')
    })

    it('getConfig invokes ralph:get-config', () => {
      exposedApis.ralph.getConfig('agents')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_GET_CONFIG, 'agents')
    })

    it('getScriptsPath invokes ralph:get-scripts-path', () => {
      exposedApis.ralph.getScriptsPath()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_GET_SCRIPTS_PATH)
    })

    it('listTemplates invokes ralph:list-templates', () => {
      exposedApis.ralph.listTemplates()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_LIST_TEMPLATES)
    })

    it('selectDirectory invokes ralph:select-directory', () => {
      exposedApis.ralph.selectDirectory('D:\\repo')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.RALPH_SELECT_DIRECTORY, 'D:\\repo')
    })

    it('onStatusChange forwards only payload args to the callback', () => {
      const cb = vi.fn()
      const mockEvent = { sender: {} }
      exposedApis.ralph.onStatusChange(cb)

      const registeredWrapper = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === IPC_PUSH.RALPH_STATUS_UPDATE
      )?.[1] as (...args: unknown[]) => void

      registeredWrapper(mockEvent, 'run-1', { status: 'running' })
      expect(cb).toHaveBeenCalledWith('run-1', { status: 'running' })
    })

    it('onStatusChange registers a listener and offStatusChange removes it', () => {
      const cb = vi.fn()
      exposedApis.ralph.onStatusChange(cb)
      expect(mockOn).toHaveBeenCalledWith(IPC_PUSH.RALPH_STATUS_UPDATE, expect.any(Function))

      exposedApis.ralph.offStatusChange(cb)
      // The wrapper registered by on should be passed to off
      const registeredWrapper = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === IPC_PUSH.RALPH_STATUS_UPDATE
      )?.[1]
      expect(mockOff).toHaveBeenCalledWith(IPC_PUSH.RALPH_STATUS_UPDATE, registeredWrapper)
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_EXECUTE, args)
    })

    it('cancel invokes copilot:cancel', () => {
      exposedApis.copilot.cancel('result-1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_CANCEL, 'result-1')
    })

    it('listModels invokes copilot:list-models', () => {
      exposedApis.copilot.listModels('user1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_LIST_MODELS, 'user1')
    })

    it('chatAbort invokes copilot:chat-abort', () => {
      exposedApis.copilot.chatAbort()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_CHAT_ABORT)
    })

    it('chatSend invokes copilot:chat-send with args', () => {
      const args = {
        message: 'hello',
        context: 'repo context',
        conversationHistory: [{ role: 'user', content: 'hi' }],
        model: 'gpt-5',
        ghAccount: 'testuser',
      }
      exposedApis.copilot.chatSend(args)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_CHAT_SEND, args)
    })

    it('quickPrompt invokes copilot:quick-prompt with args', () => {
      const args = { prompt: 'Summarize this', model: 'gpt-5' }
      exposedApis.copilot.quickPrompt(args)
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_QUICK_PROMPT, args)
    })

    it('getActiveCount invokes copilot:active-count', () => {
      exposedApis.copilot.getActiveCount()
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_ACTIVE_COUNT)
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
      expect(mockInvoke).toHaveBeenCalledWith(IPC_INVOKE.COPILOT_SESSIONS_SCAN)
    })

    it('getSession invokes copilot-sessions:get-session', () => {
      exposedApis.copilotSessions.getSession('/path/to/session')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.COPILOT_SESSIONS_GET_SESSION,
        '/path/to/session'
      )
    })

    it('computeDigest invokes copilot-sessions:compute-digest', () => {
      exposedApis.copilotSessions.computeDigest('/path/to/session.json')
      expect(mockInvoke).toHaveBeenCalledWith(
        IPC_INVOKE.COPILOT_SESSIONS_COMPUTE_DIGEST,
        '/path/to/session.json'
      )
    })
  })
})
