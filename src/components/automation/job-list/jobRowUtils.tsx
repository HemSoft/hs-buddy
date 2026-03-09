import { Brain, Terminal, Zap } from 'lucide-react'
import type { Job } from './types'

export function getWorkerIcon(workerType: 'exec' | 'ai' | 'skill', size = 16) {
  switch (workerType) {
    case 'exec':
      return <Terminal size={size} className="worker-icon worker-exec" />
    case 'ai':
      return <Brain size={size} className="worker-icon worker-ai" />
    case 'skill':
      return <Zap size={size} className="worker-icon worker-skill" />
  }
}

export function getConfigPreview(job: Job): string {
  switch (job.workerType) {
    case 'exec':
      return job.config.command || 'No command'
    case 'ai':
      if (job.config.prompt) {
        return job.config.prompt.length > 50
          ? job.config.prompt.substring(0, 50) + '...'
          : job.config.prompt
      }
      return 'No prompt'
    case 'skill':
      if (job.config.skillName) {
        return job.config.action
          ? `${job.config.skillName}:${job.config.action}`
          : job.config.skillName
      }
      return 'No skill'
  }
}
