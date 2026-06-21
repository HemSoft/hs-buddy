import { ipcMain } from 'electron'
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
import type { CreateWorklogPayload, UpdateWorklogPayload } from '../../src/types/tempo'
import { formatDateKey } from '../../src/utils/dateUtils'
import { ipcHandler } from './ipcHandler'
import { IPC_INVOKE } from '../../src/ipc/contracts'

export function registerTempoHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.TEMPO_GET_TODAY,
    ipcHandler(async (_event, date?: string) => {
      const d = date || formatDateKey(new Date())
      return getWorklogsForDate(d)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_GET_RANGE,
    ipcHandler(async (_event, args: { from: string; to: string }) => {
      return getWorklogsForRange(args.from, args.to)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_GET_WEEK,
    ipcHandler(async (_event, args: { weekStart: string; weekEnd: string }) => {
      return getWeekSummary(args.weekStart, args.weekEnd)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_CREATE_WORKLOG,
    ipcHandler(async (_event, payload: CreateWorklogPayload) => {
      return createWorklog(payload)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_UPDATE_WORKLOG,
    ipcHandler(async (_event, args: { worklogId: number; payload: UpdateWorklogPayload }) => {
      return updateWorklog(args.worklogId, args.payload)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_DELETE_WORKLOG,
    ipcHandler(async (_event, worklogId: number) => {
      return deleteWorklog(worklogId)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_GET_ACCOUNTS,
    ipcHandler(async () => {
      return getAccounts()
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_GET_PROJECT_ACCOUNTS,
    ipcHandler(async (_event, projectKey: string) => {
      return getProjectAccountLinks(projectKey)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_GET_CAPEX_MAP,
    ipcHandler(async (_event, issueKeys: string[]) => {
      return getCapexMap(issueKeys)
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TEMPO_GET_SCHEDULE,
    ipcHandler(async (_event, args: { from: string; to: string }) => {
      return getUserSchedule(args.from, args.to)
    })
  )
}
