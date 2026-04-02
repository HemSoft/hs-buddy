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
import { formatDateKey } from '../utils'
import type { CreateWorklogPayload, UpdateWorklogPayload } from '../../src/types/tempo'
import { ipcHandler } from './ipcHandler'

export function registerTempoHandlers(): void {
  ipcMain.handle(
    'tempo:get-today',
    ipcHandler(async (_event, date?: string) => {
      const d = date || formatDateKey(new Date())
      return await getWorklogsForDate(d)
    })
  )

  ipcMain.handle(
    'tempo:get-range',
    ipcHandler(async (_event, args: { from: string; to: string }) => {
      return await getWorklogsForRange(args.from, args.to)
    })
  )

  ipcMain.handle(
    'tempo:get-week',
    ipcHandler(async (_event, args: { weekStart: string; weekEnd: string }) => {
      return await getWeekSummary(args.weekStart, args.weekEnd)
    })
  )

  ipcMain.handle(
    'tempo:create-worklog',
    ipcHandler(async (_event, payload: CreateWorklogPayload) => {
      return await createWorklog(payload)
    })
  )

  ipcMain.handle(
    'tempo:update-worklog',
    ipcHandler(async (_event, args: { worklogId: number; payload: UpdateWorklogPayload }) => {
      return await updateWorklog(args.worklogId, args.payload)
    })
  )

  ipcMain.handle(
    'tempo:delete-worklog',
    ipcHandler(async (_event, worklogId: number) => {
      return await deleteWorklog(worklogId)
    })
  )

  ipcMain.handle(
    'tempo:get-accounts',
    ipcHandler(async () => {
      return await getAccounts()
    })
  )

  ipcMain.handle(
    'tempo:get-project-accounts',
    ipcHandler(async (_event, projectKey: string) => {
      return await getProjectAccountLinks(projectKey)
    })
  )

  ipcMain.handle(
    'tempo:get-capex-map',
    ipcHandler(async (_event, issueKeys: string[]) => {
      return await getCapexMap(issueKeys)
    })
  )

  ipcMain.handle(
    'tempo:get-schedule',
    ipcHandler(async (_event, args: { from: string; to: string }) => {
      return await getUserSchedule(args.from, args.to)
    })
  )
}
