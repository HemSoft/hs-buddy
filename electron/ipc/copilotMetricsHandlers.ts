import { ipcMain } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import {
  normalizeCopilotEnterpriseUsersSnapshot,
  parseCopilotEnterpriseUsersContent,
} from '../../src/utils/copilotEnterpriseUsers'
import type { CopilotEnterpriseUsersResponse } from '../../src/types/copilotEnterpriseUsers'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'

const COPILOT_METRICS_FILE = 'D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json'

export function registerCopilotMetricsHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_COPILOT_ENTERPRISE_USERS,
    async (): Promise<CopilotEnterpriseUsersResponse> => {
      try {
        const [fileStats, content] = await Promise.all([
          stat(COPILOT_METRICS_FILE),
          readFile(COPILOT_METRICS_FILE, 'utf-8'),
        ])
        const snapshot = normalizeCopilotEnterpriseUsersSnapshot(
          parseCopilotEnterpriseUsersContent(content),
          {
            sourceFile: COPILOT_METRICS_FILE,
            fileLastWriteTime: fileStats.mtime.toISOString(),
          }
        )

        return { success: true, data: snapshot }
      } catch (error: unknown) {
        return {
          success: false,
          error: getErrorMessageWithFallback(error, 'Failed to read Copilot Enterprise users file'),
        }
      }
    }
  )
}
