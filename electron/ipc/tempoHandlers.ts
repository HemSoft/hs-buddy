import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  getWorklogsForDate,
  getWorklogsForRange,
  getWeekSummary,
  createWorklog,
  updateWorklog,
  deleteWorklog,
  getAccounts,
  getProjectAccountLinks,
  getCapexMap,
  getUserSchedule,
} from '../services/tempoClient'
import { getErrorMessage, formatDateKey } from '../utils'
import type { CreateWorklogPayload, UpdateWorklogPayload } from '../../src/types/tempo'

function tempoHandler<A extends unknown[], T>(
  fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<T>
) {
  return async (
    event: IpcMainInvokeEvent,
    ...args: A
  ): Promise<T | { success: false; error: string }> => {
    try {
      return await fn(event, ...args)
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  }
}

export function registerTempoHandlers(): void {
  ipcMain.handle(
    'tempo:get-today',
    tempoHandler(async (_event, date?: string) => {
      const d = date || formatDateKey(new Date())
      return await getWorklogsForDate(d)
    })
  )

  ipcMain.handle(
    'tempo:get-range',
    tempoHandler(async (_event, args: { from: string; to: string }) => {
      return await getWorklogsForRange(args.from, args.to)
    })
  )

  ipcMain.handle(
    'tempo:get-week',
    tempoHandler(async (_event, args: { weekStart: string; weekEnd: string }) => {
      return await getWeekSummary(args.weekStart, args.weekEnd)
    })
  )

  ipcMain.handle(
    'tempo:create-worklog',
    tempoHandler(async (_event, payload: CreateWorklogPayload) => {
      return await createWorklog(payload)
    })
  )

  ipcMain.handle(
    'tempo:update-worklog',
    tempoHandler(async (_event, args: { worklogId: number; payload: UpdateWorklogPayload }) => {
      return await updateWorklog(args.worklogId, args.payload)
    })
  )

  ipcMain.handle(
    'tempo:delete-worklog',
    tempoHandler(async (_event, worklogId: number) => {
      return await deleteWorklog(worklogId)
    })
  )

  ipcMain.handle(
    'tempo:get-accounts',
    tempoHandler(async () => {
      return await getAccounts()
    })
  )

  ipcMain.handle(
    'tempo:get-project-accounts',
    tempoHandler(async (_event, projectKey: string) => {
      return await getProjectAccountLinks(projectKey)
    })
  )

  ipcMain.handle(
    'tempo:get-capex-map',
    tempoHandler(async (_event, issueKeys: string[]) => {
      return await getCapexMap(issueKeys)
    })
  )

  ipcMain.handle(
    'tempo:get-schedule',
    tempoHandler(async (_event, args: { from: string; to: string }) => {
      return await getUserSchedule(args.from, args.to)
    })
  )
}
