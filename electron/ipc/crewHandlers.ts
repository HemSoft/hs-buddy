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
import { IPC_INVOKE } from '../../src/ipc/contracts'

export function registerCrewHandlers(win: BrowserWindow): void {
  ipcMain.handle(IPC_INVOKE.CREW_ADD_PROJECT, async () => {
    return addProjectFromPicker(win)
  })

  ipcMain.handle(IPC_INVOKE.CREW_LIST_PROJECTS, () => {
    return listProjects()
  })

  ipcMain.handle(IPC_INVOKE.CREW_REMOVE_PROJECT, (_event, projectId: string) => {
    return removeProject(projectId)
  })

  ipcMain.handle(IPC_INVOKE.CREW_GET_SESSION, (_event, projectId: string) => {
    return getSession(projectId)
  })

  ipcMain.handle(IPC_INVOKE.CREW_CREATE_SESSION, (_event, projectId: string) => {
    return createOrGetSession(projectId)
  })

  ipcMain.handle(
    IPC_INVOKE.CREW_ADD_MESSAGE,
    (_event, projectId: string, message: { role: string; content: string; timestamp: number }) => {
      return addMessageToSession(projectId, message as Parameters<typeof addMessageToSession>[1])
    }
  )

  ipcMain.handle(
    IPC_INVOKE.CREW_UPDATE_SESSION_STATUS,
    (_event, projectId: string, status: string) => {
      return updateSessionStatus(projectId, status as 'idle' | 'active' | 'error')
    }
  )

  ipcMain.handle(
    IPC_INVOKE.CREW_UPDATE_CHANGED_FILES,
    (_event, projectId: string, changedFiles: unknown[]) => {
      return updateSessionChangedFiles(
        projectId,
        changedFiles as Parameters<typeof updateSessionChangedFiles>[1]
      )
    }
  )

  ipcMain.handle(IPC_INVOKE.CREW_CLEAR_SESSION, (_event, projectId: string) => {
    return clearSession(projectId)
  })

  ipcMain.handle(IPC_INVOKE.CREW_UNDO_FILE, (_event, projectId: string, filePath: string) => {
    return undoFile(projectId, filePath)
  })
}
