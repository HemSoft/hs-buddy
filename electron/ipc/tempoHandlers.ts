import { ipcMain } from 'electron'
import {
  getWorklogsForDate,
  getWorklogsForRange,
  getWeekSummary,
  createWorklog,
  updateWorklog,
  deleteWorklog,
  getAccounts,
} from '../services/tempoClient'
import { getErrorMessage, formatDateKey } from '../utils'
import type { CreateWorklogPayload, UpdateWorklogPayload } from '../../src/types/tempo'

export function registerTempoHandlers(): void {
  ipcMain.handle('tempo:get-today', async (_event, date?: string) => {
    try {
      const d = date || formatDateKey(new Date())
      return await getWorklogsForDate(d)
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(
    'tempo:get-range',
    async (_event, args: { from: string; to: string }) => {
      try {
        return await getWorklogsForRange(args.from, args.to)
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle(
    'tempo:get-week',
    async (_event, args: { weekStart: string; weekEnd: string }) => {
      try {
        return await getWeekSummary(args.weekStart, args.weekEnd)
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle('tempo:create-worklog', async (_event, payload: CreateWorklogPayload) => {
    try {
      return await createWorklog(payload)
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(
    'tempo:update-worklog',
    async (_event, args: { worklogId: number; payload: UpdateWorklogPayload }) => {
      try {
        return await updateWorklog(args.worklogId, args.payload)
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle('tempo:delete-worklog', async (_event, worklogId: number) => {
    try {
      return await deleteWorklog(worklogId)
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('tempo:get-accounts', async () => {
    try {
      return await getAccounts()
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
