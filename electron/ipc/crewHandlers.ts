import { ipcMain, type BrowserWindow } from 'electron'
import {
  addProjectFromPicker,
  listProjects,
  removeProject,
  getSession,
  createOrGetSession,
  addMessageToSession,
  updateSessionStatus,
  updateSessionChangedFiles,
  clearSession,
  undoFile,
} from '../services/crewService'

export function registerCrewHandlers(win: BrowserWindow): void {
  ipcMain.handle('crew:add-project', async () => {
    return addProjectFromPicker(win)
  })

  ipcMain.handle('crew:list-projects', () => {
    return listProjects()
  })

  ipcMain.handle('crew:remove-project', (_event, projectId: string) => {
    return removeProject(projectId)
  })

  ipcMain.handle('crew:get-session', (_event, projectId: string) => {
    return getSession(projectId)
  })

  ipcMain.handle('crew:create-session', (_event, projectId: string) => {
    return createOrGetSession(projectId)
  })

  ipcMain.handle(
    'crew:add-message',
    (_event, projectId: string, message: { role: string; content: string; timestamp: number }) => {
      return addMessageToSession(projectId, message as Parameters<typeof addMessageToSession>[1])
    }
  )

  ipcMain.handle('crew:update-session-status', (_event, projectId: string, status: string) => {
    return updateSessionStatus(projectId, status as 'idle' | 'active' | 'error')
  })

  ipcMain.handle(
    'crew:update-changed-files',
    (_event, projectId: string, changedFiles: unknown[]) => {
      return updateSessionChangedFiles(
        projectId,
        changedFiles as Parameters<typeof updateSessionChangedFiles>[1]
      )
    }
  )

  ipcMain.handle('crew:clear-session', (_event, projectId: string) => {
    return clearSession(projectId)
  })

  ipcMain.handle('crew:undo-file', (_event, projectId: string, filePath: string) => {
    return undoFile(projectId, filePath)
  })
}
