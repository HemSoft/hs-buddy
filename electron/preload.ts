import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
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
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)
})

contextBridge.exposeInMainWorld('github', {
  getCliToken: (username?: string) => ipcRenderer.invoke('github:get-cli-token', username),
  getActiveAccount: () => ipcRenderer.invoke('github:get-active-account'),
  switchAccount: (username: string) => ipcRenderer.invoke('github:switch-account', username),
  getCopilotUsage: (org: string, username?: string) =>
    ipcRenderer.invoke('github:get-copilot-usage', org, username),
  getCopilotQuota: (username: string) =>
    ipcRenderer.invoke('github:get-copilot-quota', username),
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
  createWorklog: (payload: { issueKey: string; hours: number; date: string; startTime?: string; description?: string; accountKey?: string }) =>
    ipcRenderer.invoke('tempo:create-worklog', payload),
  updateWorklog: (worklogId: number, payload: { hours?: number; startTime?: string; description?: string; accountKey?: string }) =>
    ipcRenderer.invoke('tempo:update-worklog', { worklogId, payload }),
  deleteWorklog: (worklogId: number) => ipcRenderer.invoke('tempo:delete-worklog', worklogId),
  getAccounts: () => ipcRenderer.invoke('tempo:get-accounts'),
  getProjectAccounts: (projectKey: string) => ipcRenderer.invoke('tempo:get-project-accounts', projectKey),
  getCapexMap: (issueKeys: string[]) => ipcRenderer.invoke('tempo:get-capex-map', issueKeys),
  getSchedule: (from: string, to: string) => ipcRenderer.invoke('tempo:get-schedule', { from, to }),
})

contextBridge.exposeInMainWorld('copilotSessions', {
  scan: () => ipcRenderer.invoke('copilot-sessions:scan'),
  getSession: (filePath: string) => ipcRenderer.invoke('copilot-sessions:get-session', filePath),
})

contextBridge.exposeInMainWorld('copilot', {
  execute: (args: { prompt: string; category?: string; metadata?: unknown; model?: string }) =>
    ipcRenderer.invoke('copilot:execute', args),
  cancel: (resultId: string) => ipcRenderer.invoke('copilot:cancel', resultId),
  getActiveCount: () => ipcRenderer.invoke('copilot:active-count'),
  listModels: (ghAccount?: string) => ipcRenderer.invoke('copilot:list-models', ghAccount),
  chatSend: (args: { message: string; context: string; conversationHistory: Array<{ role: string; content: string }>; model?: string; ghAccount?: string }) =>
    ipcRenderer.invoke('copilot:chat-send', args),
  chatAbort: () => ipcRenderer.invoke('copilot:chat-abort'),
})
