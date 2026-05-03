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

export function registerRalphHandlers(win: BrowserWindow): void {
  // Wire real-time status push to renderer
  setStatusChangeCallback(run => {
    if (!win.isDestroyed()) {
      win.webContents.send('ralph:status-update', run)
    }
  })
  ipcMain.handle(
    'ralph:launch',
    ipcHandler(async (_event, config: RalphLaunchConfig) => {
      return launchLoop(config)
    })
  )

  ipcMain.handle(
    'ralph:stop',
    ipcHandler(async (_event, runId: string) => {
      return stopLoop(runId)
    })
  )

  ipcMain.handle(
    'ralph:list',
    ipcHandler(async () => {
      return listLoops()
    })
  )

  ipcMain.handle(
    'ralph:get-status',
    ipcHandler(async (_event, runId: string) => {
      return getLoopStatus(runId)
    })
  )

  ipcMain.handle(
    'ralph:get-config',
    ipcHandler(async (_event, configType: RalphConfigType) => {
      return getConfig(configType)
    })
  )

  ipcMain.handle(
    'ralph:get-scripts-path',
    ipcHandler(async () => {
      return getScriptsPath()
    })
  )

  ipcMain.handle(
    'ralph:list-templates',
    ipcHandler(async () => {
      return listTemplateScripts()
    })
  )

  ipcMain.handle(
    'ralph:select-directory',
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
