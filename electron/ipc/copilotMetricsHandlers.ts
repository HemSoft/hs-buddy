import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import {
  normalizeCopilotEnterpriseUsersSnapshot,
  parseCopilotEnterpriseUsersContent,
} from '../../src/utils/copilotEnterpriseUsers'
import type { CopilotEnterpriseUsersResponse } from '../../src/types/copilotEnterpriseUsers'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'
import { readFileSnapshot } from '../services/fileSnapshots'

const COPILOT_METRICS_FILE_ENV = 'COPILOT_METRICS_FILE'
const DEFAULT_COPILOT_METRICS_FILE = 'D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json'

export function resolveCopilotMetricsFile(): string {
  const configuredPath = process.env[COPILOT_METRICS_FILE_ENV]?.trim()
  if (configuredPath) return resolve(configuredPath)

  return resolve(DEFAULT_COPILOT_METRICS_FILE)
}

export function registerCopilotMetricsHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.GITHUB_GET_COPILOT_ENTERPRISE_USERS,
    async (): Promise<CopilotEnterpriseUsersResponse> => {
      try {
        const metricsFile = resolveCopilotMetricsFile()
        const { stats: fileStats, data } = await readFileSnapshot(metricsFile)
        const snapshot = normalizeCopilotEnterpriseUsersSnapshot(
          parseCopilotEnterpriseUsersContent(data.toString('utf8')),
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
