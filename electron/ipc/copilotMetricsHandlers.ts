import { app, ipcMain } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import {
  normalizeCopilotEnterpriseUsersSnapshot,
  parseCopilotEnterpriseUsersContent,
} from '../../src/utils/copilotEnterpriseUsers'
import type { CopilotEnterpriseUsersResponse } from '../../src/types/copilotEnterpriseUsers'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'

const COPILOT_METRICS_FILE_ENV = 'COPILOT_METRICS_FILE'

export function resolveCopilotMetricsFile(): string {
  const configuredPath = process.env[COPILOT_METRICS_FILE_ENV]?.trim()
  if (configuredPath) return resolve(configuredPath)

  return join(app.getPath('userData'), 'copilot-metrics.json')
}

export function registerCopilotMetricsHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_COPILOT_ENTERPRISE_USERS,
    async (): Promise<CopilotEnterpriseUsersResponse> => {
      try {
        const metricsFile = resolveCopilotMetricsFile()
        const [fileStats, content] = await Promise.all([
          stat(metricsFile),
          readFile(metricsFile, 'utf-8'),
        ])
        const snapshot = normalizeCopilotEnterpriseUsersSnapshot(
          parseCopilotEnterpriseUsersContent(content),
          {
            sourceFile: metricsFile,
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
