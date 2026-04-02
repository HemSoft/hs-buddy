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

export function registerTodoistHandlers(): void {
  ipcMain.handle(
    'todoist:get-upcoming',
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
    'todoist:get-today',
    ipcHandler(async () => {
      const tasks = await fetchTasks('today')
      return { success: true, data: tasks }
    })
  )

  ipcMain.handle(
    'todoist:complete-task',
    ipcHandler(async (_event, taskId: string) => {
      await completeTask(taskId)
      return { success: true }
    })
  )

  ipcMain.handle(
    'todoist:reopen-task',
    ipcHandler(async (_event, taskId: string) => {
      await reopenTask(taskId)
      return { success: true }
    })
  )

  ipcMain.handle(
    'todoist:create-task',
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
    'todoist:update-task',
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
    'todoist:delete-task',
    ipcHandler(async (_event, taskId: string) => {
      await deleteTask(taskId)
      return { success: true }
    })
  )

  ipcMain.handle(
    'todoist:get-projects',
    ipcHandler(async () => {
      const projects = await fetchProjects()
      return { success: true, data: projects }
    })
  )
}
