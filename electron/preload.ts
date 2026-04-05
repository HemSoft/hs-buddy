import { contextBridge, ipcRenderer } from 'electron'

// Map renderer-side listener references to the wrapper registered with ipcRenderer
// so that off() can remove the correct function.
const ipcListenerWrappers = new Map<
  string,
  Map<(...args: unknown[]) => void, (...args: unknown[]) => void>
>()

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    const wrapper = (event: Electron.IpcRendererEvent, ...rest: unknown[]) =>
      listener(event, ...rest)
    if (!ipcListenerWrappers.has(channel)) ipcListenerWrappers.set(channel, new Map())
    ipcListenerWrappers.get(channel)!.set(listener, wrapper)
    return ipcRenderer.on(channel, wrapper)
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, listener] = args
    const channelMap = ipcListenerWrappers.get(channel)
    const wrapper = channelMap?.get(listener)
    if (wrapper) {
      channelMap!.delete(listener)
      return ipcRenderer.off(channel, wrapper as Parameters<typeof ipcRenderer.off>[1])
    }
    // No wrapper found — listener was never registered through this bridge or already removed.
    // Attempting ipcRenderer.off with the raw listener would be a silent no-op, so skip it.
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('shell', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  openInAppBrowser: (url: string, title?: string) =>
    ipcRenderer.invoke('shell:open-in-app-browser', url, title),
  fetchPageTitle: (url: string) => ipcRenderer.invoke('shell:fetch-page-title', url),
})

contextBridge.exposeInMainWorld('github', {
  getCliToken: (username?: string) => ipcRenderer.invoke('github:get-cli-token', username),
  getActiveAccount: () => ipcRenderer.invoke('github:get-active-account'),
  switchAccount: (username: string) => ipcRenderer.invoke('github:switch-account', username),
  getCopilotUsage: (org: string, username?: string) =>
    ipcRenderer.invoke('github:get-copilot-usage', org, username),
  getCopilotQuota: (username: string) => ipcRenderer.invoke('github:get-copilot-quota', username),
  getCopilotBudget: (org: string, username?: string) =>
    ipcRenderer.invoke('github:get-copilot-budget', org, username),
  getCopilotMemberUsage: (org: string, memberLogin: string, username?: string) =>
    ipcRenderer.invoke('github:get-copilot-member-usage', org, memberLogin, username),
  getUserPremiumRequests: (org: string, memberLogin: string, username?: string) =>
    ipcRenderer.invoke('github:get-user-premium-requests', org, memberLogin, username),
})

contextBridge.exposeInMainWorld('crew', {
  addProject: () => ipcRenderer.invoke('crew:add-project'),
  listProjects: () => ipcRenderer.invoke('crew:list-projects'),
  removeProject: (projectId: string) => ipcRenderer.invoke('crew:remove-project', projectId),
  getSession: (projectId: string) => ipcRenderer.invoke('crew:get-session', projectId),
  createSession: (projectId: string) => ipcRenderer.invoke('crew:create-session', projectId),
  addMessage: (projectId: string, message: { role: string; content: string; timestamp: number }) =>
    ipcRenderer.invoke('crew:add-message', projectId, message),
  updateSessionStatus: (projectId: string, status: string) =>
    ipcRenderer.invoke('crew:update-session-status', projectId, status),
  updateChangedFiles: (projectId: string, files: unknown[]) =>
    ipcRenderer.invoke('crew:update-changed-files', projectId, files),
  clearSession: (projectId: string) => ipcRenderer.invoke('crew:clear-session', projectId),
  undoFile: (projectId: string, filePath: string) =>
    ipcRenderer.invoke('crew:undo-file', projectId, filePath),
})

contextBridge.exposeInMainWorld('tempo', {
  getToday: (date?: string) => ipcRenderer.invoke('tempo:get-today', date),
  getRange: (from: string, to: string) => ipcRenderer.invoke('tempo:get-range', { from, to }),
  getWeek: (weekStart: string, weekEnd: string) =>
    ipcRenderer.invoke('tempo:get-week', { weekStart, weekEnd }),
  createWorklog: (payload: {
    issueKey: string
    hours: number
    date: string
    startTime?: string
    description?: string
    accountKey?: string
  }) => ipcRenderer.invoke('tempo:create-worklog', payload),
  updateWorklog: (
    worklogId: number,
    payload: { hours?: number; startTime?: string; description?: string; accountKey?: string }
  ) => ipcRenderer.invoke('tempo:update-worklog', { worklogId, payload }),
  deleteWorklog: (worklogId: number) => ipcRenderer.invoke('tempo:delete-worklog', worklogId),
  getAccounts: () => ipcRenderer.invoke('tempo:get-accounts'),
  getProjectAccounts: (projectKey: string) =>
    ipcRenderer.invoke('tempo:get-project-accounts', projectKey),
  getCapexMap: (issueKeys: string[]) => ipcRenderer.invoke('tempo:get-capex-map', issueKeys),
  getSchedule: (from: string, to: string) => ipcRenderer.invoke('tempo:get-schedule', { from, to }),
})

contextBridge.exposeInMainWorld('copilotSessions', {
  scan: () => ipcRenderer.invoke('copilot-sessions:scan'),
  getSession: (filePath: string) => ipcRenderer.invoke('copilot-sessions:get-session', filePath),
  computeDigest: (filePath: string) =>
    ipcRenderer.invoke('copilot-sessions:compute-digest', filePath),
})

contextBridge.exposeInMainWorld('todoist', {
  getUpcoming: (days?: number) => ipcRenderer.invoke('todoist:get-upcoming', days),
  getToday: () => ipcRenderer.invoke('todoist:get-today'),
  completeTask: (taskId: string) => ipcRenderer.invoke('todoist:complete-task', taskId),
  reopenTask: (taskId: string) => ipcRenderer.invoke('todoist:reopen-task', taskId),
  createTask: (params: {
    content: string
    due_date?: string
    priority?: number
    project_id?: string
    description?: string
  }) => ipcRenderer.invoke('todoist:create-task', params),
  updateTask: (
    taskId: string,
    params: { content?: string; due_date?: string; priority?: number; description?: string }
  ) => ipcRenderer.invoke('todoist:update-task', { taskId, params }),
  deleteTask: (taskId: string) => ipcRenderer.invoke('todoist:delete-task', taskId),
  getProjects: () => ipcRenderer.invoke('todoist:get-projects'),
})

contextBridge.exposeInMainWorld('copilot', {
  execute: (args: { prompt: string; category?: string; metadata?: unknown; model?: string }) =>
    ipcRenderer.invoke('copilot:execute', args),
  cancel: (resultId: string) => ipcRenderer.invoke('copilot:cancel', resultId),
  getActiveCount: () => ipcRenderer.invoke('copilot:active-count'),
  listModels: (ghAccount?: string) => ipcRenderer.invoke('copilot:list-models', ghAccount),
  chatSend: (args: {
    message: string
    context: string
    conversationHistory: Array<{ role: string; content: string }>
    model?: string
    ghAccount?: string
  }) => ipcRenderer.invoke('copilot:chat-send', args),
  chatAbort: () => ipcRenderer.invoke('copilot:chat-abort'),
  quickPrompt: (args: { prompt: string; model?: string }) =>
    ipcRenderer.invoke('copilot:quick-prompt', args) as Promise<string>,
})
