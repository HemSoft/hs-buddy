import { ipcMain } from 'electron'
import { nudgePRAuthor } from '../services/slackClient'
import { ipcHandler } from './ipcHandler'

export function registerSlackHandlers(): void {
  ipcMain.handle(
    'slack:nudge-author',
    ipcHandler(async (_event, params: { githubLogin: string; prTitle: string; prUrl: string }) => {
      const { githubLogin, prTitle, prUrl } = params
      if (!githubLogin || !prTitle || !prUrl) {
        return { success: false, error: 'Missing required parameters' }
      }
      return nudgePRAuthor(githubLogin, prTitle, prUrl)
    })
  )
}
