import type { JobId } from '../../../hooks/useConvex'

export type { JobId }

export interface Job {
  _id: JobId
  _creationTime: number
  name: string
  description?: string
  workerType: 'exec' | 'ai' | 'skill'
  config: {
    command?: string
    cwd?: string
    timeout?: number
    shell?: 'powershell' | 'bash' | 'cmd'
    prompt?: string
    model?: string
    maxTokens?: number
    temperature?: number
    skillName?: string
    action?: string
    params?: unknown
  }
  inputParams?: {
    name: string
    type: 'string' | 'number' | 'boolean'
    defaultValue?: unknown
    required: boolean
    description?: string
  }[]
  createdAt: number
  updatedAt: number
}
