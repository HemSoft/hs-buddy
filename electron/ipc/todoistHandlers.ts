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
import { getErrorMessage } from '../utils'

export function registerTodoistHandlers(): void {
  ipcMain.handle('todoist:get-upcoming', async (_event, days?: number) => {
    try {
      const safeDays = Math.max(1, Math.min(days ?? 7, 30))
      const grouped = await fetchUpcoming(safeDays)
      // Convert Map to plain object for IPC serialization
      const result: Record<string, unknown[]> = {}
      for (const [date, tasks] of grouped) result[date] = tasks
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('todoist:get-today', async () => {
    try {
      const tasks = await fetchTasks('today')
      return { success: true, data: tasks }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('todoist:complete-task', async (_event, taskId: string) => {
    try {
      await completeTask(taskId)
      return { success: true }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('todoist:reopen-task', async (_event, taskId: string) => {
    try {
      await reopenTask(taskId)
      return { success: true }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(
    'todoist:create-task',
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
      try {
        if (!params.content?.trim()) {
          return { success: false, error: 'Task content cannot be empty' }
        }
        const task = await createTask({ ...params, content: params.content.trim() })
        return { success: true, data: task }
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle(
    'todoist:update-task',
    async (
      _event,
      args: {
        taskId: string
        params: { content?: string; due_date?: string; priority?: number; description?: string }
      }
    ) => {
      try {
        const task = await updateTask(args.taskId, args.params)
        return { success: true, data: task }
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle('todoist:delete-task', async (_event, taskId: string) => {
    try {
      await deleteTask(taskId)
      return { success: true }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('todoist:get-projects', async () => {
    try {
      const projects = await fetchProjects()
      return { success: true, data: projects }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
