/**
 * Ralph Loops IPC Handlers — exposes ralph service to the renderer.
 * Follows crewHandlers.ts pattern with win param for push events.
 */

import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { ipcHandler } from './ipcHandler'
import {
  launchLoop,
  stopLoop,
  listLoops,
  getLoopStatus,
  getConfig,
  getScriptsPath,
  listTemplateScripts,
  setStatusChangeCallback,
} from '../services/ralphService'
import type { RalphLaunchConfig, RalphConfigType } from '../../src/types/ralph'
import { IPC_INVOKE, IPC_PUSH } from '../../src/ipc/contracts'

export function registerRalphHandlers(win: BrowserWindow): void {
  // Wire real-time status push to renderer
  setStatusChangeCallback(run => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_PUSH.RALPH_STATUS_UPDATE, run)
    }
  })
  ipcMain.handle(
    IPC_INVOKE.RALPH_LAUNCH,
    ipcHandler(async (_event, config: RalphLaunchConfig) => {
      return launchLoop(config)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.RALPH_STOP,
    ipcHandler(async (_event, runId: string) => {
      return stopLoop(runId)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.RALPH_LIST,
    ipcHandler(async () => {
      return listLoops()
    })
  )

  ipcMain.handle(
    IPC_INVOKE.RALPH_GET_STATUS,
    ipcHandler(async (_event, runId: string) => {
      return getLoopStatus(runId)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.RALPH_GET_CONFIG,
    ipcHandler(async (_event, configType: RalphConfigType) => {
      return getConfig(configType)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.RALPH_GET_SCRIPTS_PATH,
    ipcHandler(async () => {
      return getScriptsPath()
    })
  )

  ipcMain.handle(
    IPC_INVOKE.RALPH_LIST_TEMPLATES,
    ipcHandler(async () => {
      return listTemplateScripts()
    })
  )

  ipcMain.handle(
    IPC_INVOKE.RALPH_SELECT_DIRECTORY,
    ipcHandler(async (_event: Electron.IpcMainInvokeEvent, defaultPath?: string) => {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Repository',
        ...(defaultPath && { defaultPath }),
      })
      return result.canceled ? null : result.filePaths[0]
    })
  )
}
