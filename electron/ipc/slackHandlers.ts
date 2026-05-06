import { ipcMain } from 'electron'
import { nudgePRAuthor } from '../services/slackClient'
import { ipcHandler } from './ipcHandler'
import { IPC_INVOKE } from '../../src/ipc/contracts'

export function registerSlackHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.SLACK_NUDGE_AUTHOR,
    ipcHandler(async (_event, params: { githubLogin: string; prTitle: string; prUrl: string }) => {
      const { githubLogin, prTitle, prUrl } = params
      if (!githubLogin || !prTitle || !prUrl) {
        return { success: false, error: 'Missing required parameters' }
      }
      return nudgePRAuthor(githubLogin, prTitle, prUrl)
    })
  )
}
