import { ipcMain } from 'electron'
import {
  fetchUpcoming,
  fetchTasks,
  fetchProjects,
  completeTask,
  reopenTask,
  createTask,
  updateTask,
  deleteTask,
} from '../services/todoistClient'
import { ipcHandler } from './ipcHandler'
import { IPC_INVOKE } from '../../src/ipc/contracts'

export function registerTodoistHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.TODOIST_GET_UPCOMING,
    ipcHandler(async (_event, days?: number) => {
      const safeDays = Math.max(1, Math.min(days ?? 7, 30))
      const grouped = await fetchUpcoming(safeDays)
      // Convert Map to plain object for IPC serialization
      const result: Record<string, unknown[]> = {}
      for (const [date, tasks] of grouped) result[date] = tasks
      return { success: true, data: result }
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TODOIST_GET_TODAY,
    ipcHandler(async () => {
      const tasks = await fetchTasks('today')
      return { success: true, data: tasks }
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TODOIST_COMPLETE_TASK,
    ipcHandler(async (_event, taskId: string) => {
      await completeTask(taskId)
      return { success: true }
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TODOIST_REOPEN_TASK,
    ipcHandler(async (_event, taskId: string) => {
      await reopenTask(taskId)
      return { success: true }
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TODOIST_CREATE_TASK,
    ipcHandler(
      async (
        _event,
        params: {
          content: string
          due_date?: string
          priority?: number
          project_id?: string
          description?: string
        }
      ) => {
        if (!params.content?.trim()) {
          return { success: false, error: 'Task content cannot be empty' }
        }
        const task = await createTask({ ...params, content: params.content.trim() })
        return { success: true, data: task }
      }
    )
  )

  ipcMain.handle(
    IPC_INVOKE.TODOIST_UPDATE_TASK,
    ipcHandler(
      async (
        _event,
        args: {
          taskId: string
          params: { content?: string; due_date?: string; priority?: number; description?: string }
        }
      ) => {
        const task = await updateTask(args.taskId, args.params)
        return { success: true, data: task }
      }
    )
  )

  ipcMain.handle(
    IPC_INVOKE.TODOIST_DELETE_TASK,
    ipcHandler(async (_event, taskId: string) => {
      await deleteTask(taskId)
      return { success: true }
    })
  )

  ipcMain.handle(
    IPC_INVOKE.TODOIST_GET_PROJECTS,
    ipcHandler(async () => {
      const projects = await fetchProjects()
      return { success: true, data: projects }
    })
  )
}
